import { AppiumClient, Locator } from "../utils/appium-client.js";
import { McpTool, jsonResponse } from "../types.js";
import { arraySchema, booleanSchema, numberSchema, objectSchema, stringSchema } from "../schema.js";
import {
  analyzeCodeFlow,
  buildReplayPlan,
  createScreenSignature,
  emptyFlowMemory,
  persistCodeFlowAnalysis,
  readFlowMemory,
  readScreenSource,
  recordFlowRun,
  upsertCheckpoint,
  writeFlowMemory,
  FlowAction,
  CodeFlowAnalysis
} from "../utils/flow-memory.js";
import {
  asObject,
  optionalBoolean,
  optionalNumber,
  optionalObject,
  optionalString,
  optionalStringArray,
  requireString,
  stringEnum
} from "../utils/validation.js";
import { writeArtifactText } from "../utils/artifacts.js";

export function flowTools(): McpTool[] {
  return [
    {
      name: "flow.analyze_from_code",
      description: "Infer mobile screens, routes, transitions, and visible text candidates from source code.",
      inputSchema: objectSchema(
        {
          maxFiles: numberSchema,
          includeTests: booleanSchema
        },
        []
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const analysis = await analyzeCodeFlow(config, {
          maxFiles: optionalNumber(args, "maxFiles"),
          includeTests: optionalBoolean(args, "includeTests")
        });
        const artifacts = await persistCodeFlowAnalysis(config, analysis);
        return jsonResponse({ analysis: analysis as never, ...artifacts });
      }
    },
    {
      name: "flow.generate_test_scenarios",
      description: "Generate candidate mobile E2E scenarios from static source-flow analysis for an AI agent to execute/refine.",
      inputSchema: objectSchema(
        {
          goal: stringSchema,
          maxFiles: numberSchema,
          maxScenarios: numberSchema,
          includeNegativeCases: booleanSchema,
          includeTests: booleanSchema
        },
        []
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const analysis = await analyzeCodeFlow(config, {
          maxFiles: optionalNumber(args, "maxFiles"),
          includeTests: optionalBoolean(args, "includeTests")
        });
        const scenarios = generateScenariosFromAnalysis(analysis, {
          goal: optionalString(args, "goal"),
          maxScenarios: optionalNumber(args, "maxScenarios") ?? 10,
          includeNegativeCases: optionalBoolean(args, "includeNegativeCases") ?? true
        });
        const artifactPath = await writeArtifactText(
          config,
          "flow",
          "generated-test-scenarios",
          "json",
          JSON.stringify({ generatedAt: new Date().toISOString(), goal: optionalString(args, "goal"), analysis, scenarios }, null, 2)
        );
        return jsonResponse({
          generatedAt: new Date().toISOString(),
          goal: optionalString(args, "goal"),
          framework: analysis.framework,
          artifactPath,
          scenarios: scenarios as never,
          limitations: [
            "Scenarios are generated from static code heuristics and should be validated through Appium/runtime evidence.",
            "Prefer exact text/accessibility/resource-id locators before coordinate taps."
          ]
        });
      }
    },
    {
      name: "flow.run_script",
      description: "Run a high-level JSON flow DSL over an Appium session: waitText, tapText, type, assertText, observe, collectEvidence, back, swipe, checkpoint.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          testName: stringSchema,
          steps: arraySchema({ type: "object", additionalProperties: true }),
          prefix: stringSchema,
          delayMs: numberSchema,
          stopOnFailure: booleanSchema
        },
        ["sessionId", "steps"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const client = new AppiumClient({ serverUrl });
        const steps = objectArray(args.steps);
        const delayMs = Math.max(0, Math.min(optionalNumber(args, "delayMs") ?? 300, 10_000));
        const stopOnFailure = optionalBoolean(args, "stopOnFailure") ?? true;
        const prefix = optionalString(args, "prefix") ?? "flow-script";
        const testName = optionalString(args, "testName") ?? "flow-script";
        const executed: Array<Record<string, unknown>> = [];
        const evidence: Array<Record<string, unknown>> = [];

        for (let index = 0; index < steps.length; index += 1) {
          const step = steps[index];
          const startedAt = new Date().toISOString();
          try {
            const result = await executeScriptStep(client, sessionId, step, {
              config,
              index,
              prefix,
              testName,
              serverUrl
            });
            executed.push({ index, startedAt, passed: true, step: step as never, result: result as never });
            if (result && typeof result === "object" && "evidence" in result) {
              evidence.push((result as { evidence: Record<string, unknown> }).evidence);
            }
          } catch (error) {
            const failure = error instanceof Error ? error.message : String(error);
            executed.push({ index, startedAt, passed: false, step: step as never, failure });
            if (stopOnFailure) {
              return jsonResponse({ passed: false, serverUrl, sessionId, executed: executed as never, evidence: evidence as never });
            }
          }
          if (delayMs > 0) await sleep(delayMs);
        }

        return jsonResponse({ passed: executed.every((entry) => entry.passed), serverUrl, sessionId, executed: executed as never, evidence: evidence as never });
      }
    },
    {
      name: "flow.record_checkpoint",
      description: "Record a runtime screen checkpoint from Appium source/session and optional action needed to reach the next checkpoint.",
      inputSchema: objectSchema(
        {
          testName: stringSchema,
          name: stringSchema,
          checkpointId: stringSchema,
          order: numberSchema,
          source: stringSchema,
          sourcePath: stringSchema,
          screenshotPath: stringSchema,
          sessionId: stringSchema,
          serverUrl: stringSchema,
          prefix: stringSchema,
          actionToNext: { type: "object", additionalProperties: true }
        },
        ["testName", "name"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const testName = requireString(args, "testName");
        const name = requireString(args, "name");
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = optionalString(args, "sessionId");
        const prefix = optionalString(args, "prefix") ?? `flow-${testName}-${name}`;
        let source = optionalString(args, "source");
        let sourcePath = optionalString(args, "sourcePath");
        let screenshotPath = optionalString(args, "screenshotPath");

        if (sessionId) {
          const client = new AppiumClient({ serverUrl });
          source = await client.pageSource(sessionId);
          sourcePath = await client.savePageSource(config, sessionId, prefix);
          screenshotPath = screenshotPath ?? (await client.saveScreenshot(config, sessionId, prefix));
        } else {
          source = await readScreenSource(config, { source, sourcePath });
          if (!sourcePath) {
            sourcePath = await writeArtifactText(config, "flow/sources", prefix, "xml", source);
          }
        }

        const actionToNext = optionalAction(args, "actionToNext");
        const signature = createScreenSignature(source);
        const result = await upsertCheckpoint(config, {
          id: optionalString(args, "checkpointId"),
          testName,
          name,
          order: optionalNumber(args, "order"),
          signature,
          actionToNext,
          sourcePath,
          screenshotPath
        });
        return jsonResponse({
          memoryPath: result.memoryPath,
          checkpoint: result.checkpoint as never,
          signatureSummary: signatureSummary(signature) as never,
          evidence: {
            label: prefix,
            timestamp: new Date().toISOString(),
            screenshotPath,
            sourcePath
          }
        });
      }
    },
    {
      name: "flow.record_test_run",
      description: "Record the ordered checkpoint ids for a test run. The latest passed run becomes the default replay path.",
      inputSchema: objectSchema(
        {
          runId: stringSchema,
          testName: stringSchema,
          status: stringSchema,
          checkpointIds: arraySchema(stringSchema),
          artifacts: arraySchema(stringSchema),
          startedAt: stringSchema,
          finishedAt: stringSchema
        },
        ["testName", "status", "checkpointIds"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const checkpointIds = optionalStringArray(args, "checkpointIds") ?? [];
        if (checkpointIds.length === 0) throw new Error("checkpointIds must contain at least one checkpoint id");
        const result = await recordFlowRun(config, {
          id: optionalString(args, "runId"),
          testName: requireString(args, "testName"),
          status: requireString(args, "status"),
          checkpointIds,
          artifacts: optionalStringArray(args, "artifacts"),
          startedAt: optionalString(args, "startedAt"),
          finishedAt: optionalString(args, "finishedAt")
        });
        return jsonResponse({ memoryPath: result.memoryPath, run: result.run as never });
      }
    },
    {
      name: "flow.plan_replay",
      description: "Match the current screen against recorded checkpoints and return Appium actions needed to reach a target checkpoint.",
      inputSchema: objectSchema(
        {
          testName: stringSchema,
          targetCheckpointId: stringSchema,
          minimumScore: numberSchema,
          source: stringSchema,
          sourcePath: stringSchema,
          sessionId: stringSchema,
          serverUrl: stringSchema
        },
        []
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const source = await sourceFromInput(config, args);
        const signature = createScreenSignature(source);
        const memory = await readFlowMemory(config);
        const plan = buildReplayPlan(memory, signature, {
          testName: optionalString(args, "testName"),
          targetCheckpointId: optionalString(args, "targetCheckpointId"),
          minimumScore: optionalNumber(args, "minimumScore")
        });
        return jsonResponse({
          memoryPath: `${config.artifactsDir}/flow/memory.json`,
          currentSignature: signatureSummary(signature) as never,
          plan: plan as never
        });
      }
    },
    {
      name: "flow.replay_to_checkpoint",
      description: "Auto-advance an Appium session from a previously seen screen to the latest or requested checkpoint.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          testName: stringSchema,
          targetCheckpointId: stringSchema,
          minimumScore: numberSchema,
          dryRun: booleanSchema,
          delayMs: numberSchema
        },
        ["sessionId"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const client = new AppiumClient({ serverUrl });
        const source = await client.pageSource(sessionId);
        const signature = createScreenSignature(source);
        const memory = await readFlowMemory(config);
        const plan = buildReplayPlan(memory, signature, {
          testName: optionalString(args, "testName"),
          targetCheckpointId: optionalString(args, "targetCheckpointId"),
          minimumScore: optionalNumber(args, "minimumScore")
        });
        const dryRun = optionalBoolean(args, "dryRun") ?? false;
        const delayMs = Math.max(0, Math.min(optionalNumber(args, "delayMs") ?? 500, 10_000));
        const executed: Array<Record<string, unknown>> = [];

        if (!dryRun && !plan.alreadyAtTarget) {
          for (const action of plan.actions) {
            await executeReplayAction(client, sessionId, action);
            executed.push({ ...action, executed: true });
            if (delayMs > 0) await sleep(delayMs);
          }
        }

        return jsonResponse({
          serverUrl,
          sessionId,
          dryRun,
          plan: plan as never,
          executed: executed as never
        });
      }
    },
    {
      name: "flow.read_memory",
      description: "Read recorded flow checkpoints, runs, and code-flow analyses.",
      inputSchema: objectSchema({}),
      async handler(_input, { config }) {
        const memory = await readFlowMemory(config);
        return jsonResponse({ memoryPath: `${config.artifactsDir}/flow/memory.json`, memory: memory as never });
      }
    },
    {
      name: "flow.clear_memory",
      description: "Clear flow memory under artifactsDir. This does not modify app source code.",
      inputSchema: objectSchema({ confirm: stringSchema }, ["confirm"]),
      async handler(input, { config }) {
        const args = asObject(input);
        if (requireString(args, "confirm") !== "clear-flow-memory") {
          throw new Error('confirm must be exactly "clear-flow-memory"');
        }
        const memoryPath = await writeFlowMemory(config, emptyFlowMemory());
        return jsonResponse({ cleared: true, memoryPath });
      }
    }
  ];
}

