import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  resolveWorkspacePath,
  resolveWorkspacePathAllowArtifacts
} from "../src/utils/path-guard.js";
import { ServerConfig } from "../src/types.js";

const config: ServerConfig = {
  securityMode: "trusted",
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
  appiumAllowlist: ["http://127.0.0.1:*", "http://localhost:*"],
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

test("resolveWorkspacePath blocks symbolic links that resolve outside the workspace", async (t) => {
  if (process.platform === "win32") {
    t.skip("symbolic-link permissions differ on Windows");
    return;
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-path-guard-"));
  const outside = path.join(root, "..", "outside.txt");
  await fs.writeFile(outside, "outside", "utf8");
  await fs.symlink(outside, path.join(root, "outside-link"));
  const isolatedConfig = {
    ...config,
    workspaceRoot: root,
    artifactsDir: path.join(root, ".mobiloop")
  };
  assert.throws(
    () => resolveWorkspacePath(isolatedConfig, "outside-link"),
    /escapes workspaceRoot through a symbolic link/
  );
});

test("resolveWorkspacePathAllowArtifacts permits only the workspace or artifact root", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-workspace-"));
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-artifacts-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-outside-"));
  const isolatedConfig = { ...config, workspaceRoot: workspace, artifactsDir: artifacts };

  assert.equal(
    resolveWorkspacePathAllowArtifacts(
      isolatedConfig,
      path.join(artifacts, "security", "report.json")
    ),
    path.join(artifacts, "security", "report.json")
  );
  assert.throws(
    () => resolveWorkspacePathAllowArtifacts(isolatedConfig, path.join(outside, "report.json")),
    /escapes workspaceRoot and artifactsDir/
  );
});
