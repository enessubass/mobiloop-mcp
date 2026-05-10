import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { McpTool, ServerConfig, jsonResponse } from "../types.js";
import { objectSchema, stringSchema } from "../schema.js";
import { asObject, optionalString } from "../utils/validation.js";
import { runCommand } from "../utils/shell.js";

type PreflightTarget = "all" | "android" | "ios" | "flutter" | "react-native" | "ci";

interface Check {
  name: string;
  required: boolean;
  ok: boolean;
  detail: string;
}

export function envTools(): McpTool[] {
  return [
    {
      name: "env.preflight",
      description: "Check host/project readiness for Android, iOS, Flutter, React Native, CI, or all environments.",
      inputSchema: objectSchema({ target: stringSchema }, []),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const target = normalizeTarget(optionalString(args, "target") ?? "all");
        const checks: Check[] = [];
        checks.push({
          name: "platform",
          required: true,
          ok: true,
          detail: `${os.platform()} ${os.release()} ${os.arch()}`
        });
        checks.push({
          name: "node",
          required: true,
          ok: Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) >= 20,
          detail: process.version
        });
        checks.push(await checkPath("workspaceRoot", config.workspaceRoot, true));
        checks.push(await checkPath("artifactsDir_parent", path.dirname(config.artifactsDir), true));
        checks.push(await checkCommand(config, "git", ["--version"], true));
        checks.push(await checkGitRepo(config));

        if (target === "all" || target === "android" || target === "flutter" || target === "react-native") {
          checks.push(await checkCommand(config, config.adbPath, ["version"], true));
          checks.push(await checkCommand(config, config.emulatorPath, ["-version"], target === "android"));
          checks.push(await checkCommand(config, "java", ["-version"], true));
        }
        if (target === "all" || target === "flutter") {
          checks.push(await checkCommand(config, "flutter", ["--version"], true));
          checks.push(await checkPath("pubspec.yaml", path.join(config.workspaceRoot, "pubspec.yaml"), false));
        }
        if (target === "all" || target === "react-native") {
          checks.push(await checkCommand(config, "npm", ["--version"], true));
          checks.push(await checkPath("package.json", path.join(config.workspaceRoot, "package.json"), false));
          checks.push(await checkPath("android directory", path.join(config.workspaceRoot, "android"), false));
        }
        if (target === "all" || target === "ios") {
          const macRequired = os.platform() === "darwin";
          checks.push({
            name: "macOS_for_iOS",
            required: true,
            ok: macRequired,
            detail: macRequired ? "iOS simulator workflows available on macOS" : "iOS simulator workflows require macOS"
          });
          checks.push(await checkCommand(config, config.xcrunPath, ["--version"], macRequired));
          checks.push(await checkCommand(config, config.xcodebuildPath, ["-version"], macRequired));
        }
        if (target === "all" || target === "ci") {
          checks.push(await checkCommand(config, "gh", ["--version"], false));
        }
        checks.push(await checkAppium(config, target === "android" || target === "ios" || target === "all"));
        checks.push(await checkCommand(config, config.sqlitePath, ["-version"], false));
        checks.push(await checkCommand(config, "rg", ["--version"], false));

        const requiredFailures = checks.filter((check) => check.required && !check.ok);
        return jsonResponse({
          passed: requiredFailures.length === 0,
          target,
          workspaceRoot: config.workspaceRoot,
          artifactsDir: config.artifactsDir,
          requiredFailures,
          checks
        });
      }
    },
    {
      name: "env.compatibility_matrix",
      description: "Return supported host/platform requirements for this MCP package.",
      inputSchema: objectSchema({}),
      async handler() {
        return jsonResponse({
          node: ">=20",
          mcpTransport: "stdio",
          android: {
            hosts: ["macOS", "Linux", "Windows"],
            requires: ["Android SDK", "adb", "Android Emulator or physical device", "Appium 2", "UiAutomator2 driver"]
          },
          flutter: {
            hosts: ["macOS", "Linux", "Windows"],
            requires: ["Flutter SDK", "Android SDK for Android builds", "Xcode on macOS for iOS builds"]
          },
          reactNative: {
            hosts: ["macOS", "Linux", "Windows for Android", "macOS for iOS"],
            requires: ["Node/npm", "Android Gradle toolchain", "Xcode for iOS"]
          },
          ios: {
            hosts: ["macOS only"],
            requires: ["Xcode", "xcrun simctl", "iOS Simulator", "Appium 2", "XCUITest driver/WebDriverAgent"]
          },
          notGuaranteed: [
            "iOS simulator on Linux or Windows",
            "mobile builds without platform SDKs",
            "Appium flows without stable accessibility ids or testable app state",
            "external API checks outside apiAllowlist"
          ]
        });
      }
    }
  ];
}

async function checkAppium(config: ServerConfig, required: boolean): Promise<Check> {
  const server = await checkAppiumServer(config.appiumServerUrl);
  if (server.ok) {
    return {
      name: "appium",
      required,
      ok: true,
      detail: `server reachable at ${config.appiumServerUrl}: ${server.detail}`
    };
  }
  const command = await checkCommand(config, "appium", ["--version"], required);
  if (command.ok) {
    return { name: "appium", required, ok: true, detail: `command available: ${command.detail}` };
  }
  return {
    name: "appium",
    required,
    ok: false,
    detail: `server not reachable at ${config.appiumServerUrl}: ${server.detail}; command check: ${command.detail}`
  };
}

async function checkAppiumServer(serverUrl: string): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const base = new URL(serverUrl);
    const basePath = base.pathname.endsWith("/") ? base.pathname.slice(0, -1) : base.pathname;
    base.pathname = `${basePath}/status`;
    const response = await fetch(base, { signal: controller.signal });
    const text = await response.text();
    return {
      ok: response.ok,
      detail: text.slice(0, 300) || `HTTP ${response.status}`
    };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTarget(value: string): PreflightTarget {
  const allowed: PreflightTarget[] = ["all", "android", "ios", "flutter", "react-native", "ci"];
  if (allowed.includes(value as PreflightTarget)) return value as PreflightTarget;
  throw new Error(`target must be one of: ${allowed.join(", ")}`);
}

async function checkPath(name: string, filePath: string, required: boolean): Promise<Check> {
  try {
    const stat = await fs.stat(filePath);
    return { name, required, ok: true, detail: stat.isDirectory() ? "directory exists" : "file exists" };
  } catch (error) {
    return { name, required, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function checkCommand(
  config: ServerConfig,
  command: string,
  args: string[],
  required: boolean
): Promise<Check> {
  try {
    const result = await runCommand(command, args, {
      cwd: config.workspaceRoot,
      config,
      allowFailure: true,
      timeoutMs: 10_000,
      maxOutputBytes: 16_000
    });
    const output = `${result.stdout}\n${result.stderr}`.trim().split(/\r?\n/).slice(0, 3).join("\n");
    return {
      name: `command:${command}`,
      required,
      ok: result.exitCode === 0 || command === config.emulatorPath,
      detail: output || `exit ${result.exitCode ?? result.signal}`
    };
  } catch (error) {
    return { name: `command:${command}`, required, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function checkGitRepo(config: ServerConfig): Promise<Check> {
  try {
    const result = await runCommand("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: config.workspaceRoot,
      config,
      allowFailure: true
    });
    return {
      name: "git_repository",
      required: false,
      ok: result.stdout.trim() === "true",
      detail: result.stdout.trim() || result.stderr.trim() || "not a git repository"
    };
  } catch (error) {
    return { name: "git_repository", required: false, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
