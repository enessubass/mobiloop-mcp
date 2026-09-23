import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { arraySchema, enumSchema, numberSchema, objectSchema, stringSchema } from "../schema.js";
import { McpTool, ServerConfig, jsonResponse } from "../types.js";
import { writeArtifactJson } from "../utils/artifacts.js";
import {
  resolveWorkspacePath,
  resolveWorkspacePathAllowArtifacts,
  toWorkspaceRelative
} from "../utils/path-guard.js";
import { redactText } from "../utils/redaction.js";
import {
  asObject,
  optionalNumber,
  optionalStringArray,
  requireString,
  stringEnum
} from "../utils/validation.js";

type Severity = "critical" | "high" | "medium" | "low";

interface SecurityFinding {
  id: string;
  severity: Severity;
  title: string;
  path: string;
  line: number;
  evidence: string;
  remediation: string;
  fingerprint: string;
}

interface SecurityReport {
  kind: "mobiloop-security-scan";
  scannedAt: string;
  workspaceRoot: string;
  scannedFiles: number;
  skippedFiles: number;
  findings: SecurityFinding[];
  summary: Record<Severity, number>;
}

const DEFAULT_MAX_FILES = 800;
const MAX_FILES = 2_000;
const SOURCE_EXTENSIONS = new Set([
  ".dart",
  ".gradle",
  ".h",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".kts",
  ".m",
  ".mm",
  ".plist",
  ".properties",
  ".swift",
  ".ts",
  ".tsx",
  ".xml",
  ".yaml",
  ".yml"
]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".gradle",
  ".mobiloop",
  ".next",
  ".dart_tool",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "Pods"
]);

export function securityTools(): McpTool[] {
  return [
    {
      name: "security.scan_source",
      description:
        "Scan mobile source and platform configuration for deterministic security signals without running target code.",
      inputSchema: objectSchema({ paths: arraySchema(stringSchema), maxFiles: numberSchema }),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const paths = optionalStringArray(args, "paths");
        const maxFiles = boundedMaxFiles(optionalNumber(args, "maxFiles"));
        const report = await scanSource(config, paths, maxFiles);
        const reportPath = await writeArtifactJson(config, "security", "source-scan", report);
        return jsonResponse({ ...report, reportPath });
      }
    },
    {
      name: "security.generate_test_plan",
      description:
        "Generate a deterministic mobile security test plan from a source-scan report for an AI or engineer to execute.",
      inputSchema: objectSchema({ reportPath: stringSchema }, ["reportPath"]),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const report = await readSecurityReport(
          resolveWorkspacePathAllowArtifacts(config, requireString(args, "reportPath"))
        );
        const plan = createTestPlan(report);
        const planPath = await writeArtifactJson(config, "security", "test-plan", plan);
        return jsonResponse({ ...plan, planPath });
      }
    },
    {
      name: "security.compare_scans",
      description:
        "Re-run the deterministic source scan and compare it with a baseline report after fixes.",
      inputSchema: objectSchema(
        { baselinePath: stringSchema, paths: arraySchema(stringSchema), maxFiles: numberSchema },
        ["baselinePath"]
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const baseline = await readSecurityReport(
          resolveWorkspacePathAllowArtifacts(config, requireString(args, "baselinePath"))
        );
        const current = await scanSource(
          config,
          optionalStringArray(args, "paths"),
          boundedMaxFiles(optionalNumber(args, "maxFiles"))
        );
        const baselineFingerprints = new Set(
          baseline.findings.map((finding) => finding.fingerprint)
        );
        const currentFingerprints = new Set(current.findings.map((finding) => finding.fingerprint));
        const resolved = baseline.findings.filter(
          (finding) => !currentFingerprints.has(finding.fingerprint)
        );
        const remaining = current.findings.filter((finding) =>
          baselineFingerprints.has(finding.fingerprint)
        );
        const introduced = current.findings.filter(
          (finding) => !baselineFingerprints.has(finding.fingerprint)
        );
        const comparison = {
          kind: "mobiloop-security-comparison",
          comparedAt: new Date().toISOString(),
          baselineSummary: baseline.summary,
          currentSummary: current.summary,
          resolved,
          remaining,
          introduced
        };
        const comparisonPath = await writeArtifactJson(
          config,
          "security",
          "scan-comparison",
          comparison
        );
        return jsonResponse({ ...comparison, comparisonPath });
      }
    },
    {
      name: "security.release_gate",
      description:
        "Evaluate a source-scan report against a severity threshold before release or merge.",
      inputSchema: objectSchema(
        {
          reportPath: stringSchema,
          failAtOrAbove: enumSchema(["critical", "high", "medium", "low"])
        },
        ["reportPath"]
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const report = await readSecurityReport(
          resolveWorkspacePathAllowArtifacts(config, requireString(args, "reportPath"))
        );
        const failAtOrAbove = stringEnum(
          args,
          "failAtOrAbove",
          ["critical", "high", "medium", "low"] as const,
          "high"
        );
        const blocked = report.findings.filter(
          (finding) => severityRank(finding.severity) >= severityRank(failAtOrAbove)
        );
        return jsonResponse({
          kind: "mobiloop-security-release-gate",
          passed: blocked.length === 0,
          failAtOrAbove,
          summary: report.summary,
          blocked
        });
      }
    }
  ];
}