async function sourceFromInput(config: Parameters<typeof readFlowMemory>[0], args: Record<string, unknown>): Promise<string> {
  const sessionId = optionalString(args, "sessionId");
  if (sessionId) {
    const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
    return new AppiumClient({ serverUrl }).pageSource(sessionId);
  }
  return readScreenSource(config, {
    source: optionalString(args, "source"),
    sourcePath: optionalString(args, "sourcePath")
  });
}

async function executeReplayAction(
  client: AppiumClient,
  sessionId: string,
  action: FlowAction & { fromCheckpointId?: string }
): Promise<void> {
  const tool = normalizeActionTool(action.tool);
  const args = action.args ?? {};
  switch (tool) {
    case "appium.tap_by_text": {
      const text = requireString(args, "text");
      const timeoutMs = optionalNumber(args, "timeoutMs") ?? 5_000;
      const visible = await client.waitForVisible(sessionId, { strategy: "text", value: text }, timeoutMs);
      if (!visible.found) throw new Error(`Replay text not visible: ${text}`);
      const matchMode = stringEnum(args, "matchMode", ["auto", "exact", "contains"] as const, "auto");
      const target = await client.findTextTapTarget(sessionId, text, matchMode);
      await client.clickElement(sessionId, target.elementId);
      return;
    }
    case "appium.tap_by_accessibility_id": {
      const element = await client.findElement(sessionId, {
        strategy: "accessibility id",
        value: requireString(args, "accessibilityId")
      });
      await client.clickElement(sessionId, element);
      return;
    }
    case "appium.tap_by_resource_id": {
      const element = await client.findElement(sessionId, { strategy: "id", value: requireString(args, "resourceId") });
      await client.clickElement(sessionId, element);
      return;
    }
    case "appium.tap_coordinates": {
      const x = optionalNumber(args, "x");
      const y = optionalNumber(args, "y");
      if (x === undefined || y === undefined) throw new Error("tap_coordinates requires x and y");
      await client.pointerTap(sessionId, x, y);
      return;
    }
    case "appium.type_text": {
      const locator = locatorFromActionArgs(args);
      const text = requireString(args, "text");
      const clearFirst = optionalBoolean(args, "clearFirst") ?? true;
      const mode = stringEnum(args, "mode", ["sendKeys", "setValue", "adbKeyboard"] as const, "sendKeys");
      const element = await client.findElement(sessionId, locator);
      if (clearFirst) await client.clearElement(sessionId, element);
      if (mode === "setValue") {
        await client.setElementValue(sessionId, element, text);
      } else if (mode === "adbKeyboard") {
        await client.adbInputText(sessionId, element, text);
      } else {
        await client.typeText(sessionId, element, text);
      }
      return;
    }
    case "appium.swipe": {
      const startX = optionalNumber(args, "startX");
      const startY = optionalNumber(args, "startY");
      const endX = optionalNumber(args, "endX");
      const endY = optionalNumber(args, "endY");
      if ([startX, startY, endX, endY].some((value) => value === undefined)) {
        throw new Error("swipe requires startX, startY, endX, and endY");
      }
      await client.swipe(sessionId, startX!, startY!, endX!, endY!, optionalNumber(args, "durationMs") ?? 500);
      return;
    }
    case "appium.go_back":
      await client.back(sessionId);
      return;
    case "appium.wait_for_visible":
    case "appium.assert_visible": {
      const locator = locatorFromActionArgs(args);
      const result = await client.waitForVisible(sessionId, locator, optionalNumber(args, "timeoutMs") ?? 5_000);
      if (!result.found) throw new Error(`Replay locator not visible: ${locator.strategy}:${locator.value}`);
      return;
    }
    default:
      throw new Error(`Unsupported replay action tool: ${action.tool}`);
  }
}

