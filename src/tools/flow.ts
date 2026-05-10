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
  FlowAction
} from "../utils/flow-memory.js";
import {
  asObject,
  optionalBoolean,
  optionalNumber,
  optionalObject,
  optionalString,
  optionalStringArray,
  requireString
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
          signatureSummary: signatureSummary(signature) as never
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
      const target = await client.findTextTapTarget(sessionId, text);
      await client.clickElement(sessionId, target);
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
      const element = await client.findElement(sessionId, locator);
      if (clearFirst) await client.clearElement(sessionId, element);
      await client.typeText(sessionId, element, text);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
