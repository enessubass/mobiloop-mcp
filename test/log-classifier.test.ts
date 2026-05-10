import assert from "node:assert/strict";
import test from "node:test";
import { classifyLogcat } from "../src/utils/log-classifier.js";

test("classifyLogcat detects Firestore permission failures as remote rules", () => {
  const result = classifyLogcat("W/Firestore: PERMISSION_DENIED: Missing or insufficient permissions.");
  assert.equal(result.status, "remote_rules_not_deployed");
  assert.equal(result.externalDependencyFindings.length, 1);
  assert.match(result.likelyRootCause, /Firestore permission/i);
});

test("classifyLogcat distinguishes Appium instrumentation errors from app crashes", () => {
  const result = classifyLogcat("E/Instrumentation: INSTRUMENTATION_STATUS: Error=UiAutomator2 died");
  assert.equal(result.status, "automation_error");
  assert.equal(result.automationFindings.length, 1);
  assert.equal(result.appCrashFindings.length, 0);
});

test("classifyLogcat detects app crash signatures", () => {
  const result = classifyLogcat("E/AndroidRuntime: FATAL EXCEPTION: main");
  assert.equal(result.status, "app_bug");
  assert.equal(result.appCrashFindings.length, 1);
});