function normalizeActionTool(tool: string): string {
  const aliases: Record<string, string> = {
    tap_text: "appium.tap_by_text",
    tapByText: "appium.tap_by_text",
    tap_accessibility_id: "appium.tap_by_accessibility_id",
    tap_resource_id: "appium.tap_by_resource_id",
    tap_coordinates: "appium.tap_coordinates",
    type_text: "appium.type_text",
    swipe: "appium.swipe",
    back: "appium.go_back",
    wait_visible: "appium.wait_for_visible"
  };
  return aliases[tool] ?? tool;
}

function locatorFromActionArgs(args: Record<string, unknown>): Locator {
  const locator = optionalObject(args, "locator");
  if (!locator) throw new Error("locator is required");
  const strategy = requireString(locator, "strategy") as Locator["strategy"];
  const value = requireString(locator, "value");
  return { strategy, value };
}

function optionalAction(input: Record<string, unknown>, key: string): FlowAction | undefined {
  const value = optionalObject(input, key);
  if (!value) return undefined;
  const tool = requireString(value, "tool");
  const args = optionalObject(value, "args");
  const description = optionalString(value, "description");
  return { tool, args, description };
}

async function executeScriptStep(
  client: AppiumClient,
  sessionId: string,
  step: Record<string, unknown>,
  options: {
    config: Parameters<typeof readFlowMemory>[0];
    index: number;
    prefix: string;
    testName: string;
    serverUrl: string;
  }
): Promise<Record<string, unknown>> {
  const action = optionalString(step, "action") ?? optionalString(step, "type") ?? optionalString(step, "tool");
  if (!action) throw new Error("flow script step requires action/type/tool");
  switch (normalizeScriptAction(action)) {
    case "waitText": {
      const text = requireString(step, "text");
      const timeoutMs = optionalNumber(step, "timeoutMs") ?? 10_000;
      const result = await client.waitForVisible(sessionId, { strategy: "text", value: text }, timeoutMs);
      if (!result.found) throw new Error(`Text not visible: ${text}`);
      return { action: "waitText", text, timeoutMs, ...result };
    }
    case "tapText": {
      const text = requireString(step, "text");
      const matchMode = stringEnum(step, "matchMode", ["auto", "exact", "contains"] as const, "auto");
      const timeoutMs = optionalNumber(step, "timeoutMs") ?? 10_000;
      const visible = await client.waitForVisible(sessionId, { strategy: "text", value: text }, timeoutMs);
      if (!visible.found) throw new Error(`Text not visible: ${text}`);
      const target = await client.findTextTapTarget(sessionId, text, matchMode);
      await client.clickElement(sessionId, target.elementId);
      return { action: "tapText", text, matchMode, target: target as never };
    }
    case "type": {
      const locator = locatorFromActionArgs(step);
      const text = requireString(step, "text");
      const clearFirst = optionalBoolean(step, "clearFirst") ?? true;
      const mode = stringEnum(step, "mode", ["sendKeys", "setValue", "adbKeyboard"] as const, "sendKeys");
      const element = await client.findElement(sessionId, locator);
      if (clearFirst) await client.clearElement(sessionId, element);
      if (mode === "setValue") {
        await client.setElementValue(sessionId, element, text);
      } else if (mode === "adbKeyboard") {
        await client.adbInputText(sessionId, element, text);
      } else {
        await client.typeText(sessionId, element, text);
      }
      return { action: "type", locator: locator as never, clearFirst, mode };
    }
    case "assertText": {
      const text = requireString(step, "text");
      const source = await client.pageSource(sessionId);
      if (!source.includes(text)) throw new Error(`Expected text not found: ${text}`);
      return { action: "assertText", text, passed: true };
    }
    case "observe":
    case "collectEvidence": {
      const label = optionalString(step, "label") ?? `${options.prefix}-${String(options.index + 1).padStart(2, "0")}`;
      const minWaitMs = Math.max(0, Math.min(optionalNumber(step, "minWaitMs") ?? 0, 30_000));
      if (minWaitMs > 0) await sleep(minWaitMs);
      const timeoutMs = Math.max(500, Math.min(optionalNumber(step, "timeoutMs") ?? 10_000, 120_000));
      const waitForAnyText = optionalStringArray(step, "waitForAnyText") ?? [];
      const readiness: Record<string, unknown> = {};
      if (waitForAnyText.length > 0) {
        readiness.waitForAnyText = await client.waitForAnyText(sessionId, waitForAnyText, timeoutMs);
      }
      if (optionalBoolean(step, "waitForPackageIdle") ?? false) {
        readiness.waitForPackageIdle = await client.waitForStableSource(sessionId, {
          timeoutMs,
          stableMs: Math.max(500, Math.min(optionalNumber(step, "stableMs") ?? 1_000, 15_000))
        });
      }
      const evidence = await client.saveObservation(options.config, sessionId, label);
      return { action: "collectEvidence", readiness, evidence: evidence as never };
    }
    case "checkpoint": {
      const name = optionalString(step, "name") ?? `checkpoint-${options.index + 1}`;
      const source = await client.pageSource(sessionId);
      const sourcePath = await client.savePageSource(options.config, sessionId, `${options.prefix}-${name}`);
      const screenshotPath = await client.saveScreenshot(options.config, sessionId, `${options.prefix}-${name}`);
      const signature = createScreenSignature(source);
      const result = await upsertCheckpoint(options.config, {
        testName: options.testName,
        name,
        order: optionalNumber(step, "order") ?? options.index + 1,
        signature,
        sourcePath,
        screenshotPath,
        actionToNext: optionalAction(step, "actionToNext")
      });
      return {
        action: "checkpoint",
        memoryPath: result.memoryPath,
        checkpoint: result.checkpoint as never,
        evidence: { label: name, timestamp: new Date().toISOString(), screenshotPath, sourcePath }
      };
    }
    case "back":
      await client.back(sessionId);
      return { action: "back" };
    case "swipe": {
      const startX = optionalNumber(step, "startX");
      const startY = optionalNumber(step, "startY");
      const endX = optionalNumber(step, "endX");
      const endY = optionalNumber(step, "endY");
      if ([startX, startY, endX, endY].some((value) => value === undefined)) {
        throw new Error("swipe requires startX, startY, endX, and endY");
      }
      const durationMs = optionalNumber(step, "durationMs") ?? 500;
      await client.swipe(sessionId, startX!, startY!, endX!, endY!, durationMs);
      return { action: "swipe", startX, startY, endX, endY, durationMs };
    }
    default:
      throw new Error(`Unsupported flow script action: ${action}`);
  }
}

