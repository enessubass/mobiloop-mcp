import assert from "node:assert/strict";
import test from "node:test";
import { orchestratorTools } from "../../src/tools/orchestrator.js";
import { createTestConfig, startMockAppium } from "../helpers.js";

test("orchestrator.run_android_validation_loop can pass against mock Appium without device mutation", async () => {
  const mock = await startMockAppium();
  const config = await createTestConfig({
    appiumServerUrl: mock.serverUrl,
    maxTestIterations: 1
  });
  try {
    const tool = orchestratorTools().find(
      (entry) => entry.name === "orchestrator.run_android_validation_loop"
    );
    assert.ok(tool);
    const result = await tool.handler(
      {
        goal: "Mock Android login validation",
        runLint: false,
        runUnitTests: false,
        buildDebugApk: false,
        collectEvidence: true,
        maxTestIterations: 1,
        appiumCapabilities: {
          platformName: "Android",
          "appium:automationName": "UiAutomator2"
        },
        appiumSteps: [
          {
            tool: "appium.wait_for_visible",
            args: { locator: { strategy: "text", value: "Giriş Yap" }, timeoutMs: 1000 }
          }
        ],
        expectedTexts: ["Ana Sayfa"]
      },
      { config }
    );
    const payload = JSON.parse(
      result.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n")
    );
    assert.equal(payload.passed, true);
    assert.equal(payload.status, "passed");
    assert.equal(payload.iterations.length, 1);
  } finally {
    await mock.close();
  }
});
