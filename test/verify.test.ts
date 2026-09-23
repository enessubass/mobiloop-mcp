import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { verifyTools } from "../src/tools/verify.js";
import { createTestConfig } from "./helpers.js";

test("accessibility label checks ignore enabled layout containers", async () => {
  const config = await createTestConfig();
  const sourcePath = path.join(config.workspaceRoot, "screen.xml");
  await fs.writeFile(
    sourcePath,
    `<hierarchy>
      <android.widget.FrameLayout enabled="true" />
      <android.view.View enabled="true" />
      <android.widget.Button enabled="true" clickable="true" />
    </hierarchy>`,
    "utf8"
  );
  const tool = verifyTools().find((entry) => entry.name === "verify.assert_accessibility_labels");
  const response = await tool!.handler({ sourcePath: "screen.xml" }, { config });
  const text = response.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n");
  const payload = JSON.parse(text) as { passed: boolean; findings: string[] };

  assert.equal(payload.passed, false);
  assert.equal(payload.findings.length, 1);
  assert.match(payload.findings[0], /android\.widget\.Button/);
});
