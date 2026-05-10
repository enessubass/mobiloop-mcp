import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { McpTool, jsonResponse } from "../types.js";
import { enumSchema, objectSchema, stringSchema } from "../schema.js";
import { asObject, optionalString, stringEnum } from "../utils/validation.js";
import { writeArtifactText } from "../utils/artifacts.js";
import { runCommand } from "../utils/shell.js";

type ProjectKind = "flutter" | "react-native" | "android" | "unknown";

export function buildTools(): McpTool[] {
  return [
    {
      name: "build.detect_project",
      description: "Detect Flutter, React Native, or native Android project type.",
      inputSchema: objectSchema({}),
      async handler(_input, { config }) {
        return jsonResponse(await detectProject(config.workspaceRoot));
      }
    },
    {
      name: "build.install_dependencies",
      description: "Install dependencies for the detected or specified mobile project type.",
      inputSchema: objectSchema({ kind: enumSchema(["flutter", "react-native", "android"]) }),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const detected = await detectProject(config.workspaceRoot);
        const kind = optionalString(args, "kind") ?? detected.kind;
        const command = dependencyCommand(config.workspaceRoot, kind as ProjectKind);
        const result = await runCommand(command.command, command.args, {
          cwd: command.cwd,
          config,
          timeoutMs: 10 * 60_000
        });
        const logPath = await writeArtifactText(config, "build", "install-dependencies", "log", result.stdout + result.stderr);
        return jsonResponse({ kind, command, exitCode: result.exitCode, durationMs: result.durationMs, logPath });
      }
    },
    {
      name: "build.run_lint",
      description: "Run lint/static analysis for Flutter, React Native, or Android.",
      inputSchema: objectSchema({ kind: enumSchema(["flutter", "react-native", "android"]) }),
      async handler(input, { config }) {
        const kind = await resolvedKind(input, config.workspaceRoot);
        const command = lintCommand(config.workspaceRoot, kind);
        const result = await runCommand(command.command, command.args, {
          cwd: command.cwd,
          config,
          timeoutMs: 10 * 60_000
        });
        const logPath = await writeArtifactText(config, "build", "lint", "log", result.stdout + result.stderr);
        return jsonResponse({ kind, command, exitCode: result.exitCode, durationMs: result.durationMs, logPath });
      }
    },
    {
      name: "build.run_unit_tests",
      description: "Run unit tests for Flutter, React Native, or Android.",
      inputSchema: objectSchema({ kind: enumSchema(["flutter", "react-native", "android"]) }),
      async handler(input, { config }) {
        const kind = await resolvedKind(input, config.workspaceRoot);
        const command = testCommand(config.workspaceRoot, kind);
        const result = await runCommand(command.command, command.args, {
          cwd: command.cwd,
          config,
          timeoutMs: 15 * 60_000
        });
        const logPath = await writeArtifactText(config, "build", "unit-tests", "log", result.stdout + result.stderr);
        return jsonResponse({ kind, command, exitCode: result.exitCode, durationMs: result.durationMs, logPath });
      }
    },
    {
      name: "build.build_debug_apk",
      description: "Build a debug APK and return discovered APK artifact paths.",
      inputSchema: objectSchema({ kind: enumSchema(["flutter", "react-native", "android"]) }),
      async handler(input, { config }) {
        const kind = await resolvedKind(input, config.workspaceRoot);
        const command = debugApkCommand(config.workspaceRoot, kind);
        const result = await runCommand(command.command, command.args, {
          cwd: command.cwd,
          config,
          timeoutMs: 30 * 60_000
        });
        const apkPaths = await findDebugApks(config.workspaceRoot, kind);
        const logPath = await writeArtifactText(config, "build", "debug-apk", "log", result.stdout + result.stderr);
        return jsonResponse({ kind, command, exitCode: result.exitCode, durationMs: result.durationMs, apkPaths, logPath });
      }
    },
    {
      name: "build.build_release_candidate",
      description: "Build a release candidate APK. Release signing requirements are delegated to the target project.",
      inputSchema: objectSchema({ kind: enumSchema(["flutter", "react-native", "android"]) }),
      async handler(input, { config }) {
        const kind = await resolvedKind(input, config.workspaceRoot);
        const command = releaseCandidateCommand(config.workspaceRoot, kind);
        const result = await runCommand(command.command, command.args, {
          cwd: command.cwd,
          config,
          timeoutMs: 45 * 60_000
        });
        const apkPaths = await findApks(config.workspaceRoot, kind, "release");
        const logPath = await writeArtifactText(config, "build", "release-candidate", "log", result.stdout + result.stderr);
        return jsonResponse({ kind, command, exitCode: result.exitCode, durationMs: result.durationMs, apkPaths, logPath });
      }
    },
    {
      name: "build.collect_build_logs",
      description: "List build log artifacts emitted by this MCP server.",
      inputSchema: objectSchema({}),
      async handler(_input, { config }) {
        const dir = path.join(config.artifactsDir, "build");
        const entries = await fs.readdir(dir).catch(() => []);
        return jsonResponse({ logDir: dir, logs: entries.map((entry) => path.join(dir, entry)) });
      }
    }
  ];
}

