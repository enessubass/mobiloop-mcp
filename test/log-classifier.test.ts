import assert from "node:assert/strict";
import test from "node:test";
import { classifyLogcat } from "../src/utils/log-classifier.js";

test("classifyLogcat detects Firestore permission failures as remote rules", () => {
  const result = classifyLogcat(
    "W/Firestore: PERMISSION_DENIED: Missing or insufficient permissions."
  );
  assert.equal(result.status, "remote_rules_not_deployed");
  assert.equal(result.externalDependencyFindings.length, 1);
  assert.match(result.likelyRootCause, /Firestore permission/i);
});

test("classifyLogcat distinguishes Appium instrumentation errors from app crashes", () => {
  const result = classifyLogcat(
    "E/Instrumentation: INSTRUMENTATION_STATUS: Error=UiAutomator2 died"
  );
  assert.equal(result.status, "automation_error");
  assert.equal(result.automationFindings.length, 1);
  assert.equal(result.appCrashFindings.length, 0);
});

test("classifyLogcat detects app crash signatures", () => {
  const result = classifyLogcat("E/AndroidRuntime: FATAL EXCEPTION: main");
  assert.equal(result.status, "app_bug");
  assert.equal(result.appCrashFindings.length, 1);
});

test("classifyLogcat keeps renderer-only warnings non-blocking", () => {
  const result = classifyLogcat(
    [
      "I/EGL_emulation: Opening libGLESv2_emulation.so",
      "W/HWUI: Failed to choose config with EGL_SWAP_BEHAVIOR_PRESERVED"
    ].join("\n")
  );
  assert.equal(result.status, "passed");
  assert.equal(result.likelyRootCause, "");
  assert.equal(result.nextSuggestedAction, "");
  assert.equal(result.findings.length, 2);
});

test("classifyLogcat does not treat caught exceptions or runtime diagnostics as crashes", () => {
  const result = classifyLogcat(
    [
      "10-15 15:35:10.300 8794 8826 D InteractionJankMonitor: java.lang.IllegalArgumentException: Must pass in a valid surface control",
      "E/Example: Caught java.lang.IllegalStateException: handled by fallback",
      "D/AndroidRuntime: Shutting down VM",
      "I/Example: Process: com.example.demo, PID: 8794"
    ].join("\n")
  );
  assert.equal(result.status, "passed");
  assert.equal(result.appCrashFindings.length, 0);
});

test("classifyLogcat retains fatal Java, native, Flutter, and ANR signatures", () => {
  for (const line of [
    "E/AndroidRuntime: FATAL EXCEPTION: main java.lang.IllegalArgumentException",
    "F/libc: Fatal signal 11 (SIGSEGV), code 1 in tid 1234",
    "E/flutter: [ERROR:flutter/runtime/dart_vm_initializer.cc] Unhandled Exception: StateError",
    "E/ActivityManager: ANR in com.example.demo"
  ]) {
    const result = classifyLogcat(line);
    assert.equal(result.status, "app_bug", line);
    assert.equal(result.appCrashFindings.length, 1, line);
  }
});

test("classifyLogcat detects fatal events after its displayed finding limit", () => {
  const result = classifyLogcat(
    [
      ...Array(150).fill("I/EGL_emulation: app_time_stats: avg=20ms"),
      "E/AndroidRuntime: FATAL EXCEPTION: main"
    ].join("\n")
  );
  assert.equal(result.status, "app_bug");
  assert.equal(result.findings.length, 100);
  assert.equal(result.appCrashFindings.length, 1);
  assert.equal(result.appCrashFindings[0].lineNumber, 151);
  assert.match(result.likelyRootCause, /FATAL EXCEPTION/);
});

test("classifyLogcat explains the blocking error instead of an earlier warning", () => {
  const result = classifyLogcat("W/EGL: warning\nE/AndroidRuntime: FATAL EXCEPTION: main");
  assert.match(result.likelyRootCause, /Application crash signature/);
  assert.doesNotMatch(result.likelyRootCause, /Renderer or graphics/);
});
