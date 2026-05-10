import { McpTool, jsonResponse } from "../types.js";
import { ServerConfig } from "../types.js";
import { arraySchema, booleanSchema, numberSchema, objectSchema, stringSchema } from "../schema.js";
import { asObject, optionalBoolean, optionalNumber, optionalString, optionalStringArray, requireString } from "../utils/validation.js";
import { resolveWorkspacePath, resolveWorkspacePathAllowArtifacts } from "../utils/path-guard.js";
import { runCommand, startDetachedCommand } from "../utils/shell.js";
import { writeArtifactBuffer, writeArtifactText } from "../utils/artifacts.js";

export function deviceTools(): McpTool[] {
  return [
    {
      name: "device.list_devices",
      description: "List Android devices via adb devices -l.",
      inputSchema: objectSchema({}),
      async handler(_input, { config }) {
        const result = await runCommand(config.adbPath, ["devices", "-l"], {
          cwd: config.workspaceRoot,
          config
        });
        const devices = parseAdbDevices(result.stdout);
        return jsonResponse({ devices, raw: result.stdout.trim() });
      }
    },
    {
      name: "device.start_emulator",
      description: "Start an Android emulator by AVD name. Returns after launching or optional boot wait.",
      inputSchema: objectSchema(
        {
          avdName: stringSchema,
          waitForBoot: booleanSchema,
          timeoutMs: numberSchema
        },
        ["avdName"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const avdName = requireString(args, "avdName");
        const waitForBoot = optionalBoolean(args, "waitForBoot") ?? false;
        const timeoutMs = optionalNumber(args, "timeoutMs") ?? 120_000;
        const launch = startDetachedCommand(config.emulatorPath, ["-avd", avdName, "-no-snapshot-save"], {
          cwd: config.workspaceRoot
        });
        if (waitForBoot) {
          await waitForAndroidBoot(config, timeoutMs);
        }
        return jsonResponse({
          avdName,
          waitForBoot,
          launch
        });
      }
    },
    {
      name: "device.stop_emulator",
      description: "Stop an Android emulator through adb emu kill.",
      inputSchema: objectSchema({ serial: stringSchema }),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const serial = optionalString(args, "serial");
        const adbArgs = serial ? ["-s", serial, "emu", "kill"] : ["emu", "kill"];
        const result = await runCommand(config.adbPath, adbArgs, {
          cwd: config.workspaceRoot,
          config,
          allowFailure: true
        });
        return jsonResponse({ exitCode: result.exitCode, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
      }
    },
    {
      name: "device.install_app",
      description: "Install or replace an APK on an Android device.",
      inputSchema: objectSchema(
        {
          apkPath: stringSchema,
          serial: stringSchema
        },
        ["apkPath"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const apkPath = resolveWorkspacePathAllowArtifacts(config, requireString(args, "apkPath"));
        const serial = optionalString(args, "serial");
        const adbArgs = [...serialArgs(serial), "install", "-r", apkPath];
        const result = await runCommand(config.adbPath, adbArgs, {
          cwd: config.workspaceRoot,
          config,
          timeoutMs: 120_000
        });
        return jsonResponse({ apkPath, serial, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
      }
    },
    {
      name: "device.uninstall_app",
      description: "Uninstall an Android package from a device.",
      inputSchema: objectSchema({ packageName: stringSchema, serial: stringSchema }, ["packageName"]),
      async handler(input, { config }) {
        const args = asObject(input);
        const packageName = requireString(args, "packageName");
        const serial = optionalString(args, "serial");
        const result = await runCommand(config.adbPath, [...serialArgs(serial), "uninstall", packageName], {
          cwd: config.workspaceRoot,
          config,
          allowFailure: true
        });
        return jsonResponse({ packageName, serial, exitCode: result.exitCode, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
      }
    },
    {
      name: "device.clear_app_data",
      description: "Clear app data for an Android package.",
      inputSchema: objectSchema({ packageName: stringSchema, serial: stringSchema }, ["packageName"]),
      async handler(input, { config }) {
        const args = asObject(input);
        const packageName = requireString(args, "packageName");
        const serial = optionalString(args, "serial");
        const result = await runCommand(config.adbPath, [...serialArgs(serial), "shell", "pm", "clear", packageName], {
          cwd: config.workspaceRoot,
          config
        });
        return jsonResponse({ packageName, serial, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
      }
    },
    {
      name: "device.grant_permissions",
      description: "Grant one or more Android runtime permissions to a package.",
      inputSchema: objectSchema(
        {
          packageName: stringSchema,
          permissions: arraySchema(stringSchema),
          serial: stringSchema
        },
        ["packageName", "permissions"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const packageName = requireString(args, "packageName");
        const permissions = optionalStringArray(args, "permissions") ?? [];
        const serial = optionalString(args, "serial");
        const results = [];
        for (const permission of permissions) {
          const result = await runCommand(config.adbPath, [...serialArgs(serial), "shell", "pm", "grant", packageName, permission], {
            cwd: config.workspaceRoot,
            config,
            allowFailure: true
          });
          results.push({ permission, exitCode: result.exitCode, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
        }
        return jsonResponse({ packageName, serial, results });
      }
    },
    {
      name: "device.capture_screenshot",
      description: "Capture a PNG screenshot from an Android device into artifacts.",
      inputSchema: objectSchema({ serial: stringSchema, prefix: stringSchema }),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const serial = optionalString(args, "serial");
        const prefix = optionalString(args, "prefix") ?? "adb-screen";
        const result = await runCommand(config.adbPath, [...serialArgs(serial), "exec-out", "screencap", "-p"], {
          cwd: config.workspaceRoot,
          config,
          maxOutputBytes: 8 * 1024 * 1024
        });
        const screenshotPath = await writeArtifactBuffer(config, "screenshots", prefix, "png", result.stdoutBuffer);
        return jsonResponse({ serial, screenshotPath, bytes: result.stdoutBuffer.length });
      }
    },
    {
      name: "device.pull_logs",
      description: "Pull Android logcat into artifacts. Optionally filter by package pid when available.",
      inputSchema: objectSchema(
        {
          serial: stringSchema,
          packageName: stringSchema,
          clearAfter: booleanSchema,
          outputPath: stringSchema
        },
        []
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const serial = optionalString(args, "serial");
        const packageName = optionalString(args, "packageName");
        const clearAfter = optionalBoolean(args, "clearAfter") ?? false;
        const pid = packageName ? await pidOf(config, serial, packageName) : undefined;
        const logArgs = [...serialArgs(serial), "logcat", "-d", ...(pid ? ["--pid", pid] : [])];
        const result = await runCommand(config.adbPath, logArgs, {
          cwd: config.workspaceRoot,
          config,
          allowFailure: true,
          maxOutputBytes: config.maxOutputBytes
        });
        const outputPath = optionalString(args, "outputPath");
        const logPath = outputPath
          ? resolveWorkspacePath(config, outputPath)
          : await writeArtifactText(config, "logs", packageName ?? "logcat", "log", result.stdout + result.stderr);
        if (outputPath) {
          await import("node:fs/promises").then((fs) => fs.writeFile(logPath, result.stdout + result.stderr, "utf8"));
        }
        if (clearAfter) {
          await runCommand(config.adbPath, [...serialArgs(serial), "logcat", "-c"], {
            cwd: config.workspaceRoot,
            config,
            allowFailure: true
          });
        }
        return jsonResponse({ serial, packageName, pid, logPath, exitCode: result.exitCode, bytes: result.stdout.length + result.stderr.length });
      }
    }
  ];
}

function serialArgs(serial?: string): string[] {
  return serial ? ["-s", serial] : [];
}

function parseAdbDevices(raw: string): Array<{ serial: string; state: string; details: string }> {
  return raw
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/);
      return { serial, state, details: details.join(" ") };
    });
}

async function waitForAndroidBoot(config: ServerConfig, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await runCommand(config.adbPath, ["shell", "getprop", "sys.boot_completed"], {
      cwd: config.workspaceRoot,
      config,
      allowFailure: true,
      timeoutMs: 5_000
    });
    if (result.stdout.trim() === "1") return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Timed out waiting for Android boot");
}

async function pidOf(config: ServerConfig, serial: string | undefined, packageName: string): Promise<string | undefined> {
  const result = await runCommand(config.adbPath, [...serialArgs(serial), "shell", "pidof", packageName], {
    cwd: config.workspaceRoot,
    config,
    allowFailure: true
  });
  const pid = result.stdout.trim().split(/\s+/)[0];
  return pid || undefined;
}
