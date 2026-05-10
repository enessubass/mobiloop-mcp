import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { envTools } from "../src/tools/env.js";
import { ServerConfig } from "../src/types.js";

test("env.preflight accepts a reachable Appium server without requiring a global appium command", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-env-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ value: { ready: true } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  try {
    const tool = envTools().find((entry) => entry.name === "env.preflight");
    assert.ok(tool);
    const result = await tool.handler(
      { target: "ci" },
      { config: config(root, "http://127.0.0.1:4723") }
    );
    const payload = JSON.parse(
      result.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n")
    );
    const appium = payload.checks.find((check: { name: string }) => check.name === "appium");
    assert.equal(appium.ok, true);
    assert.match(appium.detail, /server reachable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function config(root: string, appiumServerUrl: string): ServerConfig {
  return {
    workspaceRoot: root,
    artifactsDir: path.join(root, ".mobiloop"),
    maxCommandMs: 120_000,
    maxOutputBytes: 1_048_576,
    maxFixAttempts: 3,
    maxTestIterations: 5,
    maxRuntimeMinutes: 30,
    allowedBranchPattern: "^feature/ai-[A-Za-z0-9._/-]+$",
    appiumServerUrl,
    adbPath: "adb",
    emulatorPath: "emulator",
    xcrunPath: "xcrun",
    xcodebuildPath: "xcodebuild",
    sqlitePath: "sqlite3",
    apiAllowlist: ["http://127.0.0.1:*", "http://localhost:*"],
    forbiddenPathGlobs: [".env", ".env.*"],
    toolPolicies: {},
    requireApproval: false,
    redactArtifacts: true
  };
}