async function resolvedKind(input: unknown, workspaceRoot: string): Promise<ProjectKind> {
  const args = asObject(input ?? {});
  const detected = await detectProject(workspaceRoot);
  const kind = stringEnum(args, "kind", ["flutter", "react-native", "android"], detected.kind === "unknown" ? undefined : detected.kind);
  return kind;
}

async function detectProject(workspaceRoot: string): Promise<{ kind: ProjectKind; reasons: string[] }> {
  const reasons: string[] = [];
  if (await exists(path.join(workspaceRoot, "pubspec.yaml"))) {
    reasons.push("pubspec.yaml found");
    return { kind: "flutter", reasons };
  }
  if (await exists(path.join(workspaceRoot, "package.json"))) {
    const pkg = JSON.parse(await fs.readFile(path.join(workspaceRoot, "package.json"), "utf8"));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    if (deps["react-native"]) {
      reasons.push("package.json has react-native dependency");
      return { kind: "react-native", reasons };
    }
  }
  if ((await exists(path.join(workspaceRoot, "gradlew"))) || (await exists(path.join(workspaceRoot, "build.gradle"))) || (await exists(path.join(workspaceRoot, "build.gradle.kts")))) {
    reasons.push("Gradle Android files found");
    return { kind: "android", reasons };
  }
  return { kind: "unknown", reasons };
}

function dependencyCommand(root: string, kind: ProjectKind): CommandSpec {
  if (kind === "flutter") return { command: "flutter", args: ["pub", "get"], cwd: root };
  if (kind === "react-native") {
    return { command: "npm", args: [hasFileSync(root, "package-lock.json") ? "ci" : "install"], cwd: root };
  }
  if (kind === "android") return gradle(root, ["--version"]);
  throw new Error("Cannot install dependencies for unknown project type");
}

function lintCommand(root: string, kind: ProjectKind): CommandSpec {
  if (kind === "flutter") return { command: "flutter", args: ["analyze"], cwd: root };
  if (kind === "react-native") return { command: "npm", args: ["run", "--if-present", "lint"], cwd: root };
  if (kind === "android") return gradle(root, ["lintDebug"]);
  throw new Error("Cannot lint unknown project type");
}

function testCommand(root: string, kind: ProjectKind): CommandSpec {
  if (kind === "flutter") return { command: "flutter", args: ["test"], cwd: root };
  if (kind === "react-native") return { command: "npm", args: ["test", "--", "--watch=false"], cwd: root };
  if (kind === "android") return gradle(root, ["test"]);
  throw new Error("Cannot test unknown project type");
}

function debugApkCommand(root: string, kind: ProjectKind): CommandSpec {
  if (kind === "flutter") return { command: "flutter", args: ["build", "apk", "--debug"], cwd: root };
  if (kind === "react-native") return gradle(path.join(root, "android"), ["assembleDebug"]);
  if (kind === "android") return gradle(root, ["assembleDebug"]);
  throw new Error("Cannot build unknown project type");
}

function releaseCandidateCommand(root: string, kind: ProjectKind): CommandSpec {
  if (kind === "flutter") return { command: "flutter", args: ["build", "apk", "--release"], cwd: root };
  if (kind === "react-native") return gradle(path.join(root, "android"), ["assembleRelease"]);
  if (kind === "android") return gradle(root, ["assembleRelease"]);
  throw new Error("Cannot build unknown project type");
}

function gradle(root: string, args: string[]): CommandSpec {
  const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  return { command: wrapper, args, cwd: root };
}

async function findDebugApks(root: string, kind: ProjectKind): Promise<string[]> {
  return findApks(root, kind, "debug");
}

async function findApks(root: string, kind: ProjectKind, variant: "debug" | "release"): Promise<string[]> {
  const candidates =
    kind === "flutter"
      ? [path.join(root, "build", "app", "outputs", "flutter-apk")]
      : kind === "react-native"
        ? [path.join(root, "android", "app", "build", "outputs", "apk", variant)]
        : [path.join(root, "app", "build", "outputs", "apk", variant), path.join(root, "build", "outputs", "apk", variant)];
  const output: string[] = [];
  for (const dir of candidates) {
    const entries = await fs.readdir(dir).catch(() => []);
    for (const entry of entries) {
      if (entry.endsWith(".apk") && (kind !== "flutter" || entry.includes(variant))) {
        output.push(path.join(dir, entry));
      }
    }
  }
  return output;
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true, () => false);
}

function hasFileSync(root: string, fileName: string): boolean {
  return fsSync.existsSync(path.join(root, fileName));
}

interface CommandSpec {
  command: string;
  args: string[];
  cwd: string;
}