function normalizeScriptAction(value: string): string {
  const aliases: Record<string, string> = {
    "appium.wait_for_visible": "waitText",
    "appium.tap_by_text": "tapText",
    "appium.type_text": "type",
    "verify.assert_screen_contains_text": "assertText",
    "verify.collect_evidence": "collectEvidence",
    wait_text: "waitText",
    tap_text: "tapText",
    assert_text: "assertText",
    collect_evidence: "collectEvidence"
  };
  return aliases[value] ?? value;
}

function generateScenariosFromAnalysis(
  analysis: CodeFlowAnalysis,
  options: { goal?: string; maxScenarios: number; includeNegativeCases: boolean }
): Array<Record<string, unknown>> {
  const scenarios: Array<Record<string, unknown>> = [];
  const visibleTexts = uniqueStrings(analysis.visibleTexts.map((entry) => entry.text));
  const clickableTexts = visibleTexts.filter((text) => /giriş|login|sign in|register|kayıt|devam|continue|next|başla|start|save|kaydet|submit/i.test(text));
  const formHints = visibleTexts.filter((text) => /email|e-posta|password|şifre|phone|telefon|name|ad|soyad/i.test(text));

  scenarios.push({
    id: "launch-smoke",
    title: "Launch smoke test",
    goal: options.goal ?? "Verify app launches into a stable first screen",
    priority: "P0",
    steps: [
      { action: "observe", waitForPackageIdle: true },
      ...visibleTexts.slice(0, 2).map((text) => ({ action: "assertText", text })),
      { action: "collectEvidence", label: "launch-smoke" }
    ],
    assertions: ["No app crash in logcat", "At least one expected first-screen text is visible"]
  });

  for (const text of clickableTexts.slice(0, 4)) {
    scenarios.push({
      id: `tap-${slug(text)}`,
      title: `Tap "${text}" and verify navigation does not crash`,
      priority: "P1",
      steps: [
        { action: "waitText", text },
        { action: "tapText", text, matchMode: "auto" },
        { action: "observe", waitForPackageIdle: true },
        { action: "collectEvidence", label: `after-${slug(text)}` }
      ],
      assertions: ["Appium session remains healthy", "No app crash in logcat"]
    });
  }

  if (options.includeNegativeCases && formHints.length > 0) {
    scenarios.push({
      id: "form-validation-empty-submit",
      title: "Form validation rejects empty submit",
      priority: "P1",
      steps: [
        ...clickableTexts.slice(0, 1).map((text) => ({ action: "tapText", text, matchMode: "auto" })),
        { action: "collectEvidence", label: "empty-submit-validation" }
      ],
      assertions: ["Validation message is visible", "No remote mutation should be required for invalid input"],
      candidates: { formHints: formHints.slice(0, 10) }
    });
  }

  for (const route of analysis.routes.slice(0, 4)) {
    scenarios.push({
      id: `route-${slug(route.route)}`,
      title: `Reach route ${route.route}`,
      priority: "P2",
      source: `${route.file}:${route.line}`,
      route: route.route,
      target: route.target,
      steps: [
        { action: "observe", waitForPackageIdle: true },
        { action: "collectEvidence", label: `route-${slug(route.route)}` }
      ],
      assertions: ["Navigation target can be reached from a known checkpoint"]
    });
  }

  return scenarios.slice(0, Math.max(1, Math.min(options.maxScenarios, 50)));
}

function objectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)));
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase("en-US");
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function signatureSummary(signature: ReturnType<typeof createScreenSignature>): Record<string, unknown> {
  return {
    hash: signature.hash,
    texts: signature.texts.slice(0, 20),
    contentDescriptions: signature.contentDescriptions.slice(0, 20),
    resourceIds: signature.resourceIds.slice(0, 20),
    clickableTexts: signature.clickableTexts.slice(0, 20),
    tokenCount: signature.tokens.length
  };
}

function slug(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "scenario";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
