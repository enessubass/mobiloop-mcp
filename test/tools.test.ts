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
    "env.ensure_appium",
    "verify.assert_appium_session_healthy",
    "verify.collect_evidence",
    "flow.generate_test_scenarios",
    "flow.run_script",
    "flow.replay_to_checkpoint",
    "loop.generate_report",
    "ci.collect_artifact_manifest",
    "orchestrator.run_android_validation_loop"
  ]) {
    assert.ok(names.includes(required), `${required} should be registered`);
  }
});
