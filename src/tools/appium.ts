import { AppiumClient, TextMatchMode, locatorFromInput } from "../utils/appium-client.js";
import { McpTool, jsonResponse } from "../types.js";
import {
  arraySchema,
  booleanSchema,
  locatorSchema,
  numberSchema,
  objectSchema,
  stringSchema
} from "../schema.js";
import {
  asObject,
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requireString,
  stringEnum,
  unknownJsonObject
} from "../utils/validation.js";

export function appiumTools(): McpTool[] {
  return [
    {
      name: "appium.create_session",
      description: "Create an Appium session. Pass W3C capabilities or raw capabilities object.",
      inputSchema: objectSchema(
        {
          serverUrl: stringSchema,
          capabilities: { type: "object", additionalProperties: true }
        },
        ["capabilities"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const capabilities = unknownJsonObject(args, "capabilities");
        const result = await new AppiumClient({ serverUrl }).createSession(capabilities);
        return jsonResponse({
          serverUrl,
          sessionId: result.sessionId,
          value: result.value as never
        });
      }
    },
    {
      name: "appium.delete_session",
      description: "Delete an Appium session.",
      inputSchema: objectSchema({ sessionId: stringSchema, serverUrl: stringSchema }, [
        "sessionId"
      ]),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const value = await new AppiumClient({ serverUrl }).deleteSession(sessionId);
        return jsonResponse({ serverUrl, sessionId, value: value as never });
      }
    },
    {
      name: "appium.observe_screen",
      description:
        "Capture screenshot and page source for the current Appium session, optionally waiting for app UI readiness.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          prefix: stringSchema,
          waitForAnyText: arraySchema(stringSchema),
          waitForPackageIdle: booleanSchema,
          minWaitMs: numberSchema,
          stableMs: numberSchema,
          timeoutMs: numberSchema
        },
        ["sessionId"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const prefix = optionalString(args, "prefix") ?? "appium-observe";
        const client = new AppiumClient({ serverUrl });
        const minWaitMs = Math.max(0, Math.min(optionalNumber(args, "minWaitMs") ?? 0, 30_000));
        if (minWaitMs > 0) await sleep(minWaitMs);
        const timeoutMs = Math.max(
          500,
          Math.min(optionalNumber(args, "timeoutMs") ?? 10_000, 120_000)
        );
        const waitForAnyText = optionalStringArray(args, "waitForAnyText") ?? [];
        const readiness: Record<string, unknown> = {};
        if (waitForAnyText.length > 0) {
          readiness.waitForAnyText = await client.waitForAnyText(
            sessionId,
            waitForAnyText,
            timeoutMs
          );
        }
        if (optionalBoolean(args, "waitForPackageIdle") ?? false) {
          readiness.waitForPackageIdle = await client.waitForStableSource(sessionId, {
            timeoutMs,
            stableMs: Math.max(500, Math.min(optionalNumber(args, "stableMs") ?? 1_000, 15_000))
          });
        }
        const evidence = await client.saveObservation(config, sessionId, prefix);
        return jsonResponse({
          serverUrl,
          sessionId,
          screenshotPath: evidence.screenshotPath,
          sourcePath: evidence.sourcePath,
          evidence,
          readiness
        });
      }
    },
    {
      name: "appium.get_page_source",
      description: "Return raw Appium page source XML.",
      inputSchema: objectSchema({ sessionId: stringSchema, serverUrl: stringSchema }, [
        "sessionId"
      ]),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const source = await new AppiumClient({ serverUrl }).pageSource(sessionId);
        return jsonResponse({ serverUrl, sessionId, source });
      }
    },
    {
      name: "appium.get_accessibility_tree",
      description: "Return a compact accessibility summary parsed from page source.",
      inputSchema: objectSchema({ sessionId: stringSchema, serverUrl: stringSchema }, [
        "sessionId"
      ]),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const tree = await new AppiumClient({ serverUrl }).accessibilitySummary(sessionId);
        return jsonResponse({ serverUrl, sessionId, tree: tree as never });
      }
    },
    {
      name: "appium.tap_by_text",
      description:
        "Tap a visible element by text with exact-first matching before contains fallback.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          text: stringSchema,
          matchMode: stringSchema,
          timeoutMs: numberSchema
        },
        ["sessionId", "text"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const text = requireString(args, "text");
        const timeoutMs = optionalNumber(args, "timeoutMs") ?? 10_000;
        const matchMode = stringEnum(
          args,
          "matchMode",
          ["auto", "exact", "contains"] as const,
          "auto"
        );
        const client = new AppiumClient({ serverUrl });
        const wait = await client.waitForVisible(
          sessionId,
          { strategy: "text", value: text },
          timeoutMs
        );
        if (!wait.found) throw new Error(`Text not visible: ${text}`);
        const tapTarget = await client.findTextTapTarget(
          sessionId,
          text,
          matchMode as TextMatchMode
        );
        await client.clickElement(sessionId, tapTarget.elementId);
        return jsonResponse({
          serverUrl,
          sessionId,
          tapped: true,
          text,
          matchMode,
          target: tapTarget as never
        });
      }
    },
    {
      name: "appium.tap_by_accessibility_id",
      description: "Tap by accessibility id.",
      inputSchema: objectSchema(
        { sessionId: stringSchema, serverUrl: stringSchema, accessibilityId: stringSchema },
        ["sessionId", "accessibilityId"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const accessibilityId = requireString(args, "accessibilityId");
        const client = new AppiumClient({ serverUrl });
        const element = await client.findElement(sessionId, {
          strategy: "accessibility id",
          value: accessibilityId
        });
        await client.clickElement(sessionId, element);
        return jsonResponse({ serverUrl, sessionId, tapped: true, accessibilityId });
      }
    },
    {
      name: "appium.tap_by_resource_id",
      description: "Tap by Android resource id or Appium id locator.",
      inputSchema: objectSchema(
        { sessionId: stringSchema, serverUrl: stringSchema, resourceId: stringSchema },
        ["sessionId", "resourceId"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const resourceId = requireString(args, "resourceId");
        const client = new AppiumClient({ serverUrl });
        const element = await client.findElement(sessionId, { strategy: "id", value: resourceId });
        await client.clickElement(sessionId, element);
        return jsonResponse({ serverUrl, sessionId, tapped: true, resourceId });
      }
    },
    {
      name: "appium.tap_coordinates",
      description: "Tap screen coordinates. Use only when semantic locators are unavailable.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          x: numberSchema,
          y: numberSchema
        },
        ["sessionId", "x", "y"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const x = optionalNumber(args, "x");
        const y = optionalNumber(args, "y");
        if (x === undefined || y === undefined) throw new Error("x and y are required");
        await new AppiumClient({ serverUrl }).pointerTap(sessionId, x, y);
        return jsonResponse({ serverUrl, sessionId, tapped: true, x, y });
      }
    },
    {
      name: "appium.type_text",
      description:
        "Type text into an element located by accessibility id, id, xpath, text, or native selector.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          locator: locatorSchema(),
          text: stringSchema,
          mode: stringSchema,
          clearFirst: booleanSchema
        },
        ["sessionId", "locator", "text"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const text = requireString(args, "text");
        const clearFirst = optionalBoolean(args, "clearFirst") ?? true;
        const mode = stringEnum(
          args,
          "mode",
          ["sendKeys", "setValue", "adbKeyboard"] as const,
          "sendKeys"
        );
        const locator = locatorFromInput(args);
        const client = new AppiumClient({ serverUrl });
        const element = await client.findElement(sessionId, locator);
        if (clearFirst) await client.clearElement(sessionId, element);
        if (mode === "setValue") {
          await client.setElementValue(sessionId, element, text);
        } else if (mode === "adbKeyboard") {
          await client.adbInputText(sessionId, element, text);
        } else {
          await client.typeText(sessionId, element, text);
        }
        return jsonResponse({
          serverUrl,
          sessionId,
          typed: true,
          locator: locator as never,
          clearFirst,
          mode
        });
      }
    },
    {
      name: "appium.swipe",
      description: "Perform a touch swipe by coordinates.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          startX: numberSchema,
          startY: numberSchema,
          endX: numberSchema,
          endY: numberSchema,
          durationMs: numberSchema
        },
        ["sessionId", "startX", "startY", "endX", "endY"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const startX = optionalNumber(args, "startX");
        const startY = optionalNumber(args, "startY");
        const endX = optionalNumber(args, "endX");
        const endY = optionalNumber(args, "endY");
        const durationMs = optionalNumber(args, "durationMs") ?? 500;
        if ([startX, startY, endX, endY].some((value) => value === undefined)) {
          throw new Error("startX, startY, endX, endY are required");
        }
        await new AppiumClient({ serverUrl }).swipe(
          sessionId,
          startX!,
          startY!,
          endX!,
          endY!,
          durationMs
        );
        return jsonResponse({
          serverUrl,
          sessionId,
          swiped: true,
          startX,
          startY,
          endX,
          endY,
          durationMs
        });
      }
    },
    {
      name: "appium.go_back",
      description: "Send Android/iOS back navigation to the Appium session.",
      inputSchema: objectSchema({ sessionId: stringSchema, serverUrl: stringSchema }, [
        "sessionId"
      ]),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        await new AppiumClient({ serverUrl }).back(sessionId);
        return jsonResponse({ serverUrl, sessionId, back: true });
      }
    },
    {
      name: "appium.wait_for_visible",
      description: "Wait until a locator becomes visible.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          locator: locatorSchema(),
          timeoutMs: numberSchema
        },
        ["sessionId", "locator"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const timeoutMs = optionalNumber(args, "timeoutMs") ?? 10_000;
        const locator = locatorFromInput(args);
        const result = await new AppiumClient({ serverUrl }).waitForVisible(
          sessionId,
          locator,
          timeoutMs
        );
        return jsonResponse({
          serverUrl,
          sessionId,
          locator: locator as never,
          timeoutMs,
          ...result
        });
      }
    },
    {
      name: "appium.assert_visible",
      description:
        "Assert that a locator is visible. Returns passed false instead of throwing when not visible.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          locator: locatorSchema(),
          timeoutMs: numberSchema
        },
        ["sessionId", "locator"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const timeoutMs = optionalNumber(args, "timeoutMs") ?? 5_000;
        const locator = locatorFromInput(args);
        const result = await new AppiumClient({ serverUrl }).waitForVisible(
          sessionId,
          locator,
          timeoutMs
        );
        return jsonResponse({
          passed: result.found,
          serverUrl,
          sessionId,
          locator: locator as never,
          timeoutMs
        });
      }
    },
    {
      name: "appium.assert_not_visible",
      description: "Assert that a locator is not visible within timeout.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          locator: locatorSchema(),
          timeoutMs: numberSchema
        },
        ["sessionId", "locator"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const timeoutMs = optionalNumber(args, "timeoutMs") ?? 2_000;
        const locator = locatorFromInput(args);
        const result = await new AppiumClient({ serverUrl }).waitForVisible(
          sessionId,
          locator,
          timeoutMs
        );
        return jsonResponse({
          passed: !result.found,
          serverUrl,
          sessionId,
          locator: locator as never,
          timeoutMs
        });
      }
    }
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
