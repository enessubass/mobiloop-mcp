import assert from "node:assert/strict";
import test from "node:test";
import { allTools } from "../src/tools/index.js";

test("all tool names are unique and include core release groups", () => {
  const tools = allTools();
  const names = tools.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  for (const required of [
    "env.preflight",
    "build.build_debug_apk",
    "device.install_app",
    "appium.create_session",
    "verify.collect_evidence",
    "flow.replay_to_checkpoint",
    "loop.generate_report",
    "ci.collect_artifact_manifest",
    "orchestrator.run_android_validation_loop"
  ]) {
    assert.ok(names.includes(required), `${required} should be registered`);
  }
});