async function scanSource(
  config: ServerConfig,
  configuredPaths: string[] | undefined,
  maxFiles: number
): Promise<SecurityReport> {
  const roots = (configuredPaths ?? [config.workspaceRoot]).map((entry) =>
    configuredPaths ? resolveWorkspacePath(config, entry) : entry
  );
  const files: string[] = [];
  let skippedFiles = 0;
  for (const root of roots) {
    skippedFiles += await collectSourceFiles(root, files, maxFiles);
  }
  const findings: SecurityFinding[] = [];
  for (const filePath of files) {
    const source = await fs.readFile(filePath, "utf8").catch(() => undefined);
    if (source === undefined || source.includes("\u0000")) {
      skippedFiles += 1;
      continue;
    }
    findings.push(...findFindings(config, filePath, source));
  }
  findings.sort((left, right) => {
    const severity = severityRank(right.severity) - severityRank(left.severity);
    return severity || left.path.localeCompare(right.path) || left.line - right.line;
  });
  return {
    kind: "mobiloop-security-scan",
    scannedAt: new Date().toISOString(),
    workspaceRoot: config.workspaceRoot,
    scannedFiles: files.length,
    skippedFiles,
    findings,
    summary: summarize(findings)
  };
}

async function collectSourceFiles(
  root: string,
  files: string[],
  maxFiles: number
): Promise<number> {
  const stat = await fs.lstat(root).catch(() => undefined);
  if (!stat || stat.isSymbolicLink()) return 1;
  if (stat.isFile()) {
    if (SOURCE_EXTENSIONS.has(path.extname(root).toLowerCase()) && files.length < maxFiles) {
      files.push(root);
      return 0;
    }
    return 1;
  }
  if (!stat.isDirectory()) return 1;

  let skipped = 0;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= maxFiles) return skipped + 1;
    if (entry.isSymbolicLink() || (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name))) {
      skipped += 1;
      continue;
    }
    skipped += await collectSourceFiles(path.join(root, entry.name), files, maxFiles);
  }
  return skipped;
}

