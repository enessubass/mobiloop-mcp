import { McpTool, ToolContext, ToolResponse, jsonResponse } from "../types.js";
import { arraySchema, booleanSchema, numberSchema, objectSchema, stringSchema } from "../schema.js";
import { appiumTools } from "./appium.js";
import { buildTools } from "./build.js";
import { deviceTools } from "./device.js";
import { flowTools } from "./flow.js";
import { loopTools } from "./loop.js";
import { verifyTools } from "./verify.js";
import { asObject, optionalBoolean, optionalNumber, optionalString, requireString } from "../utils/validation.js";

export function orchestratorTools(): McpTool[] {
  const callableTools = [...buildTools(), ...deviceTools(), ...appiumTools(), ...verifyTools(), ...flowTools(), ...loopTools()];
  const byName = new Map(callableTools.map((tool) => [tool.name, tool]));

  return [
    {
      name: "orchestrator.run_android_validation_loop",
      description: "Run build -> install -> Appium scripted test -> verification -> evidence -> loop record for Android.",
      inputSchema: objectSchema(
        {
          goal: stringSchema,
          kind: stringSchema,
          packageName: stringSchema,
          apkPath: stringSchema,
          serial: stringSchema,
          avdName: stringSchema,
          appiumCapabilities: { type: "object", additionalProperties: true },
          appiumSteps: arraySchema({ type: "object", additionalProperties: true }),
          expectedTexts: arraySchema(stringSchema),
          apiChecks: arraySchema({ type: "object", additionalProperties: true }),
          installDependencies: booleanSchema,
          runLint: booleanSchema,
          runUnitTests: booleanSchema,
          buildDebugApk: booleanSchema,
          clearAppData: booleanSchema,
          collectEvidence: booleanSchema,
          flowReplayBeforeSteps: booleanSchema,
          flowReplayTestName: stringSchema,
          flowReplayTargetCheckpointId: stringSchema,
          flowReplayMinimumScore: numberSchema,
          maxTestIterations: numberSchema,
          iterationOffset: numberSchema
        },
        ["goal"]
      ),
      async handler(input, context) {
        const args = asObject(input);
        const goal = requireString(args, "goal");
        const started = Date.now();
        const maxIterations = Math.max(
          1,
          Math.min(optionalNumber(args, "maxTestIterations") ?? context.config.maxTestIterations, 20)
        );
        const iterationOffset = optionalNumber(args, "iterationOffset") ?? 0;
        const results: Array<Record<string, unknown>> = [];
        let sessionId: string | undefined;
        let apkPath = optionalString(args, "apkPath");
        let lastFailure: string | undefined;

        try {
          const kind = optionalString(args, "kind");
          if (optionalBoolean(args, "installDependencies") ?? false) {
            await callJson(byName, "build.install_dependencies", { kind }, context);
          }
          if (optionalBoolean(args, "runLint") ?? true) {
            await callJson(byName, "build.run_lint", { kind }, context);
          }
          if (optionalBoolean(args, "runUnitTests") ?? true) {
            await callJson(byName, "build.run_unit_tests", { kind }, context);
          }
          if (!apkPath && (optionalBoolean(args, "buildDebugApk") ?? true)) {
            const build = await callJson(byName, "build.build_debug_apk", { kind }, context);
            const apkPaths = Array.isArray(build.apkPaths) ? build.apkPaths.filter((entry) => typeof entry === "string") : [];
            apkPath = apkPaths[0] as string | undefined;
            if (!apkPath) {
              throw new Error("Debug APK build succeeded but no APK path was discovered");
            }
          }

          const avdName = optionalString(args, "avdName");
          if (avdName) {
            await callJson(byName, "device.start_emulator", { avdName, waitForBoot: true }, context);
          }
          const serial = optionalString(args, "serial");
          const packageName = optionalString(args, "packageName");
          if (apkPath) {
            await callJson(byName, "device.install_app", { apkPath, serial }, context);
          }

          for (let index = 1; index <= maxIterations; index += 1) {
            const iteration = iterationOffset + index;
            const artifacts: string[] = [];
            const checks: Array<Record<string, unknown>> = [];
            try {
              if (packageName && (optionalBoolean(args, "clearAppData") ?? true)) {
                await callJson(byName, "device.clear_app_data", { packageName, serial }, context);
              }
              const capabilities = objectValue(args.appiumCapabilities);
              if (capabilities) {
                const session = await callJson(byName, "appium.create_session", { capabilities }, context);
                sessionId = typeof session.sessionId === "string" ? session.sessionId : undefined;
              }
              if (sessionId && (optionalBoolean(args, "flowReplayBeforeSteps") ?? Boolean(optionalString(args, "flowReplayTestName")))) {
                await callJson(
                  byName,
                  "flow.replay_to_checkpoint",
                  {
                    sessionId,
                    testName: optionalString(args, "flowReplayTestName"),
                    targetCheckpointId: optionalString(args, "flowReplayTargetCheckpointId"),
                    minimumScore: optionalNumber(args, "flowReplayMinimumScore")
                  },
                  context
                );
              }
              await runAppiumSteps(byName, objectArray(args.appiumSteps), sessionId, context);

              for (const expectedText of stringArray(args.expectedTexts)) {
                if (!sessionId) throw new Error("expectedTexts requires appiumCapabilities/sessionId");
                const check = await callJson(
                  byName,
                  "verify.assert_screen_contains_text",
                  { sessionId, text: expectedText },
                  context
                );
                checks.push({ tool: "verify.assert_screen_contains_text", expectedText, result: check });
              }
              for (const apiCheck of objectArray(args.apiChecks)) {
                const check = await callJson(byName, "verify.assert_api_response", apiCheck, context);
                checks.push({ tool: "verify.assert_api_response", result: check });
              }
              if (packageName) {
                const check = await callJson(
                  byName,
                  "verify.assert_no_crash_in_logcat",
                  { serial, packageName },
                  context
                );
                checks.push({ tool: "verify.assert_no_crash_in_logcat", result: check });
              }

              const failed = checks.filter((check) => resultFailed(check.result));
              if (optionalBoolean(args, "collectEvidence") ?? true) {
                const evidence = await callJson(
                  byName,
                  "verify.collect_evidence",
                  { sessionId, serial, packageName, prefix: `iteration-${iteration}` },
                  context
                );
                artifacts.push(...artifactValues(evidence));
              }
              const passed = failed.length === 0;
              const record = await callJson(
                byName,
                "loop.record_iteration",
                {
                  iteration,
                  goal,
                  build: apkPath ? "success" : "not_run",
                  device: serial ?? avdName ?? "default",
                  test_result: passed ? "passed" : "failed",
                  failure: passed ? "" : JSON.stringify(failed),
                  root_cause: passed ? "" : "verification_failed",
                  fix: passed ? "" : "requires_code_or_test_fix_by_agent",
                  retest: passed ? "passed" : "pending",
                  artifacts
                },
                context
              );
              results.push({ iteration, passed, checks, artifacts, record });
              if (passed) {
                return jsonResponse({
                  passed: true,
                  goal,
                  iterations: results,
                  durationMs: Date.now() - started
                });
              }
              lastFailure = JSON.stringify(failed);
            } catch (error) {
              lastFailure = error instanceof Error ? error.message : String(error);
              const evidence = await callJson(
                byName,
                "verify.collect_evidence",
                { sessionId, serial, packageName, prefix: `iteration-${iteration}-failure` },
                context
              ).catch((e) => ({ evidenceCollectionError: e instanceof Error ? e.message : String(e) }));
              const artifacts = artifactValues(evidence);
              await callJson(
                byName,
                "loop.record_iteration",
                {
                  iteration,
                  goal,
                  build: apkPath ? "success" : "unknown",
                  device: serial ?? avdName ?? "default",
                  test_result: "failed",
                  failure: lastFailure,
                  root_cause: "tool_or_verification_error",
                  fix: "requires_code_or_environment_fix_by_agent",
                  retest: "pending",
                  artifacts
                },
                context
              ).catch(() => undefined);
              results.push({ iteration, passed: false, failure: lastFailure, evidence });
            } finally {
              if (sessionId) {
                await callJson(byName, "appium.delete_session", { sessionId }, context).catch(() => undefined);
                sessionId = undefined;
              }
            }
          }
          return jsonResponse({
            passed: false,
            goal,
            failure: lastFailure,
            iterations: results,
            durationMs: Date.now() - started
          });
        } finally {
          if (sessionId) {
            await callJson(byName, "appium.delete_session", { sessionId }, context).catch(() => undefined);
          }
        }
      }
    }
  ];
}

