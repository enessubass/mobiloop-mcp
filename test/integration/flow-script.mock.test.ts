import assert from "node:assert/strict";
import test from "node:test";
import { flowTools } from "../../src/tools/flow.js";
import { createTestConfig, startMockAppium } from "../helpers.js";

test("flow.run_script executes wait, type, tap, assert, and evidence steps against mock Appium", async () => {
  const mock = await startMockAppium();
  const config = await createTestConfig({ appiumServerUrl: mock.serverUrl });
  try {
    const tool = flowTools().find((entry) => entry.name === "flow.run_script");
    assert.ok(tool);
    const result = await tool.handler(
      {
        sessionId: "s1",
        serverUrl: mock.serverUrl,
        delayMs: 0,
        steps: [
          { action: "waitText", text: "Giriş Yap", timeoutMs: 1000 },
          {
            action: "type",
            locator: { strategy: "text", value: "E-posta" },
            text: "root@example.com",
            mode: "sendKeys"
          },
          { action: "tapText", text: "Giriş Yap", matchMode: "exact" },
          { action: "assertText", text: "Ana Sayfa" },
          { action: "collectEvidence", label: "mock-flow" }
        ]
      },
      { config }
    );
    const payload = JSON.parse(
      result.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n")
    );
    assert.equal(payload.passed, true);
    assert.equal(payload.executed.length, 5);
    assert.ok(payload.evidence[0].screenshotPath);
    assert.ok(mock.requests.some((request) => request.path === "/session/s1/element/email/value"));
  } finally {
    await mock.close();
  }
});
