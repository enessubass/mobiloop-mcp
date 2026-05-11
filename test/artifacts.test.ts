import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { artifactRoot, writeArtifactText } from "../src/utils/artifacts.js";
import { createTestConfig } from "./helpers.js";

test("artifactRoot preserves legacy artifact layout when runId is not set", async () => {
  const config = await createTestConfig();
  assert.equal(artifactRoot(config), config.artifactsDir);
});

test("artifact writers use .mobiloop/runs/<runId> when runId is set", async () => {
  const config = await createTestConfig({ runId: "login smoke/unsafe" });
  const artifactPath = await writeArtifactText(config, "logs", "run-output", "log", "ok");
  assert.equal(artifactRoot(config), path.join(config.artifactsDir, "runs", "login_smoke_unsafe"));
  assert.match(artifactPath, /[/\\]\.mobiloop[/\\]runs[/\\]login_smoke_unsafe[/\\]logs[/\\]/);
});
