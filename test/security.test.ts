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
