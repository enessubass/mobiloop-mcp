import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { securityTools } from "../src/tools/security.js";
import { createTestConfig } from "./helpers.js";

test("security tools scan mobile configuration, plan validation, compare fixes, and gate release", async () => {
  const config = await createTestConfig();
  const manifestPath = path.join(config.workspaceRoot, "android", "app", "src", "main");
  await fs.mkdir(manifestPath, { recursive: true });
  await fs.writeFile(
    path.join(manifestPath, "AndroidManifest.xml"),
    `<manifest><application android:debuggable="true" android:usesCleartextTraffic="true" android:allowBackup="true" /></manifest>`,
    "utf8"
  );
  await fs.mkdir(path.join(config.workspaceRoot, "lib"), { recursive: true });
  await fs.writeFile(
    path.join(config.workspaceRoot, "lib", "session.ts"),
    `const apiKey = "AIza${"a".repeat(35)}";\nconsole.log("token", token);\nfetch("http://api.example.test/login");`,
    "utf8"
  );

  const tools = new Map(securityTools().map((tool) => [tool.name, tool]));
  const scan = await tools.get("security.scan_source")!.handler({}, { config });
  const payload = json(scan);
  const findingIds = payload.findings.map((finding: { id: string }) => finding.id);
  assert.ok(findingIds.includes("MOBILOOP-HARDCODED-CREDENTIAL"));
  assert.ok(findingIds.includes("MOBILOOP-ANDROID-DEBUGGABLE"));
  assert.ok(findingIds.includes("MOBILOOP-ANDROID-CLEARTEXT"));
  assert.ok(findingIds.includes("MOBILOOP-SENSITIVE-LOGGING"));
  assert.equal(payload.summary.critical, 1);

  const plan = json(
    await tools
      .get("security.generate_test_plan")!
      .handler({ reportPath: payload.reportPath }, { config })
  );
  assert.ok(plan.tests.some((entry: { id: string }) => entry.id === "SEC-101"));

  const gate = json(
    await tools
      .get("security.release_gate")!
      .handler({ reportPath: payload.reportPath }, { config })
  );
  assert.equal(gate.passed, false);

  await fs.writeFile(
    path.join(manifestPath, "AndroidManifest.xml"),
    `<manifest><application android:allowBackup="false" /></manifest>`,
    "utf8"
  );
  await fs.writeFile(
    path.join(config.workspaceRoot, "lib", "session.ts"),
    `fetch("https://api.example.test/login");`,
    "utf8"
  );
  const comparison = json(
    await tools
      .get("security.compare_scans")!
      .handler({ baselinePath: payload.reportPath }, { config })
  );
  assert.ok(comparison.resolved.length >= 4);
  assert.equal(comparison.currentSummary.critical, 0);
});

function json(response: { content: Array<{ type: string; text?: string }> }): any {
  return JSON.parse(response.content.map((entry) => entry.text ?? "").join("\n"));
}

test("transport scan ignores XML license comments, tools namespaces, and properties documentation but retains actual URLs", async () => {
  const config = await createTestConfig();
  await fs.writeFile(
    path.join(config.workspaceRoot, "AndroidManifest.xml"),
    `<!-- license: http://www.apache.org/licenses/LICENSE-2.0 -->\n<manifest xmlns:tools="http://schemas.android.com/tools"><application endpoint="http://api.example.test"/></manifest>`
  );
  await fs.writeFile(
    path.join(config.workspaceRoot, "gradle.properties"),
    `# See http://docs.gradle.org\n! See http://docs.example.test\nendpoint=http://api.example.test/#fragment\n`
  );
  const tool = securityTools().find((entry) => entry.name === "security.scan_source")!;
  const result = json(await tool.handler({}, { config }));
  assert.equal(result.findings.length, 2);
  assert.ok(
    result.findings.every(
      (finding: { id: string }) => finding.id === "MOBILOOP-CLEARTEXT-TRANSPORT"
    )
  );
  assert.equal(
    result.findings.find((finding: { path: string }) => finding.path === "gradle.properties").line,
    3
  );
  assert.equal(
    result.findings.find((finding: { path: string }) => finding.path === "AndroidManifest.xml")
      .line,
    2
  );
});

test("security scan excludes standard plist DTD and Android namespaces from transport findings", async () => {
  const config = await createTestConfig();
  await fs.writeFile(
    path.join(config.workspaceRoot, "Info.plist"),
    `<?xml version="1.0"?>\n<!DOCTYPE plist PUBLIC\n "-//Apple//DTD PLIST 1.0//EN"\n "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist><dict/></plist>`
  );
  await fs.writeFile(
    path.join(config.workspaceRoot, "AndroidManifest.xml"),
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:app='http://schemas.android.com/apk/res/auto'><application/></manifest>`
  );
  const scan = securityTools().find((tool) => tool.name === "security.scan_source")!;
  const result = json(await scan.handler({}, { config }));
  assert.equal(result.scannedFiles, 2);
  assert.deepEqual(result.findings, []);
});

test("security scan still flags real XML HTTP values on declaration lines and after multiline metadata", async () => {
  const config = await createTestConfig();
  await fs.writeFile(
    path.join(config.workspaceRoot, "Info.plist"),
    `<!DOCTYPE plist PUBLIC\n "-//Apple//DTD PLIST 1.0//EN"\n "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist><dict><key>api</key><string>http://api.example.test</string></dict></plist>`
  );
  await fs.writeFile(
    path.join(config.workspaceRoot, "AndroidManifest.xml"),
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application endpoint="http://api.example.test" android:usesCleartextTraffic="true"/></manifest>`
  );
  const scan = securityTools().find((tool) => tool.name === "security.scan_source")!;
  const result = json(await scan.handler({}, { config }));
  const transport = result.findings.filter(
    (finding: { id: string }) => finding.id === "MOBILOOP-CLEARTEXT-TRANSPORT"
  );
  assert.equal(transport.length, 2);
  assert.equal(
    transport.find((finding: { path: string }) => finding.path === "Info.plist").line,
    4
  );
  assert.equal(
    transport.find((finding: { path: string }) => finding.path === "AndroidManifest.xml").line,
    1
  );
  assert.ok(
    result.findings.some((finding: { id: string }) => finding.id === "MOBILOOP-ANDROID-CLEARTEXT")
  );
});

test("security scan does not globally allowlist metadata hosts used as application URLs", async () => {
  const config = await createTestConfig();
  await fs.writeFile(
    path.join(config.workspaceRoot, "Info.plist"),
    `<plist><dict><key>api</key><string>http://www.apple.com/DTDs/PropertyList-1.0.dtd</string></dict></plist>`
  );
  await fs.writeFile(
    path.join(config.workspaceRoot, "client.ts"),
    `fetch("http://schemas.android.com/apk/res/android");`
  );
  const scan = securityTools().find((tool) => tool.name === "security.scan_source")!;
  const result = json(await scan.handler({}, { config }));
  assert.equal(result.findings.length, 2);
  assert.ok(
    result.findings.every(
      (finding: { id: string }) => finding.id === "MOBILOOP-CLEARTEXT-TRANSPORT"
    )
  );
});
