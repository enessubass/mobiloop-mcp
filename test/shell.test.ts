import assert from "node:assert/strict";
import test from "node:test";
import { runCommand } from "../src/utils/shell.js";
import { createTestConfig } from "./helpers.js";
import fs from "node:fs/promises";
import path from "node:path";

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

test("runCommand invokes npm without a shell on the current host", async () => {
  const config = await createTestConfig();
  const result = await runCommand("npm", ["--version"], { config, cwd: config.workspaceRoot });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test(
  "Windows batch commands preserve spaces and literal shell metacharacters",
  { skip: process.platform !== "win32" },
  async () => {
    const config = await createTestConfig();
    const script = path.join(config.workspaceRoot, "check args.cmd");
    const helper = path.join(config.workspaceRoot, "args.js");
    await fs.writeFile(helper, "console.log(JSON.stringify(process.argv.slice(2)))");
    await fs.writeFile(script, `@echo off\r\n"${process.execPath}" "${helper}" %*\r\n`);
    const args = ["two words", "literal&not-a-command", "literal|not-a-command"];
    const result = await runCommand(script, args, { config, cwd: config.workspaceRoot });
    assert.deepEqual(JSON.parse(result.stdout.trim()), args);
  }
);
