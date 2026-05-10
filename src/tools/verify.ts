import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { McpTool, ServerConfig, jsonResponse } from "../types.js";
import { arraySchema, numberSchema, objectSchema, stringSchema } from "../schema.js";
import { AppiumClient } from "../utils/appium-client.js";
import { asObject, optionalNumber, optionalString, optionalStringArray, requireString } from "../utils/validation.js";
import { resolveWorkspacePath } from "../utils/path-guard.js";
import { runCommand } from "../utils/shell.js";
import { writeArtifactBuffer, writeArtifactText } from "../utils/artifacts.js";
import { assertApiAllowed } from "../utils/api-allowlist.js";

const CRASH_PATTERNS = [
  /FATAL EXCEPTION/i,
  /AndroidRuntime/i,
  /ANR in /i,
  /Process: .*?, PID:/i,
  /java\.lang\.[A-Za-z]+Exception/i,
  /Unhandled Exception/i,
  /Fatal signal \d+/i
];

export function verifyTools(): McpTool[] {
  return [
    {
      name: "verify.assert_screen_contains_text",
      description: "Assert current Appium page source contains expected text.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          text: stringSchema
        },
        ["sessionId", "text"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const text = requireString(args, "text");
        const source = await new AppiumClient({ serverUrl }).pageSource(sessionId);
        return jsonResponse({ passed: source.includes(text), text, serverUrl, sessionId });
      }
    },
    {
      name: "verify.assert_no_crash_in_logcat",
      description: "Assert logcat or a saved log file has no crash signatures.",
      inputSchema: objectSchema(
        {
          serial: stringSchema,
          packageName: stringSchema,
          logPath: stringSchema
        },
        []
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const serial = optionalString(args, "serial");
        const packageName = optionalString(args, "packageName");
        const logPath = optionalString(args, "logPath");
        const logText = logPath
          ? await fs.readFile(resolveWorkspacePath(config, logPath), "utf8")
          : await pullLogcat(config, serial, packageName);
        const findings = crashFindings(logText);
        const evidencePath = await writeArtifactText(config, "verification", "logcat-crash-check", "log", logText);
        return jsonResponse({
          passed: findings.length === 0,
          findings,
          serial,
          packageName,
          evidencePath
        });
      }
    },
    {
      name: "verify.assert_api_response",
      description: "Call an API and assert status and optional body substrings.",
      inputSchema: objectSchema(
        {
          url: stringSchema,
          method: stringSchema,
          headers: { type: "object", additionalProperties: { type: "string" } },
          body: stringSchema,
          expectedStatus: numberSchema,
          bodyContains: arraySchema(stringSchema),
          timeoutMs: numberSchema
        },
        ["url"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const url = requireString(args, "url");
        assertApiAllowed(url, config.apiAllowlist);
        const method = optionalString(args, "method") ?? "GET";
        const headers = normalizeHeaders(args.headers);
        const body = optionalString(args, "body");
        const expectedStatus = optionalNumber(args, "expectedStatus") ?? 200;
        const bodyContains = optionalStringArray(args, "bodyContains") ?? [];
        const timeoutMs = optionalNumber(args, "timeoutMs") ?? 15_000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const started = Date.now();
        try {
          const response = await fetch(url, {
            method,
            headers,
            body,
            signal: controller.signal
          });
          const responseText = await response.text();
          const missing = bodyContains.filter((entry) => !responseText.includes(entry));
          const evidencePath = await writeArtifactText(config, "verification", "api-response", "txt", responseText);
          return jsonResponse({
            passed: response.status === expectedStatus && missing.length === 0,
            status: response.status,
            expectedStatus,
            missingBodySubstrings: missing,
            durationMs: Date.now() - started,
            evidencePath
          });
        } finally {
          clearTimeout(timer);
        }
      }
    },
    {
      name: "verify.collect_evidence",
      description: "Collect screenshot, page source, and logcat evidence where available.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          serial: stringSchema,
          packageName: stringSchema,
          prefix: stringSchema
        },
        []
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = optionalString(args, "sessionId");
        const serial = optionalString(args, "serial");
        const packageName = optionalString(args, "packageName");
        const prefix = optionalString(args, "prefix") ?? "evidence";
        const evidence: Record<string, string> = {};
        if (sessionId) {
          const client = new AppiumClient({ serverUrl });
          evidence.screenshotPath = await client.saveScreenshot(config, sessionId, prefix);
          evidence.sourcePath = await client.savePageSource(config, sessionId, prefix);
        }
        const logs = await pullLogcat(config, serial, packageName).catch((error) => `logcat unavailable: ${error instanceof Error ? error.message : String(error)}`);
        evidence.logPath = await writeArtifactText(config, "logs", `${prefix}-logcat`, "log", logs);
        return jsonResponse({ serverUrl, sessionId, serial, packageName, evidence });
      }
    },
    {
      name: "verify.assert_navigation_reached",
      description: "Assert a navigation target by expected Appium page source text.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          expectedText: stringSchema,
          sourceEvidencePrefix: stringSchema
        },
        ["sessionId", "expectedText"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = requireString(args, "sessionId");
        const expectedText = requireString(args, "expectedText");
        const prefix = optionalString(args, "sourceEvidencePrefix") ?? "navigation";
        const client = new AppiumClient({ serverUrl });
        const source = await client.pageSource(sessionId);
        const sourcePath = await writeArtifactText(config, "sources", prefix, "xml", source);
        return jsonResponse({ passed: source.includes(expectedText), expectedText, sourcePath });
      }
    },
    {
      name: "verify.assert_accessibility_labels",
      description: "Assert clickable or input-like nodes have a text, label, name, content-desc, or resource-id.",
      inputSchema: objectSchema(
        {
          sessionId: stringSchema,
          serverUrl: stringSchema,
          sourcePath: stringSchema
        },
        []
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const sourcePath = optionalString(args, "sourcePath");
        const serverUrl = optionalString(args, "serverUrl") ?? config.appiumServerUrl;
        const sessionId = optionalString(args, "sessionId");
        if (!sourcePath && !sessionId) {
          throw new Error("sessionId or sourcePath is required");
        }
        const source = sourcePath
          ? await fs.readFile(resolveWorkspacePath(config, sourcePath), "utf8")
          : await new AppiumClient({ serverUrl }).pageSource(sessionId!);
        const findings = accessibilityFindings(source);
        const evidencePath = await writeArtifactText(config, "verification", "accessibility-label-check", "xml", source);
        return jsonResponse({ passed: findings.length === 0, findings, evidencePath });
      }
    },
    {
      name: "verify.assert_screenshot_diff",
      description: "Compare two PNG screenshots and assert the pixel diff ratio is at or below maxDiffRatio.",
      inputSchema: objectSchema(
        {
          baselinePath: stringSchema,
          actualPath: stringSchema,
          maxDiffRatio: numberSchema,
          threshold: numberSchema
        },
        ["baselinePath", "actualPath"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const baselinePath = resolveWorkspacePath(config, requireString(args, "baselinePath"));
        const actualPath = resolveWorkspacePath(config, requireString(args, "actualPath"));
        const maxDiffRatio = optionalNumber(args, "maxDiffRatio") ?? 0.01;
        const threshold = optionalNumber(args, "threshold") ?? 0.1;
        const baseline = PNG.sync.read(await fs.readFile(baselinePath));
        const actual = PNG.sync.read(await fs.readFile(actualPath));
        if (baseline.width !== actual.width || baseline.height !== actual.height) {
          return jsonResponse({
            passed: false,
            reason: "dimension_mismatch",
            baseline: { width: baseline.width, height: baseline.height },
            actual: { width: actual.width, height: actual.height }
          });
        }
        const diff = new PNG({ width: baseline.width, height: baseline.height });
        const diffPixels = pixelmatch(
          baseline.data,
          actual.data,
          diff.data,
          baseline.width,
          baseline.height,
          { threshold }
        );
        const totalPixels = baseline.width * baseline.height;
        const diffRatio = diffPixels / totalPixels;
        const diffPath = await writeArtifactBuffer(config, "verification", "screenshot-diff", "png", PNG.sync.write(diff));
        return jsonResponse({
          passed: diffRatio <= maxDiffRatio,
          diffPixels,
          totalPixels,
          diffRatio,
          maxDiffRatio,
          diffPath
        });
      }
    },
    {
      name: "verify.assert_sqlite_query",
      description: "Run a read-only sqlite query and assert exact output or expected substring.",
      inputSchema: objectSchema(
        {
          databasePath: stringSchema,
          query: stringSchema,
          expectedOutput: stringSchema,
          outputContains: stringSchema
        },
        ["databasePath", "query"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const databasePath = resolveWorkspacePath(config, requireString(args, "databasePath"));
        const query = requireString(args, "query");
        assertReadonlySql(query);
        const expectedOutput = optionalString(args, "expectedOutput");
        const outputContains = optionalString(args, "outputContains");
        const result = await runCommand(config.sqlitePath, ["-readonly", "-batch", databasePath, query], {
          cwd: config.workspaceRoot,
          config
        });
        const output = result.stdout.trim();
        const passed =
          expectedOutput !== undefined
            ? output === expectedOutput
            : outputContains !== undefined
              ? output.includes(outputContains)
              : output.length > 0;
        return jsonResponse({
          passed,
          output,
          expectedOutput,
          outputContains
        });
      }
    },
    {
      name: "verify.hash_artifact",
      description: "Compute SHA-256 for a workspace artifact or evidence file.",
      inputSchema: objectSchema({ path: stringSchema }, ["path"]),
      async handler(input, { config }) {
        const args = asObject(input);
        const filePath = resolveWorkspacePath(config, requireString(args, "path"));
        const bytes = await fs.readFile(filePath);
        return jsonResponse({
          path: filePath,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          bytes: bytes.length
        });
      }
    }
  ];
}

