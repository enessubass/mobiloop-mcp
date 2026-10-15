import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../../src/cli.js", import.meta.url));
test("setup CLI requires consent and its generated configuration starts a real MCP server", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-first-use-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(
    exec(process.execPath, [cli, "setup", "--workspace", root, "--client", "claude"]),
    /No files changed/
  );
  assert.deepEqual(await fs.readdir(root), []);
  const result = await exec(process.execPath, [
    cli,
    "setup",
    "--workspace",
    root,
    "--client",
    "claude",
    "--yes"
  ]);
  const setup = JSON.parse(result.stdout);
  const input = path.join(root, "arguments.json");
  await fs.writeFile(input, JSON.stringify({ toolName: "code.apply_patch" }));
  const policies = JSON.parse(
    (
      await exec(process.execPath, [cli, "call", "policy.list_tools", "--file", input], {
        cwd: root
      })
    ).stdout
  );
  assert.equal(policies.tools[0].policy.requiresApproval, true);
  const { mobiloop } = JSON.parse(await fs.readFile(setup.configPath, "utf8")).mcpServers;
  const client = new Client({ name: "first-use-test", version: "1.0.0" });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ ...mobiloop, cwd: root, stderr: "pipe" }));
  assert.ok((await client.listTools()).tools.some((tool) => tool.name === "security.scan_source"));
  const response = await client.callTool({
    name: "code.apply_patch",
    arguments: { patch: "invalid" }
  });
  assert.equal(response.isError, true);
  assert.match(JSON.stringify(response), /Approval required/);
});

test("doctor CLI exits nonzero and returns actionable missing-tool diagnostics without setup mutations", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-doctor-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let output = "";
  try {
    await exec(
      process.execPath,
      [cli, "doctor", "--workspace", root, "--target", "android", "--json"],
      {
        env: {
          ...process.env,
          PATH: path.join(root, "missing-tools"),
          APPIUM_SERVER_URL: "http://127.0.0.1:1"
        }
      }
    );
    assert.fail("Missing tools must not report readiness");
  } catch (error) {
    assert.equal((error as { code?: number }).code, 1);
    output = (error as { stdout: string }).stdout;
  }
  const result = JSON.parse(output);
  assert.equal(result.passed, false);
  assert.equal(result.changedHost, false);
  assert.ok(
    result.fixes.some(
      (entry: { name: string; action: string }) =>
        entry.name === "command:adb" && entry.action.includes("ANDROID_HOME")
    )
  );
  assert.deepEqual(await fs.readdir(root), []);
});
