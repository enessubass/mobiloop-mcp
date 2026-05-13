import assert from "node:assert/strict";
import test from "node:test";
import { runCommand } from "../src/utils/shell.js";
import { createTestConfig } from "./helpers.js";

test("runCommand keeps the tail of long command output", async () => {
  const config = await createTestConfig({ maxOutputBytes: 8 });
  const result = await runCommand(
    process.execPath,
    ["-e", "process.stdout.write('prefix-' + 'x'.repeat(64) + '-tail')"],
    {
      cwd: config.workspaceRoot,
      config
    }
  );

  assert.equal(result.stdout, "xxx-tail");
});
