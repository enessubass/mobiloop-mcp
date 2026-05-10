import fs from "node:fs/promises";
import path from "node:path";
import { ServerConfig } from "./types.js";
import { asOptionalNumber, asOptionalString, asOptionalStringArray } from "./utils/validation.js";

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

export async function loadConfig(): Promise<ServerConfig> {
  const cwd = process.cwd();
  const configPathFromEnv = process.env.MOBILOOP_CONFIG ?? process.env.AGENTIC_MOBILE_MCP_CONFIG;
  const configPath = configPathFromEnv
    ? path.resolve(configPathFromEnv)
    : await defaultConfigPath(cwd);

  const rawConfig = await readJsonIfExists(configPath);
  const workspaceRootFromEnv =
    process.env.MOBILOOP_WORKSPACE_ROOT ?? process.env.AGENTIC_MOBILE_WORKSPACE_ROOT;
  const workspaceRootValue = workspaceRootFromEnv ?? asOptionalString(rawConfig, "workspaceRoot") ?? cwd;
  const workspaceRoot = path.resolve(cwd, workspaceRootValue);

  const artifactsValue = asOptionalString(rawConfig, "artifactsDir") ?? ".mobiloop";
  const artifactsDir = path.resolve(workspaceRoot, artifactsValue);
  assertInside(workspaceRoot, artifactsDir, "artifactsDir");

  return {
    workspaceRoot,
    artifactsDir,
    maxCommandMs: asOptionalNumber(rawConfig, "maxCommandMs") ?? 120_000,
    maxOutputBytes: asOptionalNumber(rawConfig, "maxOutputBytes") ?? 1_048_576,
    maxFixAttempts: asOptionalNumber(rawConfig, "maxFixAttempts") ?? 3,
    maxTestIterations: asOptionalNumber(rawConfig, "maxTestIterations") ?? 5,
    maxRuntimeMinutes: asOptionalNumber(rawConfig, "maxRuntimeMinutes") ?? 30,
    allowedBranchPattern:
      asOptionalString(rawConfig, "allowedBranchPattern") ?? "^feature/ai-[A-Za-z0-9._/-]+$",
    appiumServerUrl:
      process.env.APPIUM_SERVER_URL ??
      asOptionalString(rawConfig, "appiumServerUrl") ??
      "http://127.0.0.1:4723",
    adbPath: asOptionalString(rawConfig, "adbPath") ?? "adb",
    emulatorPath: asOptionalString(rawConfig, "emulatorPath") ?? "emulator",
    xcrunPath: asOptionalString(rawConfig, "xcrunPath") ?? "xcrun",
    xcodebuildPath: asOptionalString(rawConfig, "xcodebuildPath") ?? "xcodebuild",
    sqlitePath: asOptionalString(rawConfig, "sqlitePath") ?? "sqlite3",
    apiAllowlist: asOptionalStringArray(rawConfig, "apiAllowlist") ?? [
      "http://127.0.0.1:*",
      "http://localhost:*"
    ],
    forbiddenPathGlobs:
      asOptionalStringArray(rawConfig, "forbiddenPathGlobs") ?? DEFAULT_FORBIDDEN_PATH_GLOBS
  };
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
