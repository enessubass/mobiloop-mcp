import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const repo = fileURLToPath(new URL("../", import.meta.url));
const serial = process.env.MOBILOOP_TEST_DEVICE;
if (!serial)
  throw new Error("Set MOBILOOP_TEST_DEVICE to the intended Android test device serial.");
const serverUrl = process.env.APPIUM_SERVER_URL ?? "http://127.0.0.1:4723";
const runId = `mobile-qa-device-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifacts = path.join(repo, ".mobiloop");
const summaryPath = path.join(artifacts, "runs", runId, "summary.json");
const approval = {
  approved: true,
  approvedBy: "fixture-test-runner",
  reason:
    "Run UI checks only in the dedicated MobiLoop demo applications on the selected test device"
};
const availableFixtures = [
  { name: "android-kotlin-login-demo", packageName: "com.example.mobiloopnative", kind: "android" },
  {
    name: "flutter-login-demo",
    packageName: "com.example.mobiloop_flutter_login_demo",
    kind: "flutter"
  },
  { name: "react-native-login-demo", packageName: "com.mobiloopreactnative", kind: "react-native" }
];
const selected = (
  process.env.MOBILOOP_TEST_FIXTURES ?? "android-kotlin-login-demo,flutter-login-demo"
).split(",");
assert.ok(
  selected.length > 0 &&
    selected.every((name) => availableFixtures.some((fixture) => fixture.name === name)),
  "Select only named MobiLoop demo fixtures"
);
const fixtures = selected.map((name) => availableFixtures.find((fixture) => fixture.name === name));
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
const results = [];

try {
  for (const fixture of fixtures) {
    const client = new Client({ name: "mobiloop-device-qa", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(repo, "dist", "src", "index.js")],
      cwd: repo,
      env: {
        PATH: process.env.PATH,
        ...(process.env.JAVA_HOME ? { JAVA_HOME: process.env.JAVA_HOME } : {}),
        ...(process.env.ANDROID_HOME ? { ANDROID_HOME: process.env.ANDROID_HOME } : {}),
        ...(process.env.ANDROID_SDK_ROOT ? { ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT } : {}),
        MOBILOOP_WORKSPACE_ROOT:
          fixture.kind === "react-native"
            ? path.join(repo, ".mobiloop", "fixtures", fixture.name)
            : path.join(repo, "examples", "mobile-fixtures", fixture.name),
        MOBILOOP_SECURITY_MODE: "secure",
        MOBILOOP_ARTIFACTS_DIR: artifacts,
        MOBILOOP_RUN_ID: `${runId}-${fixture.name}`,
        APPIUM_SERVER_URL: serverUrl
      },
      stderr: "pipe"
    });
    try {
      await client.connect(transport);
      const project = await call(client, "build.detect_project");
      assert.equal(project.kind, fixture.kind);
      const devices = await call(client, "device.list_devices");
      assert.ok(
        devices.devices.some((device) => device.serial === serial && device.state === "device")
      );
      const preflight = await call(client, "env.preflight", { target: "android" });
      const scan = await call(client, "security.scan_source");
      const plan = await call(client, "security.generate_test_plan", {
        reportPath: scan.reportPath
      });
      const candidates = await call(client, "flow.generate_test_scenarios", {
        goal: "Login success and invalid input"
      });
      const capabilities = {
        platformName: "Android",
        "appium:automationName": "UiAutomator2",
        "appium:udid": serial,
        "appium:appPackage": fixture.packageName,
        "appium:appActivity": ".MainActivity",
        "appium:noReset": true,
        "appium:forceAppLaunch": true,
        "appium:shouldTerminateApp": true
      };
      const fixtureResult = {
        fixture: fixture.name,
        installedBinaryOnly: true,
        preflightPassed: preflight.passed,
        preflightRequiredFailures: preflight.requiredFailures,
        scanReport: scan.reportPath,
        securityPlan: plan.planPath,
        candidateCount: Array.isArray(candidates.scenarios) ? candidates.scenarios.length : 0,
        scenarios: []
      };
      results.push(fixtureResult);
      for (const [index, scenario] of cases.entries()) {
        let sessionId;
        const result = { name: scenario.name, passed: false, sessionClosed: false };
        fixtureResult.scenarios.push(result);
        try {
          ({ sessionId } = await call(client, "appium.create_session", { capabilities, approval }));
          assert.ok(sessionId);
          await call(client, "appium.observe_screen", {
            sessionId,
            waitForAnyText: ["Giriş Yap"],
            prefix: `${scenario.name}-before`,
            approval
          });
          const locator = (field) =>
            fixture.kind === "android"
              ? { strategy: "id", value: `${fixture.packageName}:id/${field}_field` }
              : fixture.kind === "react-native"
                ? { strategy: "xpath", value: `//*[@resource-id='login.${field}']` }
                : { strategy: "text", value: field === "email" ? "E-posta" : "Şifre" };
          const flow = await call(client, "flow.run_script", {
            sessionId,
            testName: scenario.name,
            delayMs: 100,
            steps: [
              { action: "type", locator: locator("email"), text: scenario.email, mode: "sendKeys" },
              {
                action: "type",
                locator: locator("password"),
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
          const evidence = await call(client, "verify.collect_evidence", {
            sessionId,
            serial,
            packageName: fixture.packageName,
            prefix: scenario.name
          });
          const healthy = await call(client, "verify.assert_appium_session_healthy", { sessionId });
          const crash = await call(client, "verify.assert_no_crash_in_logcat", {
            serial,
            packageName: fixture.packageName
          });
          Object.assign(result, { sessionHealth: healthy, crashCheck: crash });
          assert.equal(healthy.passed, true, JSON.stringify(healthy));
          assert.equal(crash.passed, true, JSON.stringify(crash));
          assert.ok(
            evidence.evidence.screenshotPath &&
              evidence.evidence.sourcePath &&
              evidence.evidence.logPath
          );
          Object.assign(result, {
            passed: true,
            assertion: scenario.expected,
            evidence: evidence.evidence,
            classification: evidence.status
          });
          await call(client, "loop.record_iteration", {
            iteration: index + 1,
            goal: scenario.name,
            build: "not_run",
            device: serial,
            test_result: "passed",
            retest: "passed",
            artifacts: Object.values(evidence.evidence).filter(
              (value) => typeof value === "string" && value.startsWith(artifacts)
            )
          });
        } catch (error) {
          result.failure = error instanceof Error ? error.message : String(error);
          if (sessionId) {
            result.failureEvidence = await call(client, "verify.collect_evidence", {
              sessionId,
              serial,
              packageName: fixture.packageName,
              prefix: `${scenario.name}-failure`
            }).catch((captureError) => ({ error: captureError.message }));
          }
          throw error;
        } finally {
          if (sessionId) {
            await call(client, "appium.delete_session", { sessionId, approval });
            result.sessionClosed = true;
          }
        }
        console.log(`${fixture.name}: ${scenario.name} passed; session closed`);
      }
      const negative = await call(client, "orchestrator.run_android_validation_loop", {
        goal: "Negative control: a visible login button must fail assert_not_visible",
        serial,
        packageName: fixture.packageName,
        runLint: false,
        runUnitTests: false,
        buildDebugApk: false,
        clearAppData: false,
        collectEvidence: true,
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
      assert.equal(negative.passed, false, "The negative control must not pass");
      assert.match(negative.failure, /appium.assert_not_visible failed/);
      fixtureResult.negativeControlRejected = true;
      fixtureResult.report = await call(client, "loop.generate_report", {
        finalStatus: "passed",
        summary:
          "Three installed-binary UI scenarios passed. The fourth iteration is an intentionally failing assertion control. Source was not rebuilt; generated security scenarios were not all executed."
      });
      console.log(`${fixture.name}: negative control correctly rejected`);
    } finally {
      await client.close();
    }
  }
} finally {
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(
    summaryPath,
    `${JSON.stringify({ runId, serial, appiumServerUrl: serverUrl, results }, null, 2)}\n`
  );
  console.log(`Summary: ${summaryPath}`);
}

async function call(client, name, args = {}) {
  const response = CallToolResultSchema.parse(
    await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 })
  );
  assert.notEqual(response.isError, true, JSON.stringify(response));
  return JSON.parse(
    response.content
      .filter((entry) => entry.type === "text")
      .map((entry) => entry.text)
      .join("\n")
  );
}
