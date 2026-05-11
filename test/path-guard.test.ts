import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveWorkspacePath } from "../src/utils/path-guard.js";
import { ServerConfig } from "../src/types.js";

const config: ServerConfig = {
  workspaceRoot: path.resolve("/tmp/mobile-app"),
  artifactsDir: path.resolve("/tmp/mobile-app/.mobiloop"),
  runId: undefined,
  maxCommandMs: 1000,
  maxOutputBytes: 1000,
  maxFixAttempts: 3,
  maxTestIterations: 5,
  maxRuntimeMinutes: 30,
  allowedBranchPattern: "^feature/ai-[A-Za-z0-9._/-]+$",
  appiumServerUrl: "http://127.0.0.1:4723",
  adbPath: "adb",
  emulatorPath: "emulator",
  xcrunPath: "xcrun",
  xcodebuildPath: "xcodebuild",
  sqlitePath: "sqlite3",
  apiAllowlist: ["http://127.0.0.1:*", "http://localhost:*"],
  forbiddenPathGlobs: [".env", "**/*.jks", "**/*secret*"],
  toolPolicies: {},
  requireApproval: false,
  redactArtifacts: true
};

test("resolveWorkspacePath allows normal workspace files", () => {
  assert.equal(
    resolveWorkspacePath(config, "src/main.ts"),
    path.resolve("/tmp/mobile-app/src/main.ts")
  );
});

test("resolveWorkspacePath blocks path traversal", () => {
  assert.throws(() => resolveWorkspacePath(config, "../outside.txt"), /escapes workspaceRoot/);
});

test("resolveWorkspacePath blocks forbidden basenames", () => {
  assert.throws(() => resolveWorkspacePath(config, "app/.env"), /forbiddenPathGlobs/);
});

test("resolveWorkspacePath blocks forbidden globs", () => {
  assert.throws(() => resolveWorkspacePath(config, "android/release.jks"), /forbiddenPathGlobs/);
});

test("resolveWorkspacePath blocks root files matched by double-star globs", () => {
  assert.throws(() => resolveWorkspacePath(config, "release.jks"), /forbiddenPathGlobs/);
  assert.throws(() => resolveWorkspacePath(config, "my-secret.txt"), /forbiddenPathGlobs/);
});