function findFindings(config: ServerConfig, filePath: string, source: string): SecurityFinding[] {
  const relativePath = toWorkspaceRelative(config, filePath);
  const findings: SecurityFinding[] = [];
  const add = (
    id: string,
    severity: Severity,
    title: string,
    line: number,
    remediation: string
  ) => {
    const evidence = source.split(/\r?\n/)[line - 1] ?? "";
    findings.push({
      id,
      severity,
      title,
      path: relativePath,
      line,
      evidence: redactText(evidence.trim().slice(0, 240)),
      remediation,
      fingerprint: createHash("sha256")
        .update(`${id}:${relativePath}:${line}`)
        .digest("hex")
        .slice(0, 16)
    });
  };

  forEachMatch(
    source,
    /\b(?:AIza[0-9A-Za-z_-]{35}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,})\b/g,
    (_match, line) =>
      add(
        "MOBILOOP-HARDCODED-CREDENTIAL",
        "critical",
        "Hard-coded credential",
        line,
        "Remove the credential, rotate it, and load it from a platform-approved secret store."
      )
  );
  forEachMatch(
    source,
    /\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["'][^"'\s]{8,}["']/gi,
    (_match, line) =>
      add(
        "MOBILOOP-LITERAL-SECRET",
        "high",
        "Literal secret-like value",
        line,
        "Use runtime secret injection and avoid committing credentials or session material."
      )
  );
  forEachMatch(source, /http:\/\/(?!localhost\b|127\.0\.0\.1\b|\[::1\])/gi, (_match, line) =>
    add(
      "MOBILOOP-CLEARTEXT-TRANSPORT",
      "high",
      "Potential cleartext network transport",
      line,
      "Use HTTPS and pin or validate certificates where the threat model requires it."
    )
  );
  forEachMatch(
    source,
    /(?:AsyncStorage|SharedPreferences|UserDefaults).{0,100}\b(?:token|password|secret|session)\b/gi,
    (_match, line) =>
      add(
        "MOBILOOP-INSECURE-LOCAL-STORAGE",
        "high",
        "Sensitive value may use general local storage",
        line,
        "Store credentials in Keychain, Android Keystore, or an encrypted platform-backed store."
      )
  );
  forEachMatch(
    source,
    /(?:console\.log|Log\.[divew]|print)\(.{0,120}\b(?:token|password|secret|session)\b/gi,
    (_match, line) =>
      add(
        "MOBILOOP-SENSITIVE-LOGGING",
        "medium",
        "Sensitive value may be written to logs",
        line,
        "Remove sensitive logging and verify release builds suppress diagnostic output."
      )
  );

  if (path.basename(filePath) === "AndroidManifest.xml") {
    forEachMatch(source, /android:debuggable\s*=\s*["']true["']/gi, (_match, line) =>
      add(
        "MOBILOOP-ANDROID-DEBUGGABLE",
        "high",
        "Android app is debuggable",
        line,
        "Ensure release manifests set debuggable to false and verify the signed release artifact."
      )
    );
    forEachMatch(source, /android:usesCleartextTraffic\s*=\s*["']true["']/gi, (_match, line) =>
      add(
        "MOBILOOP-ANDROID-CLEARTEXT",
        "high",
        "Android manifest permits cleartext traffic",
        line,
        "Disable cleartext traffic or narrowly scope a network security exception."
      )
    );
    forEachMatch(source, /android:allowBackup\s*=\s*["']true["']/gi, (_match, line) =>
      add(
        "MOBILOOP-ANDROID-BACKUP",
        "medium",
        "Android backup is enabled",
        line,
        "Disable backup for sensitive data or confirm encrypted backup and exclusion rules."
      )
    );
    forEachMatch(source, /android:exported\s*=\s*["']true["']/gi, (_match, line) =>
      add(
        "MOBILOOP-ANDROID-EXPORTED",
        "medium",
        "Exported Android component needs review",
        line,
        "Require permissions and validate all external intents, extras, and deep-link inputs."
      )
    );
  }
  if (path.basename(filePath) === "Info.plist") {
    forEachMatch(source, /<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>/gi, (_match, line) =>
      add(
        "MOBILOOP-IOS-ATS-DISABLED",
        "high",
        "iOS App Transport Security is broadly disabled",
        line,
        "Remove NSAllowsArbitraryLoads and add only narrowly justified ATS exceptions."
      )
    );
    forEachMatch(source, /<key>UIFileSharingEnabled<\/key>\s*<true\/>/gi, (_match, line) =>
      add(
        "MOBILOOP-IOS-FILE-SHARING",
        "medium",
        "iOS file sharing is enabled",
        line,
        "Confirm shared documents contain no private application or user data."
      )
    );
  }
  return findings;
}

function createTestPlan(report: SecurityReport): Record<string, unknown> {
  const ids = new Set(report.findings.map((finding) => finding.id));
  const tests = [
    testCase(
      "SEC-001",
      "Release transport verification",
      "high",
      "Run the release build through login and API flows; capture traffic and verify no cleartext request is emitted.",
      "All remote traffic uses TLS and invalid certificates are rejected."
    ),
    testCase(
      "SEC-002",
      "Authentication boundary checks",
      "high",
      "Exercise unauthenticated launch, logout, expired-token, and account-switch paths on an emulator or device.",
      "Protected screens and APIs reject missing, expired, or cross-account credentials."
    ),
    testCase(
      "SEC-003",
      "Sensitive-data persistence review",
      "high",
      "Inspect app storage after login, logout, and process restart using platform tools.",
      "Tokens and credentials are absent from general preferences, logs, screenshots, and backups."
    )
  ];
  if (ids.has("MOBILOOP-ANDROID-CLEARTEXT") || ids.has("MOBILOOP-ANDROID-DEBUGGABLE")) {
    tests.push(
      testCase(
        "SEC-101",
        "Android release manifest gate",
        "high",
        "Build a release APK and inspect the merged manifest or package metadata.",
        "The release artifact is not debuggable and does not permit broad cleartext traffic."
      )
    );
  }
  if (ids.has("MOBILOOP-ANDROID-BACKUP") || ids.has("MOBILOOP-ANDROID-EXPORTED")) {
    tests.push(
      testCase(
        "SEC-102",
        "Android component and backup validation",
        "medium",
        "Attempt external intents against exported components and validate backup/exclusion behavior on a test device.",
        "Untrusted intents are rejected and sensitive data is not recoverable through backup."
      )
    );
  }
  if (ids.has("MOBILOOP-IOS-ATS-DISABLED") || ids.has("MOBILOOP-IOS-FILE-SHARING")) {
    tests.push(
      testCase(
        "SEC-201",
        "iOS transport and file-sharing validation",
        "high",
        "Install a release build, test a plaintext endpoint, and inspect Files-app exposure.",
        "ATS blocks plaintext traffic and shared files do not disclose private data."
      )
    );
  }
  if (ids.has("MOBILOOP-SENSITIVE-LOGGING")) {
    tests.push(
      testCase(
        "SEC-301",
        "Runtime log redaction",
        "medium",
        "Capture Android logcat or iOS simulator logs while authenticating and failing requests.",
        "Logs contain no credentials, tokens, passwords, or session identifiers."
      )
    );
  }
  return {
    kind: "mobiloop-security-test-plan",
    generatedAt: new Date().toISOString(),
    sourceReportSummary: report.summary,
    tests
  };
}

function testCase(
  id: string,
  title: string,
  severity: Severity,
  procedure: string,
  expected: string
) {
  return { id, title, severity, procedure, expected };
}

async function readSecurityReport(filePath: string): Promise<SecurityReport> {
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as Partial<SecurityReport>;
  if (
    parsed.kind !== "mobiloop-security-scan" ||
    !Array.isArray(parsed.findings) ||
    !parsed.summary
  ) {
    throw new Error("reportPath must reference a MobiLoop security.scan_source JSON report");
  }
  return parsed as SecurityReport;
}

function forEachMatch(
  source: string,
  pattern: RegExp,
  callback: (match: string, line: number) => void
): void {
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    callback(match[0], source.slice(0, index).split("\n").length);
  }
}

function boundedMaxFiles(value: number | undefined): number {
  return Math.max(1, Math.min(value ?? DEFAULT_MAX_FILES, MAX_FILES));
}

function summarize(findings: SecurityFinding[]): Record<Severity, number> {
  return findings.reduce(
    (summary, finding) => ({ ...summary, [finding.severity]: summary[finding.severity] + 1 }),
    { critical: 0, high: 0, medium: 0, low: 0 } as Record<Severity, number>
  );
}

function severityRank(severity: Severity): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}
