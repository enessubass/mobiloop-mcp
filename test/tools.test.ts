import assert from "node:assert/strict";
import test from "node:test";
import { allTools } from "../src/tools/index.js";
import { describeToolWithPolicy } from "../src/utils/tool-policy.js";

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
    "policy.list_tools",
    "orchestrator.run_android_validation_loop"
  ]) {
    assert.ok(names.includes(required), `${required} should be registered`);
  }
});

test("all tools expose policy metadata and high-impact tools require approval", () => {
  const tools = allTools();
  for (const tool of tools) {
    assert.ok(tool.policy, `${tool.name} should expose policy metadata`);
  }

  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  for (const requiredApproval of [
    "code.apply_patch",
    "device.clear_app_data",
    "appium.tap_coordinates",
    "flow.run_script",
    "orchestrator.run_android_validation_loop"
  ]) {
    assert.equal(
      byName.get(requiredApproval)?.policy?.requiresApproval,
      true,
      `${requiredApproval} should require approval`
    );
  }

  assert.equal(byName.get("code.read_file")?.policy?.requiresApproval, false);
  assert.equal(byName.get("flow.generate_test_scenarios")?.policy?.requiresApproval, false);
});

test("tool descriptions can expose policy hints for generic MCP clients", () => {
  const tool = allTools().find((entry) => entry.name === "device.clear_app_data");
  assert.ok(tool);
  const description = describeToolWithPolicy(tool);
  assert.match(description, /\[approval required\]/);
  assert.match(description, /\[device mutation\]/);
});
