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

test("resolveWorkspacePath blocks directory links and Windows junction escapes", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-path-guard-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "workspace");
  const outside = path.join(base, "outside");
  await fs.mkdir(root);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "outside.txt"), "outside", "utf8");
  await fs.symlink(
    outside,
    path.join(root, "outside-link"),
    process.platform === "win32" ? "junction" : "dir"
  );
  const isolatedConfig = {
    ...config,
    workspaceRoot: root,
    artifactsDir: path.join(root, ".mobiloop")
  };
  for (const target of ["outside-link", "outside-link/outside.txt", "outside-link/new.txt"]) {
    assert.throws(
      () => resolveWorkspacePath(isolatedConfig, target),
      /escapes workspaceRoot through a symbolic link/
    );
  }
  if (process.platform !== "win32") {
    await fs.symlink(path.join(outside, "outside.txt"), path.join(root, "outside-file"));
    assert.throws(
      () => resolveWorkspacePath(isolatedConfig, "outside-file"),
      /through a symbolic link/
    );
  }
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
