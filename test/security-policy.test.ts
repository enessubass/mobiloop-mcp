import assert from "node:assert/strict";
import test from "node:test";
import { McpTool } from "../src/types.js";
import { enforceToolSecurityPolicy } from "../src/utils/security-policy.js";
import { createTestConfig } from "./helpers.js";

const appiumTool: McpTool = {
  name: "appium.create_session",
  description: "test tool",
  inputSchema: { type: "object" },
  async handler() {
    return { content: [{ type: "text", text: "{}" }] };
  }
};

const ensureAppiumTool: McpTool = {
  ...appiumTool,
  name: "env.ensure_appium"
};

test("secure mode rejects direct and nested Appium endpoint overrides", async () => {
  const config = await createTestConfig({ securityMode: "secure", requireApproval: true });
  assert.throws(
    () => enforceToolSecurityPolicy(appiumTool, { serverUrl: "http://example.test:4723" }, config),
    /serverUrl overrides are disabled/
  );
  assert.throws(
    () =>
      enforceToolSecurityPolicy(
        appiumTool,
        { steps: [{ args: { serverUrl: "http://example.test:4723" } }] },
        config
      ),
    /serverUrl overrides are disabled/
  );
});

test("secure mode prevents arbitrary Appium command and host settings", async () => {
  const config = await createTestConfig({ securityMode: "secure", requireApproval: true });
  assert.throws(
    () => enforceToolSecurityPolicy(ensureAppiumTool, { appiumCommand: "/bin/echo" }, config),
    /appiumCommand cannot be overridden/
  );
  assert.throws(
    () => enforceToolSecurityPolicy(ensureAppiumTool, { driverName: "arbitrary" }, config),
    /only permits/
  );
  assert.doesNotThrow(() =>
    enforceToolSecurityPolicy(ensureAppiumTool, { driverName: "uiautomator2" }, config)
  );
});

test("trusted mode keeps Appium endpoint overrides on its allowlist", async () => {
  const config = await createTestConfig({
    appiumAllowlist: ["http://mock-appium.local:*"],
    securityMode: "trusted"
  });
  assert.doesNotThrow(() =>
    enforceToolSecurityPolicy(appiumTool, { serverUrl: "http://mock-appium.local:4723" }, config)
  );
  assert.throws(
    () => enforceToolSecurityPolicy(appiumTool, { serverUrl: "http://other.local:4723" }, config),
    /not allowed/
  );
});
