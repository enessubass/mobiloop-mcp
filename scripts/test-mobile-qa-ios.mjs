import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const repo = fileURLToPath(new URL("../", import.meta.url));
const device = process.env.MOBILOOP_IOS_TEST_DEVICE;
if (!device) throw new Error("Set MOBILOOP_IOS_TEST_DEVICE to the intended iOS simulator UDID.");
const workspace = path.join(repo, ".mobiloop", "fixtures", "flutter-ios-login-demo");
const bundleId = "io.github.enessubass.mobiloopFlutterLoginDemo";
const runId = `mobile-qa-ios-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifacts = path.join(repo, ".mobiloop");
const summaryPath = path.join(artifacts, "runs", runId, "summary.json");
const approval = {
  approved: true,
  approvedBy: "fixture-test-runner",
  reason: "Build, install, and test only the dedicated MobiLoop iOS demo on the selected simulator"
};
const result = { runId, device, bundleId, sourceBuilt: false, scenarios: [] };
const client = new Client({ name: "mobiloop-ios-qa", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(repo, "dist", "src", "index.js")],
  cwd: repo,
  env: {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...(process.env.DEVELOPER_DIR ? { DEVELOPER_DIR: process.env.DEVELOPER_DIR } : {}),
    MOBILOOP_WORKSPACE_ROOT: workspace,
    MOBILOOP_SECURITY_MODE: "secure",
    MOBILOOP_ARTIFACTS_DIR: artifacts,
    MOBILOOP_RUN_ID: runId,
    APPIUM_SERVER_URL: process.env.APPIUM_SERVER_URL ?? "http://127.0.0.1:4723"
  },
  stderr: "pipe"
});

try {
  await client.connect(transport);
  const preflight = await call("env.preflight", { target: "ios" });
  assert.equal(preflight.passed, true, JSON.stringify(preflight.requiredFailures));
  const simulators = await call("ios.list_simulators");
  assert.ok(
    Object.values(simulators.devices)
      .flat()
      .some((entry) => entry.udid === device && entry.isAvailable)
  );
  const project = await call("build.detect_project");
  assert.equal(project.kind, "flutter");
  const scan = await call("security.scan_source", { paths: ["lib", "ios/Runner/Info.plist"] });
  const plan = await call("security.generate_test_plan", { reportPath: scan.reportPath });
  Object.assign(result, { scanReport: scan.reportPath, securityPlan: plan.planPath });
  await call("build.run_unit_tests", { kind: "flutter", approval });
  const build = await call("ios.build_app", {
    workspace: "ios/Runner.xcworkspace",
    scheme: "Runner",
    sdk: "iphonesimulator",
    configuration: "Debug",
    destination: `platform=iOS Simulator,id=${device}`,
    buildSettings: { ARCHS: "arm64", EXCLUDED_ARCHS: "", CODE_SIGNING_ALLOWED: "NO" },
    approval
  });
  assert.ok(build.appPaths.length > 0, "MobiLoop must return the built .app bundle");
  Object.assign(result, { sourceBuilt: true, appPath: build.appPaths[0], buildLog: build.logPath });
  console.log("iOS: Flutter unit tests and MobiLoop Xcode build passed");
  await call("ios.boot_simulator", { device, waitForBoot: true, approval });
  await call("ios.install_app", { device, appPath: result.appPath, approval });
  const capabilities = {
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    "appium:udid": device,
    ...(process.env.MOBILOOP_IOS_TEST_PLATFORM_VERSION
      ? { "appium:platformVersion": process.env.MOBILOOP_IOS_TEST_PLATFORM_VERSION }
      : {}),
    "appium:bundleId": bundleId,
    "appium:noReset": true,
    "appium:forceAppLaunch": true,
    "appium:shouldTerminateApp": true
  };
  const cases = [
    {
      name: "invalid-email",
      email: "invalid",
      password: "123456",
      expected: "Geçerli e-posta girin"
    },
    {
      name: "short-password",
      email: "fixture@example.invalid",
      password: "123",
      expected: "Şifre en az 6 karakter olmalı"
    },
    {
      name: "valid-login",
      email: "fixture@example.invalid",
      password: "123456",
      expected: "Ana Sayfa"
    }
  ];
  for (const [index, scenario] of cases.entries()) {
    let sessionId;
    const outcome = { name: scenario.name, passed: false, sessionClosed: false };
    result.scenarios.push(outcome);
    try {
      ({ sessionId } = await call("appium.create_session", { capabilities, approval }));
      assert.ok(sessionId);
      await call("appium.observe_screen", {
        sessionId,
        waitForAnyText: ["Giriş Yap"],
        prefix: `${scenario.name}-before`,
        approval
      });
      const flow = await call("flow.run_script", {
        sessionId,
        testName: scenario.name,
        delayMs: 100,
        steps: [
          {
            action: "type",
            locator: { strategy: "text", value: "E-posta" },
            text: scenario.email,
            mode: "sendKeys"
          },
          {
            action: "type",
            locator: { strategy: "text", value: "Şifre" },
            text: scenario.password,
            mode: "sendKeys"
          },
          { action: "tapText", text: "Giriş Yap", matchMode: "exact" },
          { action: "waitText", text: scenario.expected, timeoutMs: 10000 },
          { action: "assertText", text: scenario.expected }
        ],
        approval
      });
      assert.equal(flow.passed, true, JSON.stringify(flow));
      const observation = await call("appium.observe_screen", {
        sessionId,
        prefix: scenario.name,
        approval
      });
      const screenshot = await call("ios.capture_screenshot", {
        device,
        prefix: scenario.name,
        approval
      });
      const logs = await call("ios.collect_logs", {
        device,
        prefix: scenario.name,
        last: "1m",
        predicate: 'process == "Runner"',
        approval
      });
      const health = await call("verify.assert_appium_session_healthy", { sessionId });
      assert.equal(health.passed, true);
      Object.assign(outcome, {
        passed: true,
        assertion: scenario.expected,
        observation,
        screenshot,
        logs
      });
      await call("loop.record_iteration", {
        iteration: index + 1,
        goal: scenario.name,
        build: "success",
        device,
        test_result: "passed",
        retest: "passed",
        artifacts: [
          build.logPath,
          observation.screenshotPath,
          observation.sourcePath,
          screenshot.screenshotPath,
          logs.logPath
        ]
      });
    } catch (error) {
      outcome.failure = error instanceof Error ? error.message : String(error);
      if (sessionId) {
        outcome.failureEvidence = await call("appium.observe_screen", {
          sessionId,
          prefix: `${scenario.name}-failure`,
          approval
        }).catch((captureError) => ({ error: captureError.message }));
      }
      throw error;
    } finally {
      if (sessionId) {
        await call("appium.delete_session", { sessionId, approval });
        outcome.sessionClosed = true;
      }
    }
    console.log(`iOS: ${scenario.name} passed; session closed`);
  }
  const negative = await call("orchestrator.run_ios_validation_loop", {
    goal: "Negative control: visible login must fail assert_not_visible",
    simulatorDevice: device,
    bundleId,
    runLint: false,
    runUnitTests: false,
    buildIosApp: false,
    bootSimulator: false,
    installApp: false,
    launchApp: false,
    collectEvidence: true,
    simulatorLogLast: "1m",
    simulatorLogPredicate: 'process == "Runner"',
    maxTestIterations: 1,
    iterationOffset: 3,
    appiumCapabilities: capabilities,
    appiumSteps: [
      {
        tool: "appium.wait_for_visible",
        args: { locator: { strategy: "text", value: "Giriş Yap" }, timeoutMs: 10000 }
      },
      {
        tool: "appium.assert_not_visible",
        args: { locator: { strategy: "text", value: "Giriş Yap" }, timeoutMs: 100 }
      }
    ],
    approval
  });
  assert.equal(negative.passed, false);
  assert.match(negative.failure, /appium.assert_not_visible failed/);
  result.negativeControlRejected = true;
  result.report = await call("loop.generate_report", {
    finalStatus: "passed",
    summary:
      "Source was built by MobiLoop, installed, and three iOS login/input-validation scenarios passed. The fourth iteration is an intentionally failing assertion control. The generated security plan was not fully executed."
  });
  console.log("iOS: negative control correctly rejected");
} catch (error) {
  result.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await client.close();
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Summary: ${summaryPath}`);
}

async function call(name, args = {}) {
  const response = CallToolResultSchema.parse(
    await client.callTool({ name, arguments: args }, undefined, { timeout: 600000 })
  );
  assert.notEqual(response.isError, true, JSON.stringify(response));
  return JSON.parse(
    response.content
      .filter((entry) => entry.type === "text")
      .map((entry) => entry.text)
      .join("\n")
  );
}
