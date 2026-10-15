import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { orchestratorTools } from "../../src/tools/orchestrator.js";
import { createTestConfig, startMockAppium } from "../helpers.js";

for (const platform of ["android", "ios"] as const) {
  test(`${platform} orchestrator stops when a visibility wait returns found false`, async () => {
    const mock = await startMockAppium({
      respond: (request) =>
        request.path.endsWith("/element")
          ? new Response(
              JSON.stringify({ value: { error: "no such element", message: "Not visible" } }),
              { status: 404 }
            )
          : undefined
    });
    const config = await createTestConfig({ appiumServerUrl: mock.serverUrl });
    try {
      const tool = orchestratorTools().find(
        (entry) => entry.name === `orchestrator.run_${platform}_validation_loop`
      )!;
      const result = json(
        await tool.handler(
          {
            goal: "A missing prerequisite must stop later actions",
            runLint: false,
            runUnitTests: false,
            buildDebugApk: false,
            buildIosApp: false,
            collectEvidence: false,
            maxTestIterations: 1,
            appiumCapabilities: { platformName: platform === "android" ? "Android" : "iOS" },
            appiumSteps: [
              {
                tool: "appium.wait_for_visible",
                args: { locator: { strategy: "text", value: "Missing screen" }, timeoutMs: 1 }
              },
              { tool: "appium.go_back", args: {} }
            ]
          },
          { config }
        )
      );
      assert.equal(result.passed, false);
      assert.match(result.failure, /appium.wait_for_visible failed/);
      assert.equal(
        mock.requests.some((request) => request.path.endsWith("/back")),
        false
      );
      assert.equal(mock.requests.filter((request) => request.method === "DELETE").length, 1);
    } finally {
      mock.close();
    }
  });

  test(`${platform} orchestrator fails on a negative Appium assertion and closes every session`, async () => {
    const mock = await startMockAppium({ sessionIds: ["s1", "s2"] });
    const config = await createTestConfig({ appiumServerUrl: mock.serverUrl });
    try {
      const tool = orchestratorTools().find(
        (entry) => entry.name === `orchestrator.run_${platform}_validation_loop`
      )!;
      const result = await tool.handler(
        {
          goal: "A visible login button must not be reported as absent",
          runLint: false,
          runUnitTests: false,
          buildDebugApk: false,
          buildIosApp: false,
          collectEvidence: false,
          maxTestIterations: 2,
          appiumCapabilities: { platformName: platform === "android" ? "Android" : "iOS" },
          appiumSteps: [
            {
              tool: "appium.assert_not_visible",
              args: { locator: { strategy: "text", value: "Giriş Yap" }, timeoutMs: 1 }
            },
            { tool: "appium.go_back", args: {} }
          ]
        },
        { config }
      );
      const payload = json(result);
      assert.equal(payload.passed, false);
      assert.equal(payload.iterations.length, 2);
      assert.match(payload.failure, /appium.assert_not_visible/);
      assert.equal(
        mock.requests.filter((r) => r.method === "POST" && r.path === "/session").length,
        2
      );
      assert.equal(mock.requests.filter((r) => r.method === "DELETE").length, 2);
      assert.ok(mock.requests.some((r) => r.path.startsWith("/session/s2/element")));
      assert.equal(
        mock.requests.some((r) => r.path.endsWith("/back")),
        false
      );
      assert.equal(
        mock.requests.some((r) => r.path.endsWith("/screenshot")),
        false
      );
      const records = await fs.readFile(
        path.join(config.artifactsDir, "loop", "iterations.jsonl"),
        "utf8"
      );
      assert.ok(
        records
          .trim()
          .split("\n")
          .every((line) => JSON.parse(line).test_result === "failed")
      );
    } finally {
      mock.close();
    }
  });
}

