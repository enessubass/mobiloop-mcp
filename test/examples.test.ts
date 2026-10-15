import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { allTools } from "../src/tools/index.js";
import { enforceToolApproval } from "../src/utils/approval.js";
import { createTestConfig } from "./helpers.js";

for (const [file, name] of [
  ["android-validation-loop.json", "orchestrator.run_android_validation_loop"],
  ["flutter-ios-validation-loop.json", "orchestrator.run_ios_validation_loop"]
]) {
  test(`${file} preserves data and supplies an approved actionable login flow`, async () => {
    const input = JSON.parse(
      await fs.readFile(new URL(`../../examples/${file}`, import.meta.url), "utf8")
    );
    const config = await createTestConfig({ requireApproval: true });
    const tool = allTools().find((entry) => entry.name === name)!;
    assert.doesNotThrow(() => enforceToolApproval(tool, input, config));
    assert.notEqual(input.clearAppData, true);
    assert.equal(input.appiumCapabilities["appium:noReset"], true);
    assert.equal(
      input.appiumSteps.filter((step: { tool: string }) => step.tool === "appium.type_text").length,
      2
    );
    assert.ok(
      input.appiumSteps.some((step: { tool: string }) => step.tool === "appium.tap_by_text")
    );
    assert.ok(input.expectedTexts.length > 0);
    for (const step of input.appiumSteps)
      assert.ok(allTools().some((entry) => entry.name === step.tool));
  });
}
