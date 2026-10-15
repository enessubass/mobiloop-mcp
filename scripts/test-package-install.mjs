import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repo = fileURLToPath(new URL("../", import.meta.url));
const spawnSync = spawn.sync;
const root = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-package-"));
const app = path.join(root, "mobile project with spaces");
const client = new Client({ name: "package-install-smoke", version: "1.0.0" });
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repo,
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, npm_config_cache: path.join(os.tmpdir(), "mobiloop-npm-cache") },
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited ${result.status}: ${result.stderr?.slice(-6000)}`);
  return result.stdout;
}
try {
  await fs.mkdir(app);
  const [pack] = JSON.parse(
    run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", root])
  );
  assert.ok(pack.files.some((file) => file.path === "skills/mobiloop-mobile-qa/SKILL.md"));
  assert.ok(!pack.files.some((file) => file.path.startsWith(".mobiloop/")));
  const install = path.join(root, "install");
  run("npm", [
    "install",
    "--prefix",
    install,
    "--no-save",
    "--ignore-scripts",
    "--no-audit",
    "--fund=false",
    path.join(root, pack.filename)
  ]);
  const pkg = await fs.realpath(path.join(install, "node_modules", "mobiloop-mcp"));
  const cli = path.join(pkg, "dist", "src", "cli.js");
  const bin = path.join(install, "node_modules", ".bin", "mobiloop");
  assert.match(run(bin, ["--help"], { cwd: app }), /mobiloop setup/);
  assert.match(run(process.execPath, [cli, "--help"], { cwd: app }), /mobiloop setup/);
  const setup = JSON.parse(
    run(process.execPath, [cli, "setup", "--workspace", app, "--client", "claude", "--yes"], {
      cwd: app
    })
  );
  const { mobiloop } = JSON.parse(await fs.readFile(setup.configPath, "utf8")).mcpServers;
  assert.ok(mobiloop.args[0].startsWith(pkg));
  assert.deepEqual(
    JSON.parse(
      run(process.execPath, [cli, "setup", "--workspace", app, "--client", "claude", "--yes"], {
        cwd: app
      })
    ).changedFiles,
    []
  );
  await client.connect(new StdioClientTransport({ ...mobiloop, cwd: app, stderr: "pipe" }));
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 83);
  const response = await client.callTool({ name: "security.scan_source", arguments: {} });
  assert.notEqual(response.isError, true);
  const denied = await client.callTool({
    name: "code.apply_patch",
    arguments: { patch: "invalid" }
  });
  assert.equal(denied.isError, true);
  assert.match(JSON.stringify(denied), /Approval required/);
  const doctor = JSON.parse(
    run(process.execPath, [cli, "doctor", "--workspace", app, "--target", "ci", "--json"], {
      cwd: app
    })
  );
  assert.equal(doctor.passed, true);
  console.log(
    JSON.stringify(
      {
        cleanInstall: true,
        platform: process.platform,
        node: process.version,
        tools: tools.tools.length,
        setupIdempotent: true,
        approvalEnforced: true,
        doctorPassed: true,
        skillPresent: true
      },
      null,
      2
    )
  );
} finally {
  await client.close();
  await fs.rm(root, { recursive: true, force: true });
}