async function pullLogcat(
  config: ServerConfig,
  serial?: string,
  packageName?: string
): Promise<string> {
  const serialArgs = serial ? ["-s", serial] : [];
  const pid = packageName ? await pidOf(config, serial, packageName) : undefined;
  const result = await runCommand(config.adbPath, [...serialArgs, "logcat", "-d", ...(pid ? ["--pid", pid] : [])], {
    cwd: config.workspaceRoot,
    config,
    allowFailure: true
  });
  return result.stdout + result.stderr;
}

async function pidOf(
  config: ServerConfig,
  serial: string | undefined,
  packageName: string
): Promise<string | undefined> {
  const serialArgs = serial ? ["-s", serial] : [];
  const result = await runCommand(config.adbPath, [...serialArgs, "shell", "pidof", packageName], {
    cwd: config.workspaceRoot,
    config,
    allowFailure: true
  });
  return result.stdout.trim().split(/\s+/)[0] || undefined;
}

function crashFindings(logText: string): string[] {
  const lines = logText.split(/\r?\n/);
  const findings: string[] = [];
  for (const [index, line] of lines.entries()) {
    if (CRASH_PATTERNS.some((pattern) => pattern.test(line))) {
      findings.push(`${index + 1}: ${line}`.slice(0, 500));
    }
  }
  return findings.slice(0, 50);
}

