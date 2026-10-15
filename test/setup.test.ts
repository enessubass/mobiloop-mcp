import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { TestContext } from "node:test";
import { parse } from "smol-toml";
import { setupProject } from "../src/setup.js";

async function workspace(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-setup-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return await fs.realpath(root);
}
for (const client of ["codex", "claude", "cursor", "vscode", "generic"] as const) {
  test(`setup installs ${client} project configuration and skill idempotently`, async (t) => {
    const root = await workspace(t);
    const first = await setupProject({ workspace: root, client });
    assert.equal(first.configured, true);
    const source = await fs.readFile(first.configPath, "utf8");
    const config = client === "codex" ? parse(source) : JSON.parse(source);
    const server = (client === "codex" ? config.mcp_servers : config.mcpServers).mobiloop;
    assert.equal(server.command, process.execPath);
    assert.equal(server.env.MOBILOOP_WORKSPACE_ROOT, root);
    assert.equal(server.env.MOBILOOP_SECURITY_MODE, "secure");
    if (client === "codex") assert.equal(server.tool_timeout_sec, 1800);
    else assert.equal("tool_timeout_sec" in server, false);
    assert.ok(path.isAbsolute(server.args[0]));
    assert.match(
      await fs.readFile(path.join(first.skillDir, "SKILL.md"), "utf8"),
      /name: mobiloop-mobile-qa/
    );
    assert.match(await fs.readFile(path.join(root, ".gitignore"), "utf8"), /^\.mobiloop\/$/m);
    const second = await setupProject({ workspace: root, client });
    assert.deepEqual(second.changedFiles, []);
    assert.deepEqual(second.backups, []);
    assert.equal(await fs.readFile(first.configPath, "utf8"), source);
  });
}

test("setup preserves other JSON servers and backs up exact original bytes", async (t) => {
  const root = await workspace(t);
  const original = '{"mcpServers":{"other":{"command":"existing"}},"inputs":[{"id":"keep"}]}\n';
  await fs.writeFile(path.join(root, ".mcp.json"), original);
  const result = await setupProject({ workspace: root, client: "claude" });
  const config = JSON.parse(await fs.readFile(result.configPath, "utf8"));
  assert.deepEqual(config.mcpServers.other, { command: "existing" });
  assert.deepEqual(config.inputs, [{ id: "keep" }]);
  assert.equal(await fs.readFile(result.backups[0], "utf8"), original);
  assert.ok(result.backups[0].startsWith(path.join(root, ".mobiloop", "setup-backups")));
});

test("setup appends parsed TOML without removing comments or unrelated tables", async (t) => {
  const root = await workspace(t);
  await fs.mkdir(path.join(root, ".codex"));
  const original =
    '# keep this comment\nmodel = "existing-model"\n[mcp_servers.other]\ncommand = "existing"\n';
  await fs.writeFile(path.join(root, ".codex", "config.toml"), original);
  const result = await setupProject({ workspace: root, client: "codex" });
  const content = await fs.readFile(result.configPath, "utf8");
  assert.ok(content.startsWith(original));
  const config = parse(content);
  assert.equal(config.model, "existing-model");
  assert.deepEqual(structuredClone((config.mcp_servers as Record<string, unknown>).other), {
    command: "existing"
  });
});

test("setup dry run creates no configuration, skill, backup, or ignore file", async (t) => {
  const root = await workspace(t);
  const result = await setupProject({ workspace: root, client: "codex", dryRun: true });
  assert.equal(result.configured, false);
  assert.equal(result.changedFiles.length, 5);
  assert.deepEqual(await fs.readdir(root), []);
});

test("setup rejects conflicting config or customized skill before writing anything", async (t) => {
  const root = await workspace(t);
  const original = '{"mcpServers":{"mobiloop":{"command":"do-not-replace"}}}';
  await fs.writeFile(path.join(root, ".mcp.json"), original);
  await assert.rejects(setupProject({ workspace: root, client: "claude" }), /already differs/);
  assert.equal(await fs.readFile(path.join(root, ".mcp.json"), "utf8"), original);
  assert.deepEqual(await fs.readdir(root), [".mcp.json"]);
  await fs.rm(path.join(root, ".mcp.json"));
  const skill = path.join(root, ".agents", "skills", "mobiloop-mobile-qa");
  await fs.mkdir(skill, { recursive: true });
  await fs.writeFile(path.join(skill, "SKILL.md"), "custom skill");
  await assert.rejects(
    setupProject({ workspace: root, client: "cursor" }),
    /Existing skill differs/
  );
  await assert.rejects(fs.access(path.join(root, ".cursor")));
});

test("setup explicit replacement retains other servers and private backups", async (t) => {
  const root = await workspace(t);
  const original = '{"mcpServers":{"mobiloop":{"command":"old"},"other":{"command":"keep"}}}';
  await fs.writeFile(path.join(root, ".mcp.json"), original);
  const result = await setupProject({ workspace: root, client: "vscode", replace: true });
  assert.equal(
    JSON.parse(await fs.readFile(result.configPath, "utf8")).mcpServers.other.command,
    "keep"
  );
  assert.ok(
    (await Promise.all(result.backups.map((file) => fs.readFile(file, "utf8")))).includes(original)
  );
});

test("setup refuses malformed configuration and unsafe Appium endpoints without writes", async (t) => {
  const root = await workspace(t);
  for (const appiumUrl of [
    "https://127.0.0.1:4723",
    "http://remote.example:4723",
    "http://user:password@localhost:4723"
  ]) {
    await assert.rejects(
      setupProject({ workspace: root, client: "cursor", appiumUrl }),
      /loopback/
    );
  }
  assert.deepEqual(await fs.readdir(root), []);
  await fs.writeFile(path.join(root, ".mcp.json"), "{broken");
  await assert.rejects(setupProject({ workspace: root, client: "claude" }));
  assert.deepEqual(await fs.readdir(root), [".mcp.json"]);
});

test("setup refuses redirected client and backup directories", async (t) => {
  const root = await workspace(t);
  const outside = await workspace(t);
  await fs.symlink(
    outside,
    path.join(root, ".cursor"),
    process.platform === "win32" ? "junction" : "dir"
  );
  await assert.rejects(setupProject({ workspace: root, client: "cursor" }), /symbolic-link/);
  assert.deepEqual(await fs.readdir(outside), []);
});