async function runAppiumSteps(
  byName: Map<string, McpTool>,
  steps: Record<string, unknown>[],
  sessionId: string | undefined,
  context: ToolContext
): Promise<void> {
  for (const step of steps) {
    const tool = optionalString(step, "tool") ?? optionalString(step, "name");
    if (!tool || !tool.startsWith("appium.")) {
      throw new Error("Each appiumSteps item must have an appium.* tool");
    }
    const rawArgs = objectValue(step.args) ?? { ...step };
    delete rawArgs.tool;
    delete rawArgs.name;
    if (sessionId && rawArgs.sessionId === undefined) {
      rawArgs.sessionId = sessionId;
    }
    await callJson(byName, tool, rawArgs, context);
  }
}

async function callJson(
  byName: Map<string, McpTool>,
  toolName: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<Record<string, unknown>> {
  const tool = byName.get(toolName);
  if (!tool) throw new Error(`Unknown orchestrator tool: ${toolName}`);
  const response: ToolResponse = await tool.handler(cleanUndefined(args), context);
  if (response.isError) {
    throw new Error(response.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n"));
  }
  const text = response.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function cleanUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function objectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)));
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function resultFailed(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const passed = (value as { passed?: unknown }).passed;
  return passed === false;
}

function artifactValues(value: unknown): string[] {
  const output: string[] = [];
  collect(value);
  return output;

  function collect(entry: unknown): void {
    if (typeof entry === "string" && /[/\\].+\.[A-Za-z0-9]+$/.test(entry)) {
      output.push(entry);
    } else if (Array.isArray(entry)) {
      for (const child of entry) collect(child);
    } else if (entry && typeof entry === "object") {
      for (const child of Object.values(entry)) collect(child);
    }
  }
}
