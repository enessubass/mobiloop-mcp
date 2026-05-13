import { McpTool, ToolContext, ToolResponse, jsonResponse } from "../types.js";
import { arraySchema, booleanSchema, numberSchema, objectSchema, stringSchema } from "../schema.js";
import { appiumTools } from "./appium.js";
import { buildTools } from "./build.js";
import { deviceTools } from "./device.js";
import { flowTools } from "./flow.js";
import { iosTools } from "./ios.js";
import { loopTools } from "./loop.js";
import { verifyTools } from "./verify.js";
import {
  asObject,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireString
} from "../utils/validation.js";

export function orchestratorTools(): McpTool[] {
  const callableTools = [
    ...buildTools(),
    ...deviceTools(),
    ...iosTools(),
    ...appiumTools(),
    ...verifyTools(),
    ...flowTools(),
    ...loopTools()
  ];
  const byName = new Map(callableTools.map((tool) => [tool.name, tool]));

  return [
    {
      name: "orchestrator.run_android_validation_loop",
      description:
        "Run build -> install -> Appium scripted test -> verification -> evidence -> loop record for Android.",
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
          Math.min(
            optionalNumber(args, "maxTestIterations") ?? context.config.maxTestIterations,
            20
          )
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
            const apkPaths = Array.isArray(build.apkPaths)
              ? build.apkPaths.filter((entry) => typeof entry === "string")
              : [];
            apkPath = apkPaths[0] as string | undefined;
            if (!apkPath) {
              throw new Error("Debug APK build succeeded but no APK path was discovered");
            }
          }

          const avdName = optionalString(args, "avdName");
          if (avdName) {
            await callJson(
              byName,
              "device.start_emulator",
              { avdName, waitForBoot: true },
              context
            );
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
                const session = await callJson(
                  byName,
                  "appium.create_session",
                  { capabilities },
                  context
                );
                sessionId = typeof session.sessionId === "string" ? session.sessionId : undefined;
              }
              if (
                sessionId &&
                (optionalBoolean(args, "flowReplayBeforeSteps") ??
                  Boolean(optionalString(args, "flowReplayTestName")))
              ) {
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
                if (!sessionId)
                  throw new Error("expectedTexts requires appiumCapabilities/sessionId");
                const check = await callJson(
                  byName,
                  "verify.assert_screen_contains_text",
                  { sessionId, text: expectedText },
                  context
                );
                checks.push({
                  tool: "verify.assert_screen_contains_text",
                  expectedText,
                  result: check
                });
              }
              for (const apiCheck of objectArray(args.apiChecks)) {
                const check = await callJson(
                  byName,
                  "verify.assert_api_response",
                  apiCheck,
                  context
                );
                checks.push({ tool: "verify.assert_api_response", result: check });
              }
              if (sessionId) {
                const check = await callJson(
                  byName,
                  "verify.assert_appium_session_healthy",
                  { sessionId },
                  context
                );
                checks.push({ tool: "verify.assert_appium_session_healthy", result: check });
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
              const failureAnalysis = analyzeFailedChecks(failed);
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
                  root_cause: passed ? "" : failureAnalysis.likelyRootCause,
                  fix: passed ? "" : failureAnalysis.nextSuggestedAction,
                  retest: passed ? "passed" : "pending",
                  artifacts
                },
                context
              );
              results.push({ iteration, passed, checks, artifacts, record, failureAnalysis });
              if (passed) {
                return jsonResponse({
                  passed: true,
                  goal,
                  iterations: results,
                  status: "passed",
                  likelyRootCause: "",
                  nextSuggestedAction: "",
                  blockingExternalDependency: false,
                  durationMs: Date.now() - started
                });
              }
              lastFailure = JSON.stringify(failed);
            } catch (error) {
              lastFailure = error instanceof Error ? error.message : String(error);
              const failureAnalysis = analyzeErrorMessage(lastFailure);
              const evidence = await callJson(
                byName,
                "verify.collect_evidence",
                { sessionId, serial, packageName, prefix: `iteration-${iteration}-failure` },
                context
              ).catch((e) => ({
                evidenceCollectionError: e instanceof Error ? e.message : String(e)
              }));
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
                  root_cause: failureAnalysis.likelyRootCause,
                  fix: failureAnalysis.nextSuggestedAction,
                  retest: "pending",
                  artifacts
                },
                context
              ).catch(() => undefined);
              results.push({
                iteration,
                passed: false,
                failure: lastFailure,
                evidence,
                failureAnalysis
              });
            } finally {
              if (sessionId) {
                await callJson(byName, "appium.delete_session", { sessionId }, context).catch(
                  () => undefined
                );
                sessionId = undefined;
              }
            }
          }
          return jsonResponse({
            passed: false,
            goal,
            failure: lastFailure,
            iterations: results,
            ...summarizeIterations(results),
            durationMs: Date.now() - started
          });
        } finally {
          if (sessionId) {
            await callJson(byName, "appium.delete_session", { sessionId }, context).catch(
              () => undefined
            );
          }
        }
      }
    },
    {
      name: "orchestrator.run_ios_validation_loop",
      description:
        "Run iOS simulator build -> install/launch -> Appium XCUITest scripted test -> verification -> evidence -> loop record.",
      inputSchema: objectSchema(
        {
          goal: stringSchema,
          kind: stringSchema,
          workspace: stringSchema,
          project: stringSchema,
          scheme: stringSchema,
          configuration: stringSchema,
          sdk: stringSchema,
          destination: stringSchema,
          derivedDataPath: stringSchema,
          appPath: stringSchema,
          bundleId: stringSchema,
          simulatorDevice: stringSchema,
          device: stringSchema,
          appiumCapabilities: { type: "object", additionalProperties: true },
          appiumSteps: arraySchema({ type: "object", additionalProperties: true }),
          expectedTexts: arraySchema(stringSchema),
          installDependencies: booleanSchema,
          runLint: booleanSchema,
          runUnitTests: booleanSchema,
          buildIosApp: booleanSchema,
          bootSimulator: booleanSchema,
          installApp: booleanSchema,
          launchApp: booleanSchema,
          collectEvidence: booleanSchema,
          captureSimulatorScreenshot: booleanSchema,
          collectSimulatorLogs: booleanSchema,
          simulatorLogLast: stringSchema,
          simulatorLogPredicate: stringSchema,
          evidenceTimeoutMs: numberSchema,
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
          Math.min(
            optionalNumber(args, "maxTestIterations") ?? context.config.maxTestIterations,
            20
          )
        );
        const iterationOffset = optionalNumber(args, "iterationOffset") ?? 0;
        const results: Array<Record<string, unknown>> = [];
        let sessionId: string | undefined;
        let appPath = optionalString(args, "appPath");
        let lastFailure: string | undefined;
        const simulatorDevice =
          optionalString(args, "simulatorDevice") ?? optionalString(args, "device");
        const device = simulatorDevice ?? "booted";
        const bundleId = optionalString(args, "bundleId");

        try {
          const kind = optionalString(args, "kind");
          if (optionalBoolean(args, "installDependencies") ?? false) {
            await callJson(byName, "build.install_dependencies", { kind }, context);
          }
          if (optionalBoolean(args, "runLint") ?? false) {
            await callJson(byName, "build.run_lint", { kind }, context);
          }
          if (optionalBoolean(args, "runUnitTests") ?? false) {
            await callJson(byName, "build.run_unit_tests", { kind }, context);
          }
          if (!appPath && (optionalBoolean(args, "buildIosApp") ?? true)) {
            const build = await callJson(
              byName,
              "ios.build_app",
              {
                workspace: optionalString(args, "workspace"),
                project: optionalString(args, "project"),
                scheme: optionalString(args, "scheme"),
                configuration: optionalString(args, "configuration"),
                sdk: optionalString(args, "sdk"),
                destination: optionalString(args, "destination"),
                derivedDataPath: optionalString(args, "derivedDataPath")
              },
              context
            );
            const appPaths = Array.isArray(build.appPaths)
              ? build.appPaths.filter((entry) => typeof entry === "string")
              : [];
            appPath = appPaths[0] as string | undefined;
            if (!appPath) {
              throw new Error("iOS build succeeded but no .app bundle was discovered");
            }
          }

          if (simulatorDevice && (optionalBoolean(args, "bootSimulator") ?? true)) {
            await callJson(
              byName,
              "ios.boot_simulator",
              { device: simulatorDevice, waitForBoot: true },
              context
            );
          }
          if (appPath && (optionalBoolean(args, "installApp") ?? true)) {
            await callJson(byName, "ios.install_app", { device, appPath }, context);
          }
          if (bundleId && (optionalBoolean(args, "launchApp") ?? true)) {
            await callJson(
              byName,
              "ios.launch_app",
              { device, bundleId, terminateRunning: true },
              context
            );
          }

          for (let index = 1; index <= maxIterations; index += 1) {
            const iteration = iterationOffset + index;
            const artifacts: string[] = [];
            const checks: Array<Record<string, unknown>> = [];
            try {
              if (shouldCreateAppiumSession(args)) {
                const session = await callJson(
                  byName,
                  "appium.create_session",
                  { capabilities: iosAppiumCapabilities(args, appPath, bundleId, simulatorDevice) },
                  context
                );
                sessionId = typeof session.sessionId === "string" ? session.sessionId : undefined;
              }
              if (
                sessionId &&
                (optionalBoolean(args, "flowReplayBeforeSteps") ??
                  Boolean(optionalString(args, "flowReplayTestName")))
              ) {
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
                if (!sessionId)
                  throw new Error("expectedTexts requires appiumCapabilities/sessionId");
                const check = await callJson(
                  byName,
                  "verify.assert_screen_contains_text",
                  { sessionId, text: expectedText },
                  context
                );
                checks.push({
                  tool: "verify.assert_screen_contains_text",
                  expectedText,
                  result: check
                });
              }
              if (sessionId) {
                const check = await callJson(
                  byName,
                  "verify.assert_appium_session_healthy",
                  { sessionId },
                  context
                );
                checks.push({ tool: "verify.assert_appium_session_healthy", result: check });
              }

              const failed = checks.filter((check) => resultFailed(check.result));
              if (optionalBoolean(args, "collectEvidence") ?? true) {
                const evidence = await collectIosEvidence(
                  byName,
                  args,
                  sessionId,
                  device,
                  `iteration-${iteration}`,
                  context
                );
                artifacts.push(...evidence.artifacts);
                checks.push({
                  tool: "orchestrator.collect_ios_evidence",
                  result: {
                    passed: evidence.errors.length === 0,
                    evidenceErrors: evidence.errors
                  }
                });
              }
              const evidenceFailed = checks.filter((check) => resultFailed(check.result));
              const failureAnalysis = analyzeFailedChecks(
                evidenceFailed.length ? evidenceFailed : failed
              );
              const passed = evidenceFailed.length === 0;
              const record = await callJson(
                byName,
                "loop.record_iteration",
                {
                  iteration,
                  goal,
                  build: appPath ? "success" : "not_run",
                  device,
                  test_result: passed ? "passed" : "failed",
                  failure: passed ? "" : JSON.stringify(evidenceFailed),
                  root_cause: passed ? "" : failureAnalysis.likelyRootCause,
                  fix: passed ? "" : failureAnalysis.nextSuggestedAction,
                  retest: passed ? "passed" : "pending",
                  artifacts
                },
                context
              );
              results.push({
                iteration,
                passed,
                checks,
                artifacts,
                record,
                failureAnalysis,
                appPath,
                bundleId
              });
              if (passed) {
                return jsonResponse({
                  passed: true,
                  goal,
                  iterations: results,
                  status: "passed",
                  likelyRootCause: "",
                  nextSuggestedAction: "",
                  blockingExternalDependency: false,
                  durationMs: Date.now() - started
                });
              }
              lastFailure = JSON.stringify(evidenceFailed);
            } catch (error) {
              lastFailure = error instanceof Error ? error.message : String(error);
              const failureAnalysis = analyzeErrorMessage(lastFailure);
              const evidence =
                (optionalBoolean(args, "collectEvidence") ?? true)
                  ? await collectIosEvidence(
                      byName,
                      args,
                      sessionId,
                      device,
                      `iteration-${iteration}-failure`,
                      context
                    ).catch((e) => ({
                      artifacts: [],
                      errors: [e instanceof Error ? e.message : String(e)]
                    }))
                  : { artifacts: [], errors: [] };
              await callJson(
                byName,
                "loop.record_iteration",
                {
                  iteration,
                  goal,
                  build: appPath ? "success" : "unknown",
                  device,
                  test_result: "failed",
                  failure: lastFailure,
                  root_cause: failureAnalysis.likelyRootCause,
                  fix: failureAnalysis.nextSuggestedAction,
                  retest: "pending",
                  artifacts: evidence.artifacts
                },
                context
              ).catch(() => undefined);
              results.push({
                iteration,
                passed: false,
                failure: lastFailure,
                evidence,
                failureAnalysis,
                appPath,
                bundleId
              });
            } finally {
              if (sessionId) {
                await callJson(byName, "appium.delete_session", { sessionId }, context).catch(
                  () => undefined
                );
                sessionId = undefined;
              }
            }
          }
          return jsonResponse({
            passed: false,
            goal,
            failure: lastFailure,
            iterations: results,
            ...summarizeIterations(results),
            durationMs: Date.now() - started
          });
        } finally {
          if (sessionId) {
            await callJson(byName, "appium.delete_session", { sessionId }, context).catch(
              () => undefined
            );
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
    throw new Error(
      response.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n")
    );
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
  return value.filter((entry): entry is Record<string, unknown> =>
    Boolean(entry && typeof entry === "object" && !Array.isArray(entry))
  );
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function shouldCreateAppiumSession(args: Record<string, unknown>): boolean {
  return Boolean(
    objectValue(args.appiumCapabilities) ||
    objectArray(args.appiumSteps).length > 0 ||
    stringArray(args.expectedTexts).length > 0 ||
    optionalBoolean(args, "flowReplayBeforeSteps") ||
    optionalString(args, "flowReplayTestName")
  );
}

function iosAppiumCapabilities(
  args: Record<string, unknown>,
  appPath: string | undefined,
  bundleId: string | undefined,
  simulatorDevice: string | undefined
): Record<string, unknown> {
  const supplied = objectValue(args.appiumCapabilities) ?? {};
  const capabilities: Record<string, unknown> = {
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    ...supplied
  };
  if (
    simulatorDevice &&
    !("appium:deviceName" in capabilities) &&
    !("deviceName" in capabilities)
  ) {
    capabilities["appium:deviceName"] = simulatorDevice;
  }
  if (bundleId && !("appium:bundleId" in capabilities) && !("bundleId" in capabilities)) {
    capabilities["appium:bundleId"] = bundleId;
  }
  if (appPath && !bundleId && !("appium:app" in capabilities) && !("app" in capabilities)) {
    capabilities["appium:app"] = appPath;
  }
  return capabilities;
}

async function collectIosEvidence(
  byName: Map<string, McpTool>,
  args: Record<string, unknown>,
  sessionId: string | undefined,
  device: string,
  prefix: string,
  context: ToolContext
): Promise<{ artifacts: string[]; errors: string[] }> {
  const artifacts: string[] = [];
  const errors: string[] = [];
  if (sessionId) {
    await callJson(
      byName,
      "appium.observe_screen",
      {
        sessionId,
        prefix,
        waitForAnyText: stringArray(args.expectedTexts),
        timeoutMs: optionalNumber(args, "evidenceTimeoutMs")
      },
      context
    )
      .then((evidence) => artifacts.push(...artifactValues(evidence)))
      .catch((error) => errors.push(`appium evidence: ${errorMessage(error)}`));
  }
  if (optionalBoolean(args, "captureSimulatorScreenshot") ?? true) {
    await callJson(byName, "ios.capture_screenshot", { device, prefix }, context)
      .then((evidence) => artifacts.push(...artifactValues(evidence)))
      .catch((error) => errors.push(`simulator screenshot: ${errorMessage(error)}`));
  }
  if (optionalBoolean(args, "collectSimulatorLogs") ?? true) {
    await callJson(
      byName,
      "ios.collect_logs",
      {
        device,
        last: optionalString(args, "simulatorLogLast"),
        predicate: optionalString(args, "simulatorLogPredicate"),
        prefix: `${prefix}-ios-sim`
      },
      context
    )
      .then((evidence) => artifacts.push(...artifactValues(evidence)))
      .catch((error) => errors.push(`simulator logs: ${errorMessage(error)}`));
  }
  return { artifacts, errors };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function analyzeFailedChecks(failed: Array<Record<string, unknown>>): Record<string, unknown> {
  for (const check of failed) {
    const result = objectValue(check.result);
    const classification = objectValue(result?.classification);
    if (classification) {
      return {
        status: optionalString(classification, "status") ?? "unknown_failure",
        likelyRootCause:
          optionalString(classification, "likelyRootCause") ??
          "Verification failed with classified evidence.",
        nextSuggestedAction:
          optionalString(classification, "nextSuggestedAction") ??
          "Inspect collected evidence and rerun.",
        blockingExternalDependency: isExternalStatus(optionalString(classification, "status"))
      };
    }
    const status = optionalString(result ?? {}, "status");
    if (status) {
      return {
        status,
        likelyRootCause: optionalString(result ?? {}, "likelyRootCause") ?? "Verification failed.",
        nextSuggestedAction:
          optionalString(result ?? {}, "nextSuggestedAction") ??
          "Inspect collected evidence and rerun.",
        blockingExternalDependency: isExternalStatus(status)
      };
    }
  }
  return {
    status: failed.length > 0 ? "unknown_failure" : "passed",
    likelyRootCause:
      failed.length > 0
        ? "One or more verification checks failed without a classifier result."
        : "",
    nextSuggestedAction:
      failed.length > 0 ? "Collect screenshot, page source, and logs for the failed step." : "",
    blockingExternalDependency: false
  };
}

function analyzeErrorMessage(message: string): Record<string, unknown> {
  if (/appium|session|uiautomator|instrumentation/i.test(message)) {
    return {
      status: "automation_error",
      likelyRootCause: message,
      nextSuggestedAction:
        "Recreate the Appium session and verify the platform driver before changing app code.",
      blockingExternalDependency: false
    };
  }
  if (/permission_denied|firestore|firebase|google play|network|timeout/i.test(message)) {
    return {
      status: "external_dependency",
      likelyRootCause: message,
      nextSuggestedAction:
        "Check staging services, test data, emulator services, and remote credentials/rules.",
      blockingExternalDependency: true
    };
  }
  return {
    status: "unknown_failure",
    likelyRootCause: message,
    nextSuggestedAction: "Inspect the failed tool output and collected evidence.",
    blockingExternalDependency: false
  };
}

function summarizeIterations(iterations: Array<Record<string, unknown>>): Record<string, unknown> {
  const last = iterations
    .slice()
    .reverse()
    .find((iteration) => objectValue(iteration.failureAnalysis));
  const analysis = objectValue(last?.failureAnalysis);
  if (!analysis) {
    return {
      status: "unknown_failure",
      likelyRootCause: "Validation loop failed without classified evidence.",
      nextSuggestedAction: "Inspect iteration records and artifacts.",
      blockingExternalDependency: false
    };
  }
  return {
    status: optionalString(analysis, "status") ?? "unknown_failure",
    likelyRootCause: optionalString(analysis, "likelyRootCause") ?? "Validation loop failed.",
    nextSuggestedAction:
      optionalString(analysis, "nextSuggestedAction") ?? "Inspect iteration records and artifacts.",
    blockingExternalDependency: optionalBoolean(analysis, "blockingExternalDependency") ?? false
  };
}

function isExternalStatus(status: string | undefined): boolean {
  return Boolean(
    status &&
    [
      "remote_rules_not_deployed",
      "test_data_missing",
      "environment_missing",
      "external_dependency"
    ].includes(status)
  );
}
