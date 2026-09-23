import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { SecurityMode, ServerConfig, ToolPolicy } from "./types.js";
import { assertApiAllowed } from "./utils/api-allowlist.js";
import {
  asOptionalBoolean,
  asOptionalNumber,
  asOptionalString,
  asOptionalStringArray,
  optionalObject
} from "./utils/validation.js";

const DEFAULT_FORBIDDEN_PATH_GLOBS = [
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "**/*.keystore",
  "**/*.jks",
  "**/*.p12",
  "**/*.mobileprovision",
  "**/GoogleService-Info.plist",
  "**/google-services.json",
  "**/*secret*",
  "**/*credential*"
];

const DEFAULT_LOCAL_ALLOWLIST = ["http://127.0.0.1:*", "http://localhost:*"];

export async function loadConfig(): Promise<ServerConfig> {
  const cwd = process.cwd();
  const configPathFromEnv = process.env.MOBILOOP_CONFIG ?? process.env.AGENTIC_MOBILE_MCP_CONFIG;
  const modeFromEnv = securityModeFromEnv();
  const configPath = configPathFromEnv
    ? path.resolve(configPathFromEnv)
    : await defaultConfigPath(cwd);
  const shouldLoadLocalConfig = Boolean(configPathFromEnv) || modeFromEnv === "trusted";
  const rawConfig = shouldLoadLocalConfig ? await readJsonIfExists(configPath) : {};
  await validateConfigSchema(rawConfig, configPath);
  const securityMode = parseSecurityMode(
    modeFromEnv ?? asOptionalString(rawConfig, "securityMode") ?? "secure"
  );
  const workspaceRootFromEnv =
    process.env.MOBILOOP_WORKSPACE_ROOT ?? process.env.AGENTIC_MOBILE_WORKSPACE_ROOT;
  const workspaceRootValue =
    workspaceRootFromEnv ?? asOptionalString(rawConfig, "workspaceRoot") ?? cwd;
  const workspaceRoot = path.resolve(cwd, workspaceRootValue);

  const artifactsValue = asOptionalString(rawConfig, "artifactsDir") ?? ".mobiloop";
  const artifactsDir = path.resolve(workspaceRoot, artifactsValue);
  assertInside(workspaceRoot, artifactsDir, "artifactsDir");
  const runId = process.env.MOBILOOP_RUN_ID ?? asOptionalString(rawConfig, "runId");
  const appiumAllowlist =
    securityMode === "secure"
      ? DEFAULT_LOCAL_ALLOWLIST
      : (asOptionalStringArray(rawConfig, "appiumAllowlist") ?? DEFAULT_LOCAL_ALLOWLIST);
  const apiAllowlist = asOptionalStringArray(rawConfig, "apiAllowlist") ?? DEFAULT_LOCAL_ALLOWLIST;
  const appiumServerUrl =
    process.env.APPIUM_SERVER_URL ??
    (securityMode === "trusted" ? asOptionalString(rawConfig, "appiumServerUrl") : undefined) ??
    "http://127.0.0.1:4723";
  if (securityMode === "secure" && appiumAllowlist.length === 0) {
    throw new Error("secure mode requires a non-empty appiumAllowlist");
  }
  if (securityMode === "secure" && apiAllowlist.length === 0) {
    throw new Error("secure mode requires a non-empty apiAllowlist");
  }
  assertApiAllowed(appiumServerUrl, appiumAllowlist);
  const requireApproval =
    envBoolean("MOBILOOP_REQUIRE_APPROVAL") ??
    asOptionalBoolean(rawConfig, "requireApproval") ??
    securityMode === "secure";
  const redactArtifacts =
    envBoolean("MOBILOOP_REDACT_ARTIFACTS") ??
    asOptionalBoolean(rawConfig, "redactArtifacts") ??
    true;
  if (securityMode === "secure" && !requireApproval) {
    throw new Error("secure mode requires approval enforcement; use trusted mode to disable it");
  }
  if (securityMode === "secure" && !redactArtifacts) {
    throw new Error("secure mode requires artifact redaction; use trusted mode to disable it");
  }

  return {
    securityMode,
    workspaceRoot,
    artifactsDir,
    runId,
    maxCommandMs: asOptionalNumber(rawConfig, "maxCommandMs") ?? 120_000,
    maxOutputBytes: asOptionalNumber(rawConfig, "maxOutputBytes") ?? 1_048_576,
    maxFixAttempts: asOptionalNumber(rawConfig, "maxFixAttempts") ?? 3,
    maxTestIterations: asOptionalNumber(rawConfig, "maxTestIterations") ?? 5,
    maxRuntimeMinutes: asOptionalNumber(rawConfig, "maxRuntimeMinutes") ?? 30,
    allowedBranchPattern:
      (securityMode === "trusted"
        ? asOptionalString(rawConfig, "allowedBranchPattern")
        : undefined) ?? "^feature/ai-[A-Za-z0-9._/-]+$",
    appiumServerUrl,
    adbPath:
      (securityMode === "trusted" ? asOptionalString(rawConfig, "adbPath") : undefined) ?? "adb",
    emulatorPath:
      (securityMode === "trusted" ? asOptionalString(rawConfig, "emulatorPath") : undefined) ??
      "emulator",
    xcrunPath:
      (securityMode === "trusted" ? asOptionalString(rawConfig, "xcrunPath") : undefined) ??
      "xcrun",
    xcodebuildPath:
      (securityMode === "trusted" ? asOptionalString(rawConfig, "xcodebuildPath") : undefined) ??
      "xcodebuild",
    sqlitePath:
      (securityMode === "trusted" ? asOptionalString(rawConfig, "sqlitePath") : undefined) ??
      "sqlite3",
    apiAllowlist,
    appiumAllowlist,
    forbiddenPathGlobs:
      (securityMode === "trusted"
        ? asOptionalStringArray(rawConfig, "forbiddenPathGlobs")
        : undefined) ?? DEFAULT_FORBIDDEN_PATH_GLOBS,
    toolPolicies: securityMode === "trusted" ? parseToolPolicies(rawConfig) : {},
    requireApproval,
    redactArtifacts
  };
}

