import assert from "node:assert/strict";
import test from "node:test";
import { flowTools } from "../../src/tools/flow.js";
import { appiumTools } from "../../src/tools/appium.js";
import { createTestConfig, startMockAppium } from "../helpers.js";

for (const entrypoint of ["appium.hide_keyboard", "flow.run_script"]) {
  test(`${entrypoint} verifies the keyboard state through the shared client`, async () => {
    let hidden = false;
    const mock = await startMockAppium({
      respond: (request) => {
        if (request.path.endsWith("/is_keyboard_shown"))
          return new Response(JSON.stringify({ value: !hidden }));
        if (request.path.endsWith("/hide_keyboard")) {
          hidden = true;
          return new Response(JSON.stringify({ value: null }));
        }
        return undefined;
      }
    });
    try {
      const config = await createTestConfig({ appiumServerUrl: mock.serverUrl });
      const tool = [...appiumTools(), ...flowTools()].find((entry) => entry.name === entrypoint)!;
      const result = await tool.handler(
        {
          sessionId: "s1",
          delayMs: 0,
          ...(entrypoint === "flow.run_script" ? { steps: [{ action: "hideKeyboard" }] } : {})
        },
        { config }
      );
      const payload = JSON.parse(
        result.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n")
      );
      assert.equal(hidden, true);
      assert.notEqual(payload.passed, false);
    } finally {
      await mock.close();
    }
  });
}

for (const entrypoint of ["appium.type_text", "flow.run_script"]) {
  test(`${entrypoint} reacquires a text field replaced by clearing it`, async () => {
    let cleared = false;
    const mock = await startMockAppium({
      respond: (request) => {
        let value: unknown;
        if (request.path === "/session/s1/element") {
          value = { "element-6066-11e4-a52e-4f735466cecf": cleared ? "new-field" : "old-field" };
        } else if (request.path === "/session/s1/element/old-field/clear") {
          cleared = true;
          value = null;
        } else if (request.path === "/session/s1/element/old-field/value") {
          return new Response(
            JSON.stringify({
              value: { error: "stale element reference", message: "Field replaced after clearing" }
            }),
            { status: 404 }
          );
        } else if (request.path === "/session/s1/element/new-field/value") {
          value = null;
        } else {
          return undefined;
        }
        return new Response(JSON.stringify({ value }));
      }
    });
    const config = await createTestConfig({ appiumServerUrl: mock.serverUrl });
    try {
      const tool = [...appiumTools(), ...flowTools()].find((entry) => entry.name === entrypoint)!;
      const input =
        entrypoint === "appium.type_text"
          ? {
              sessionId: "s1",
              locator: { strategy: "text", value: "Password" },
              text: "fixture-value"
            }
          : {
              sessionId: "s1",
              delayMs: 0,
              steps: [
                {
                  action: "type",
                  locator: { strategy: "text", value: "Password" },
                  text: "fixture-value"
                }
              ]
            };
      const response = await tool.handler(input, { config });
      const result = JSON.parse(
        response.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n")
      );
      assert.notEqual(result.passed, false);
      assert.ok(
        mock.requests.some((request) => request.path === "/session/s1/element/new-field/value")
      );
      assert.equal(
        mock.requests.some((request) => request.path === "/session/s1/element/old-field/value"),
        false
      );
    } finally {
      mock.close();
    }
  });
}

test("flow.run_script stops dependent actions after an unmet assertion", async () => {
  const mock = await startMockAppium();
  const config = await createTestConfig({ appiumServerUrl: mock.serverUrl });
  try {
    const tool = flowTools().find((entry) => entry.name === "flow.run_script")!;
    const result = await tool.handler(
      {
        sessionId: "s1",
        delayMs: 0,
        steps: [
          { action: "assertText", text: "Checkout complete" },
          { action: "tapText", text: "Giriş Yap" },
          { action: "collectEvidence", label: "should-not-run" }
        ]
      },
      { config }
    );
    const payload = JSON.parse(
      result.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n")
    );
    assert.equal(payload.passed, false);
    assert.equal(payload.executed.length, 1);
    assert.equal(payload.executed[0].passed, false);
    assert.equal(
      mock.requests.some((request) => request.method === "POST"),
      false
    );
    assert.equal(
      mock.requests.some((request) => request.path.endsWith("/screenshot")),
      false
    );
  } finally {
    mock.close();
  }
});

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
