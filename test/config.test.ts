import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.js";

test("loadConfig rejects artifactsDir outside workspaceRoot", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-config-"));
  const originalCwd = process.cwd();
  const originalConfig = process.env.MOBILOOP_CONFIG;
  const originalRoot = process.env.MOBILOOP_WORKSPACE_ROOT;
  const originalLegacyConfig = process.env.AGENTIC_MOBILE_MCP_CONFIG;
  const originalLegacyRoot = process.env.AGENTIC_MOBILE_WORKSPACE_ROOT;
  const configPath = path.join(dir, "mobiloop.config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      workspaceRoot: dir,
      artifactsDir: "../outside"
    }),
    "utf8"
  );
  process.env.MOBILOOP_CONFIG = configPath;
  delete process.env.MOBILOOP_WORKSPACE_ROOT;
  delete process.env.AGENTIC_MOBILE_MCP_CONFIG;
  delete process.env.AGENTIC_MOBILE_WORKSPACE_ROOT;
  process.chdir(dir);
  try {
    await assert.rejects(() => loadConfig(), /artifactsDir must stay inside workspaceRoot/);
  } finally {
    process.chdir(originalCwd);
    if (originalConfig === undefined) {
      delete process.env.MOBILOOP_CONFIG;
    } else {
      process.env.MOBILOOP_CONFIG = originalConfig;
    }
    if (originalRoot === undefined) {
      delete process.env.MOBILOOP_WORKSPACE_ROOT;
    } else {
      process.env.MOBILOOP_WORKSPACE_ROOT = originalRoot;
    }
    if (originalLegacyConfig === undefined) {
      delete process.env.AGENTIC_MOBILE_MCP_CONFIG;
    } else {
      process.env.AGENTIC_MOBILE_MCP_CONFIG = originalLegacyConfig;
    }
    if (originalLegacyRoot === undefined) {
      delete process.env.AGENTIC_MOBILE_WORKSPACE_ROOT;
    } else {
      process.env.AGENTIC_MOBILE_WORKSPACE_ROOT = originalLegacyRoot;
    }
  }
});

test("loadConfig supports legacy agentic-mobile env vars as fallback", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-legacy-config-"));
  const originalCwd = process.cwd();
  const originalConfig = process.env.MOBILOOP_CONFIG;
  const originalRoot = process.env.MOBILOOP_WORKSPACE_ROOT;
  const originalLegacyConfig = process.env.AGENTIC_MOBILE_MCP_CONFIG;
  const originalLegacyRoot = process.env.AGENTIC_MOBILE_WORKSPACE_ROOT;
  const configPath = path.join(dir, "agentic-mobile-mcp.config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      artifactsDir: ".legacy-artifacts"
    }),
    "utf8"
  );

  delete process.env.MOBILOOP_CONFIG;
  delete process.env.MOBILOOP_WORKSPACE_ROOT;
  process.env.AGENTIC_MOBILE_MCP_CONFIG = configPath;
  process.env.AGENTIC_MOBILE_WORKSPACE_ROOT = dir;
  process.chdir(dir);
  try {
    const config = await loadConfig();
    assert.equal(config.workspaceRoot, dir);
    assert.equal(config.artifactsDir, path.join(dir, ".legacy-artifacts"));
  } finally {
    process.chdir(originalCwd);
    if (originalConfig === undefined) {
      delete process.env.MOBILOOP_CONFIG;
    } else {
      process.env.MOBILOOP_CONFIG = originalConfig;
    }
    if (originalRoot === undefined) {
      delete process.env.MOBILOOP_WORKSPACE_ROOT;
    } else {
      process.env.MOBILOOP_WORKSPACE_ROOT = originalRoot;
    }
    if (originalLegacyConfig === undefined) {
      delete process.env.AGENTIC_MOBILE_MCP_CONFIG;
    } else {
      process.env.AGENTIC_MOBILE_MCP_CONFIG = originalLegacyConfig;
    }
    if (originalLegacyRoot === undefined) {
      delete process.env.AGENTIC_MOBILE_WORKSPACE_ROOT;
    } else {
      process.env.AGENTIC_MOBILE_WORKSPACE_ROOT = originalLegacyRoot;
    }
  }
});

test("loadConfig validates mobiloop.config.json against schema", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-invalid-config-"));
  const originalCwd = process.cwd();
  const originalConfig = process.env.MOBILOOP_CONFIG;
  const originalRoot = process.env.MOBILOOP_WORKSPACE_ROOT;
  const configPath = path.join(dir, "mobiloop.config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      workspaceRoot: dir,
      maxTestIterations: 0,
      requireApproval: "yes"
    }),
    "utf8"
  );
  process.env.MOBILOOP_CONFIG = configPath;
  delete process.env.MOBILOOP_WORKSPACE_ROOT;
  process.chdir(dir);
  try {
    await assert.rejects(() => loadConfig(), /Invalid .*mobiloop\.config\.json/);
  } finally {
    process.chdir(originalCwd);
    if (originalConfig === undefined) {
      delete process.env.MOBILOOP_CONFIG;
    } else {
      process.env.MOBILOOP_CONFIG = originalConfig;
    }
    if (originalRoot === undefined) {
      delete process.env.MOBILOOP_WORKSPACE_ROOT;
    } else {
      process.env.MOBILOOP_WORKSPACE_ROOT = originalRoot;
    }
  }
});

test("loadConfig supports approval and redaction env overrides", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-env-config-"));
  const originalCwd = process.cwd();
  const originalConfig = process.env.MOBILOOP_CONFIG;
  const originalRoot = process.env.MOBILOOP_WORKSPACE_ROOT;
  const originalRequireApproval = process.env.MOBILOOP_REQUIRE_APPROVAL;
  const originalRedactArtifacts = process.env.MOBILOOP_REDACT_ARTIFACTS;
  const originalRunId = process.env.MOBILOOP_RUN_ID;
  const configPath = path.join(dir, "mobiloop.config.json");
  await fs.writeFile(configPath, JSON.stringify({ workspaceRoot: dir }), "utf8");
  process.env.MOBILOOP_CONFIG = configPath;
  process.env.MOBILOOP_REQUIRE_APPROVAL = "true";
  process.env.MOBILOOP_REDACT_ARTIFACTS = "false";
  process.env.MOBILOOP_RUN_ID = "ci-login-smoke";
  delete process.env.MOBILOOP_WORKSPACE_ROOT;
  process.chdir(dir);
  try {
    const config = await loadConfig();
    assert.equal(config.requireApproval, true);
    assert.equal(config.redactArtifacts, false);
    assert.equal(config.runId, "ci-login-smoke");
  } finally {
    process.chdir(originalCwd);
    restoreEnv("MOBILOOP_CONFIG", originalConfig);
    restoreEnv("MOBILOOP_WORKSPACE_ROOT", originalRoot);
    restoreEnv("MOBILOOP_REQUIRE_APPROVAL", originalRequireApproval);
    restoreEnv("MOBILOOP_REDACT_ARTIFACTS", originalRedactArtifacts);
    restoreEnv("MOBILOOP_RUN_ID", originalRunId);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
