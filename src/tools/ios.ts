import path from "node:path";
import { McpTool, jsonResponse } from "../types.js";
import { booleanSchema, numberSchema, objectSchema, stringSchema } from "../schema.js";
import { asObject, optionalBoolean, optionalNumber, optionalString, requireString } from "../utils/validation.js";
import { resolveWorkspacePath, resolveWorkspacePathAllowArtifacts } from "../utils/path-guard.js";
import { runCommand } from "../utils/shell.js";
import { ensureArtifactsDir, writeArtifactText } from "../utils/artifacts.js";

export function iosTools(): McpTool[] {
  return [
    {
      name: "ios.list_simulators",
      description: "List available iOS simulators via xcrun simctl.",
      inputSchema: objectSchema({}),
      async handler(_input, { config }) {
        const result = await runCommand(config.xcrunPath, ["simctl", "list", "devices", "available", "-j"], {
          cwd: config.workspaceRoot,
          config
        });
        return jsonResponse(JSON.parse(result.stdout));
      }
    },
    {
      name: "ios.boot_simulator",
      description: "Boot an iOS simulator and optionally wait until boot completes.",
      inputSchema: objectSchema(
        {
          device: stringSchema,
          waitForBoot: booleanSchema,
          timeoutMs: numberSchema
        },
        ["device"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const device = requireString(args, "device");
        const waitForBoot = optionalBoolean(args, "waitForBoot") ?? true;
        const timeoutMs = optionalNumber(args, "timeoutMs") ?? 120_000;
        const boot = await runCommand(config.xcrunPath, ["simctl", "boot", device], {
          cwd: config.workspaceRoot,
          config,
          allowFailure: true
        });
        let bootstatus;
        if (waitForBoot) {
          bootstatus = await runCommand(config.xcrunPath, ["simctl", "bootstatus", device, "-b"], {
            cwd: config.workspaceRoot,
            config,
            timeoutMs
          });
        }
        return jsonResponse({
          device,
          bootExitCode: boot.exitCode,
          bootStdout: boot.stdout.trim(),
          bootStderr: boot.stderr.trim(),
          bootstatus: bootstatus
            ? { stdout: bootstatus.stdout.trim(), stderr: bootstatus.stderr.trim() }
            : undefined
        });
      }
    },
    {
      name: "ios.shutdown_simulator",
      description: "Shutdown an iOS simulator.",
      inputSchema: objectSchema({ device: stringSchema }, ["device"]),
      async handler(input, { config }) {
        const args = asObject(input);
        const device = requireString(args, "device");
        const result = await runCommand(config.xcrunPath, ["simctl", "shutdown", device], {
          cwd: config.workspaceRoot,
          config,
          allowFailure: true
        });
        return jsonResponse({ device, exitCode: result.exitCode, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
      }
    },
    {
      name: "ios.build_app",
      description: "Build an iOS simulator app with xcodebuild into MCP artifacts.",
      inputSchema: objectSchema(
        {
          workspace: stringSchema,
          project: stringSchema,
          scheme: stringSchema,
          configuration: stringSchema,
          sdk: stringSchema,
          destination: stringSchema,
          derivedDataPath: stringSchema
        },
        ["scheme"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const scheme = requireString(args, "scheme");
        const workspace = optionalString(args, "workspace");
        const project = optionalString(args, "project");
        if (!workspace && !project) {
          throw new Error("workspace or project is required");
        }
        const configuration = optionalString(args, "configuration") ?? "Debug";
        const sdk = optionalString(args, "sdk") ?? "iphonesimulator";
        const destination = optionalString(args, "destination") ?? "generic/platform=iOS Simulator";
        const derivedDataPath = optionalString(args, "derivedDataPath")
          ? resolveWorkspacePathAllowArtifacts(config, optionalString(args, "derivedDataPath")!)
          : path.join(await ensureArtifactsDir(config, "ios-derived-data"), scheme);
        const buildArgs = [
          ...(workspace ? ["-workspace", resolveWorkspacePath(config, workspace)] : []),
          ...(project ? ["-project", resolveWorkspacePath(config, project)] : []),
          "-scheme",
          scheme,
          "-configuration",
          configuration,
          "-sdk",
          sdk,
          "-destination",
          destination,
          "-derivedDataPath",
          derivedDataPath,
          "build"
        ];
        const result = await runCommand(config.xcodebuildPath, buildArgs, {
          cwd: config.workspaceRoot,
          config,
          timeoutMs: 45 * 60_000
        });
        const logPath = await writeArtifactText(config, "build", "ios-build", "log", result.stdout + result.stderr);
        return jsonResponse({ scheme, configuration, sdk, destination, derivedDataPath, logPath });
      }
    },
    {
      name: "ios.install_app",
      description: "Install an .app bundle on an iOS simulator.",
      inputSchema: objectSchema(
        {
          device: stringSchema,
          appPath: stringSchema
        },
        ["appPath"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const device = optionalString(args, "device") ?? "booted";
        const appPath = resolveWorkspacePathAllowArtifacts(config, requireString(args, "appPath"));
        const result = await runCommand(config.xcrunPath, ["simctl", "install", device, appPath], {
          cwd: config.workspaceRoot,
          config,
          timeoutMs: 120_000
        });
        return jsonResponse({ device, appPath, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
      }
    },
    {
      name: "ios.launch_app",
      description: "Launch an installed iOS simulator app by bundle id.",
      inputSchema: objectSchema(
        {
          device: stringSchema,
          bundleId: stringSchema,
          terminateRunning: booleanSchema
        },
        ["bundleId"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const device = optionalString(args, "device") ?? "booted";
        const bundleId = requireString(args, "bundleId");
        if (optionalBoolean(args, "terminateRunning") ?? true) {
          await runCommand(config.xcrunPath, ["simctl", "terminate", device, bundleId], {
            cwd: config.workspaceRoot,
            config,
            allowFailure: true
          });
        }
        const result = await runCommand(config.xcrunPath, ["simctl", "launch", device, bundleId], {
          cwd: config.workspaceRoot,
          config
        });
        return jsonResponse({ device, bundleId, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
      }
    },
    {
      name: "ios.capture_screenshot",
      description: "Capture an iOS simulator screenshot into artifacts.",
      inputSchema: objectSchema({ device: stringSchema, prefix: stringSchema }),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const device = optionalString(args, "device") ?? "booted";
        const prefix = optionalString(args, "prefix") ?? "ios-screen";
        const dir = await ensureArtifactsDir(config, "screenshots");
        const screenshotPath = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${prefix}.png`);
        await runCommand(config.xcrunPath, ["simctl", "io", device, "screenshot", screenshotPath], {
          cwd: config.workspaceRoot,
          config
        });
        return jsonResponse({ device, screenshotPath });
      }
    },
    {
      name: "ios.collect_logs",
      description: "Collect recent simulator logs into artifacts.",
      inputSchema: objectSchema(
        {
          device: stringSchema,
          last: stringSchema,
          predicate: stringSchema,
          prefix: stringSchema
        },
        []
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const device = optionalString(args, "device") ?? "booted";
        const last = optionalString(args, "last") ?? "5m";
        const predicate = optionalString(args, "predicate");
        const prefix = optionalString(args, "prefix") ?? "ios-sim-log";
        const simctlArgs = [
          "simctl",
          "spawn",
          device,
          "log",
          "show",
          "--style",
          "compact",
          "--last",
          last,
          ...(predicate ? ["--predicate", predicate] : [])
        ];
        const result = await runCommand(config.xcrunPath, simctlArgs, {
          cwd: config.workspaceRoot,
          config,
          allowFailure: true
        });
        const logPath = await writeArtifactText(config, "logs", prefix, "log", result.stdout + result.stderr);
        return jsonResponse({ device, last, predicate, logPath, exitCode: result.exitCode });
      }
    }
  ];
}
