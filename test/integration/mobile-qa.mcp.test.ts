import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const exec = promisify(execFile);
const trace = (label: string) => {
  if (process.env.MOBILOOP_TEST_TRACE) process.stderr.write(`[mobile-qa] ${label}\n`);
};
const approval = {
  approved: true,
  approvedBy: "isolated-test-harness",
  reason: "Modify only the disposable mobile QA test fixture"
};

test(
  "MCP mobile QA workflow enforces approval and verifies an actual guarded security fix",
  { timeout: 30_000 },
  async (t) => {
    const root = await temporaryWorkspace(t);
    trace("create Git fixture");
    const before = '<manifest><application android:usesCleartextTraffic="true" /></manifest>\n';
    const after = '<manifest><application android:usesCleartextTraffic="false" /></manifest>\n';
    await fs.writeFile(path.join(root, "AndroidManifest.xml"), before);
    await fs.writeFile(path.join(root, "build.gradle.kts"), "// Disposable Android project\n");
    await exec("git", ["init", "-b", "feature/ai-mobile-qa"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec(
      "git",
      [
        "-c",
        "user.name=MobiLoop Test",
        "-c",
        "user.email=fixture@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "Test fixture"
      ],
      { cwd: root }
    );
    const client = await connect(t, root);
    trace("MCP connected");
    assert.ok(
      (await client.listTools()).tools.some((tool) => tool.name === "security.scan_source")
    );
    const policies = await call(client, "policy.list_tools", { toolName: "code.apply_patch" });
    assert.equal(policies.tools[0].policy.requiresApproval, true);
    assert.equal((await call(client, "build.detect_project")).kind, "android");

    const scope = { paths: ["AndroidManifest.xml"] };
    const baseline = await call(client, "security.scan_source", scope);
    assert.equal(baseline.summary.high, 1);
    const plan = await call(client, "security.generate_test_plan", {
      reportPath: baseline.reportPath
    });
    assert.ok(plan.tests.length > 0);
    assert.equal(
      (await call(client, "security.release_gate", { reportPath: baseline.reportPath })).passed,
      false
    );
    const patch = `diff --git a/AndroidManifest.xml b/AndroidManifest.xml\n--- a/AndroidManifest.xml\n+++ b/AndroidManifest.xml\n@@ -1 +1 @@\n-${before}+${after}`;
    const denied = await client.callTool({ name: "code.apply_patch", arguments: { patch } });
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied), /Approval required/);
    assert.equal(await fs.readFile(path.join(root, "AndroidManifest.xml"), "utf8"), before);

    const applied = await call(client, "code.apply_patch", { patch, approval });
    trace("approved patch applied");
    assert.equal(applied.applied, true);
    assert.equal(await fs.readFile(path.join(root, "AndroidManifest.xml"), "utf8"), after);
    const comparison = await call(client, "security.compare_scans", {
      ...scope,
      baselinePath: baseline.reportPath
    });
    assert.equal(comparison.resolved.length, 1);
    assert.equal(comparison.introduced.length, 0);
    const current = await call(client, "security.scan_source", scope);
    assert.equal(
      (await call(client, "security.release_gate", { reportPath: current.reportPath })).passed,
      true
    );
    const staleGate = await call(client, "security.release_gate", {
      reportPath: baseline.reportPath
    });
    assert.equal(
      staleGate.passed,
      false,
      "A source edit must not silently change the saved baseline"
    );
    const wrongReport = await client.callTool({
      name: "security.release_gate",
      arguments: { reportPath: comparison.comparisonPath }
    });
    assert.equal(wrongReport.isError, true, "A comparison is not a source-scan report");

    const escaped = await client.callTool({
      name: "code.read_file",
      arguments: { path: "../outside.txt" }
    });
    assert.equal(escaped.isError, true);
    const endpoint = await client.callTool({
      name: "appium.create_session",
      arguments: { capabilities: {}, serverUrl: "http://127.0.0.1:9999", approval }
    });
    assert.equal(endpoint.isError, true);
    assert.match(JSON.stringify(endpoint), /serverUrl overrides are disabled/);
    await call(client, "loop.record_iteration", {
      iteration: 1,
      goal: "Fix the fixture's manifest security finding",
      test_result: "passed",
      fix: "Disable broad cleartext traffic",
      retest: "passed",
      artifacts: [baseline.reportPath, comparison.comparisonPath, current.reportPath]
    });
    const report = await call(client, "loop.generate_report", {
      finalStatus: "passed",
      summary: "Source security retest only; device tests not run."
    });
    trace("report generated");
    assert.match(
      await fs.readFile(report.reportPath, "utf8"),
      /Source security retest only; device tests not run/
    );
  }
);

test(
  "MCP preflight reports missing Android tooling instead of a passing environment",
  { timeout: 30_000 },
  async (t) => {
    const root = await temporaryWorkspace(t);
    const client = await connect(t, root, { PATH: path.join(root, "missing-tools") });
    trace("missing-tool MCP connected");
    const result = await call(client, "env.preflight", { target: "android" });
    trace("missing-tool preflight returned");
    assert.equal(result.passed, false);
    assert.ok(
      result.requiredFailures.some((check: { name: string }) => check.name === "command:adb")
    );
    assert.ok(result.requiredFailures.some((check: { name: string }) => check.name === "appium"));
  }
);

async function temporaryWorkspace(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-qa-mcp-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function connect(
  t: TestContext,
  root: string,
  env: Record<string, string> = {}
): Promise<Client> {
  const client = new Client({ name: "mobiloop-qa-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../../src/index.js", import.meta.url))],
    cwd: root,
    env: {
      MOBILOOP_WORKSPACE_ROOT: root,
      MOBILOOP_SECURITY_MODE: "secure",
      MOBILOOP_RUN_ID: "mobile-qa-test",
      APPIUM_SERVER_URL: "http://127.0.0.1:1",
      ...env
    },
    stderr: "inherit"
  });
  t.after(() => client.close());
  await client.connect(transport);
  return client;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<any> {
  const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return JSON.parse(
    result.content.map((entry) => (entry.type === "text" ? entry.text : "")).join("\n")
  );
}