test("Android evidence capture failure cannot produce a passing loop and still closes the session", async () => {
  const mock = await startMockAppium({
    respond: (request) =>
      request.path.endsWith("/screenshot")
        ? new Response(
            JSON.stringify({
              value: { error: "unknown error", message: "Screenshot unavailable" }
            }),
            { status: 500 }
          )
        : undefined
  });
  const config = await createTestConfig({ appiumServerUrl: mock.serverUrl });
  try {
    const result = json(
      await orchestratorTools()[0].handler(
        {
          goal: "Unavailable evidence remains a failure",
          runLint: false,
          runUnitTests: false,
          buildDebugApk: false,
          collectEvidence: true,
          maxTestIterations: 1,
          appiumCapabilities: { platformName: "Android" },
          expectedTexts: ["Ana Sayfa"]
        },
        { config }
      )
    );
    assert.equal(result.passed, false);
    assert.match(result.failure, /Screenshot unavailable/);
    assert.match(result.iterations[0].evidence.evidenceCollectionError, /Screenshot unavailable/);
    assert.equal(mock.requests.filter((request) => request.method === "DELETE").length, 1);
  } finally {
    mock.close();
  }
});

test("Android orchestrator reports setup failure without starting an Appium session", async () => {
  const mock = await startMockAppium();
  const config = await createTestConfig({ appiumServerUrl: mock.serverUrl });
  try {
    const result = await orchestratorTools()[0].handler(
      { goal: "Missing project setup", runUnitTests: false, buildDebugApk: false },
      { config }
    );
    const payload = json(result);
    assert.equal(payload.passed, false);
    assert.equal(payload.setupFailure, true);
    assert.match(payload.failure, /Missing required enum: kind/);
    assert.equal(mock.requests.length, 0);
    const records = await fs.readFile(
      path.join(config.artifactsDir, "loop", "iterations.jsonl"),
      "utf8"
    );
    assert.equal(JSON.parse(records.trim()).test_result, "failed");
  } finally {
    mock.close();
  }
});

test("Android orchestrator retains failed HTTP assertions with numeric status codes", async () => {
  const mock = await startMockAppium({
    respond: (request) =>
      request.path === "/health" ? new Response("service unavailable", { status: 503 }) : undefined
  });
  const config = await createTestConfig({
    appiumServerUrl: mock.serverUrl,
    apiAllowlist: [mock.serverUrl]
  });
  try {
    const result = await orchestratorTools()[0].handler(
      {
        goal: "API outage remains a failed check",
        runLint: false,
        runUnitTests: false,
        buildDebugApk: false,
        collectEvidence: false,
        maxTestIterations: 1,
        apiChecks: [{ url: `${mock.serverUrl}/health`, expectedStatus: 200 }]
      },
      { config }
    );
    const payload = json(result);
    assert.equal(payload.passed, false);
    assert.equal(payload.iterations[0].checks[0].result.status, 503);
    assert.equal(payload.iterations[0].checks[0].result.expectedStatus, 200);
    assert.doesNotMatch(payload.failure, /status must be a string/);
  } finally {
    mock.close();
  }
});

function json(response: { content: Array<{ type: string; text?: string }> }): any {
  return JSON.parse(response.content.map((entry) => entry.text ?? "").join("\n"));
}

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

test("orchestrator.run_ios_validation_loop can pass against mock Appium without simulator mutation", async () => {
  const mock = await startMockAppium();
  const config = await createTestConfig({
    appiumServerUrl: mock.serverUrl,
    maxTestIterations: 1
  });
  try {
    const tool = orchestratorTools().find(
      (entry) => entry.name === "orchestrator.run_ios_validation_loop"
    );
    assert.ok(tool);
    const result = await tool.handler(
      {
        goal: "Mock iOS login validation",
        runLint: false,
        runUnitTests: false,
        buildIosApp: false,
        bootSimulator: false,
        installApp: false,
        launchApp: false,
        collectEvidence: false,
        maxTestIterations: 1,
        appiumCapabilities: {
          platformName: "iOS",
          "appium:automationName": "XCUITest",
          "appium:deviceName": "iPhone 15",
          "appium:bundleId": "com.example.app"
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