async function validateConfigSchema(
  rawConfig: Record<string, unknown>,
  configPath: string
): Promise<void> {
  const schema = await readConfigSchema();
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validate = ajv.compile(schema);
  if (validate(rawConfig)) return;
  const details = (validate.errors ?? [])
    .map((error: { instancePath?: string; message?: string }) => {
      const pathLabel = error.instancePath || "/";
      return `- ${pathLabel} ${error.message ?? "is invalid"}`;
    })
    .join("\n");
  throw new Error(`Invalid ${configPath}:\n${details}`);
}

async function readConfigSchema(): Promise<Record<string, unknown>> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, "../schema/mobiloop.config.schema.json"),
    path.resolve(currentDir, "../../schema/mobiloop.config.schema.json"),
    path.resolve(process.cwd(), "schema/mobiloop.config.schema.json")
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(await fs.readFile(candidate, "utf8")) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  throw new Error("Could not find schema/mobiloop.config.schema.json");
}

function envBoolean(name: string): boolean | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error(`${name} must be true or false`);
}

function securityModeFromEnv(): SecurityMode | undefined {
  const value = process.env.MOBILOOP_SECURITY_MODE;
  return value === undefined ? undefined : parseSecurityMode(value);
}

function parseSecurityMode(value: string): SecurityMode {
  if (value === "secure" || value === "trusted") return value;
  throw new Error("securityMode must be secure or trusted");
}

function parseToolPolicies(
  rawConfig: Record<string, unknown>
): Record<string, Partial<ToolPolicy>> {
  const value = optionalObject(rawConfig, "toolPolicies");
  if (!value) return {};
  const policies: Record<string, Partial<ToolPolicy>> = {};
  for (const [toolName, rawPolicy] of Object.entries(value)) {
    if (!rawPolicy || typeof rawPolicy !== "object" || Array.isArray(rawPolicy)) {
      throw new Error(`toolPolicies.${toolName} must be an object`);
    }
    policies[toolName] = rawPolicy as Partial<ToolPolicy>;
  }
  return policies;
}

async function defaultConfigPath(cwd: string): Promise<string> {
  const primary = path.join(cwd, "mobiloop.config.json");
  if (await fileExists(primary)) {
    return primary;
  }

  const legacy = path.join(cwd, "agentic-mobile-mcp.config.json");
  if (await fileExists(legacy)) {
    return legacy;
  }

  return primary;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function assertInside(root: string, candidate: string, label: string): void {
  const relative = path.relative(root, candidate);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`${label} must stay inside workspaceRoot: ${candidate}`);
}

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${filePath} must contain a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