function normalizeHeaders(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("headers must be an object");
  }
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== "string") {
      throw new Error(`headers.${key} must be a string`);
    }
    headers[key] = headerValue;
  }
  return headers;
}

function accessibilityFindings(source: string): string[] {
  const findings: string[] = [];
  const nodeRegex = /<[^!?][^>]*(?:clickable="true"|enabled="true"|type="XCUIElementType(?:Button|TextField|SecureTextField)"|class="[^"]*(?:Button|EditText|TextInput)[^"]*")[^>]*>/g;
  const nameRegex = /\b(?:text|label|name|content-desc|resource-id)="([^"]+)"/g;
  const matches = source.match(nodeRegex) ?? [];
  for (const node of matches) {
    let hasLabel = false;
    for (const match of node.matchAll(nameRegex)) {
      if (match[1] && match[1].trim().length > 0) {
        hasLabel = true;
        break;
      }
    }
    if (!hasLabel) {
      findings.push(node.slice(0, 500));
    }
  }
  return findings.slice(0, 100);
}

function assertReadonlySql(query: string): void {
  const normalized = query.trim().replace(/^\s*--.*$/gm, "").toLowerCase();
  if (!normalized.startsWith("select") && !normalized.startsWith("with") && !normalized.startsWith("pragma")) {
    throw new Error("Only read-only SELECT, WITH, or PRAGMA queries are allowed");
  }
  const forbidden = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|vacuum|reindex|truncate)\b/i;
  if (forbidden.test(normalized)) {
    throw new Error("Query contains a forbidden write/schema keyword");
  }
}
