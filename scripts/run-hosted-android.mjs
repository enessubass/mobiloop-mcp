import fs from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";
import { hasReadyAndroidServices } from "./android-ci-runtime.mjs";

if (process.env.CI !== "true")
  throw new Error("This runner is only for disposable CI VMs, never user devices");
const spawnSync = spawn.sync;
const repo = fileURLToPath(new URL("../", import.meta.url));
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error("Android SDK is required");
const win = process.platform === "win32";
const executable = (name) => `${name}${win ? ".exe" : ""}`;
const adb = path.join(sdk, "platform-tools", executable("adb"));
const emulator = path.join(sdk, "emulator", executable("emulator"));
const logs = path.join(repo, ".mobiloop", "hosted-android");
await fs.mkdir(logs, { recursive: true });
const runtime = JSON.parse(
  await fs.readFile(path.join(repo, ".mobiloop", "ci-avd", "runtime.json"), "utf8")
);
if (!["on", "off"].includes(runtime.acceleration)) throw new Error("Invalid CI acceleration mode");
await fs.writeFile(path.join(logs, "runtime.json"), JSON.stringify(runtime, null, 2));
console.log(`Android CI runtime: ${runtime.systemImage}; acceleration=${runtime.acceleration}`);
const env = {
  ...process.env,
  ANDROID_AVD_HOME: path.join(repo, ".mobiloop", "ci-avd"),
  PATH: [path.join(sdk, "platform-tools"), path.join(sdk, "emulator"), process.env.PATH].join(
    path.delimiter
  ),
  MOBILOOP_TEST_DEVICE: "emulator-5554",
  MOBILOOP_TEST_FIXTURES: "android-kotlin-login-demo",
  MOBILOOP_TEST_DISMISS_KEYBOARD: "1",
  MOBILOOP_TEST_SLOW_HOST: win ? "1" : "0",
  APPIUM_SERVER_URL: "http://127.0.0.1:4725",
  MOBILOOP_WORKSPACE_ROOT: path.join(
    repo,
    "examples",
    "mobile-fixtures",
    "android-kotlin-login-demo"
  ),
  MOBILOOP_ARTIFACTS_DIR: path.join(repo, ".mobiloop")
};
const children = [];
function start(command, args, label) {
  const fd = openSync(path.join(logs, `${label}.log`), "w");
  const child = spawn(command, args, { cwd: repo, env, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  child.on("error", (error) => {
    child.launchError = error;
  });
  children.push(child);
  return child;
}
function run(command, args, timeout = 180_000) {
  const result = spawnSync(command, args, {
    cwd: repo,
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command}: ${result.stderr?.slice(-8000)} ${result.stdout?.slice(-4000)}`);
  return result.stdout;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(child, check, timeout, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child.launchError) throw child.launchError;
    if (child.exitCode !== null)
      throw new Error(`${label} exited ${child.exitCode}; inspect ${logs}`);
    if (await check()) return;
    await sleep(3000);
  }
  throw new Error(`${label} readiness timed out; inspect ${logs}`);
}
function packageReadiness() {
  let successes = 0;
  return async () => {
    try {
      const packages = run(
        adb,
        [
          "-s",
          env.MOBILOOP_TEST_DEVICE,
          "shell",
          "cmd",
          "package",
          "list",
          "packages",
          "--show-versioncode"
        ],
        20_000
      );
      const users = run(adb, ["-s", env.MOBILOOP_TEST_DEVICE, "shell", "dumpsys", "user"], 20_000);
      successes = hasReadyAndroidServices(packages, users) ? successes + 1 : 0;
    } catch {
      successes = 0;
    }
    return successes >= 3;
  };
}
try {
  const vm = start(
    emulator,
    [
      "-avd",
      "Mobiloop_CI",
      "-port",
      "5554",
      "-no-window",
      "-no-audio",
      "-no-boot-anim",
      "-no-snapshot",
      "-feature",
      "-Vulkan",
      "-gpu",
      "swiftshader_indirect",
      "-accel",
      runtime.acceleration,
      "-memory",
      runtime.acceleration === "off" ? "1536" : "2048",
      "-cores",
      runtime.acceleration === "off" ? "1" : "2"
    ],
    "emulator"
  );
  await waitUntil(
    vm,
    async () => {
      try {
        return (
          run(
            adb,
            ["-s", env.MOBILOOP_TEST_DEVICE, "shell", "getprop", "sys.boot_completed"],
            15_000
          ).trim() === "1"
        );
      } catch {
        return false;
      }
    },
    win ? 18 * 60_000 : 8 * 60_000,
    "Android emulator"
  );
  console.log(`Android kernel boot complete on ${process.platform}`);
  await waitUntil(vm, packageReadiness(), 180_000, "Android package manager before driver startup");
  console.log("Android package manager stable before driver startup");
  const appium = start(
    process.execPath,
    [
      path.join(repo, ".mobiloop", "appium", "node_modules", "appium", "index.js"),
      "--address",
      "127.0.0.1",
      "--port",
      "4725",
      "--log-level",
      win ? "debug" : "warn"
    ],
    "appium"
  );
  await waitUntil(
    appium,
    async () => {
      try {
        const response = await fetch(`${env.APPIUM_SERVER_URL}/status`, {
          signal: AbortSignal.timeout(3000)
        });
        return response.ok && (await response.json()).value?.ready === true;
      } catch {
        return false;
      }
    },
    60_000,
    "Appium"
  );
  console.log(
    run(process.execPath, [
      "dist/src/cli.js",
      "call",
      "device.install_app",
      JSON.stringify({
        serial: env.MOBILOOP_TEST_DEVICE,
        apkPath: path.join(
          env.MOBILOOP_WORKSPACE_ROOT,
          "app",
          "build",
          "outputs",
          "apk",
          "debug",
          "app-debug.apk"
        ),
        approval: {
          approved: true,
          approvedBy: "hosted-ci",
          reason: "Install only the dedicated demo on the disposable CI emulator"
        }
      })
    ])
  );
  await waitUntil(vm, packageReadiness(), 180_000, "Android package manager after fixture install");
  console.log("Android package manager stable after fixture install");
  const tests = spawn(process.execPath, ["scripts/test-mobile-qa-device.mjs"], {
    cwd: repo,
    env,
    stdio: "inherit"
  });
  children.push(tests);
  const code = await new Promise((resolve, reject) => {
    tests.on("error", reject);
    tests.on("close", resolve);
  });
  if (code !== 0) throw new Error(`Device suite exited ${code}`);
} catch (error) {
  for (const [label, args] of [
    ["device-state", ["get-state"]],
    ["logcat-failure", ["logcat", "-d", "-t", "2000"]],
    ["uiautomator-package", ["shell", "dumpsys", "package", "io.appium.uiautomator2.server"]]
  ]) {
    const diagnostic = spawnSync(adb, ["-s", env.MOBILOOP_TEST_DEVICE, ...args], {
      cwd: repo,
      env,
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024
    });
    await fs.writeFile(
      path.join(logs, `${label}.log`),
      `${diagnostic.stdout ?? ""}\n${diagnostic.stderr ?? ""}\n${diagnostic.error?.message ?? ""}`
    );
  }
  throw error;
} finally {
  for (const child of children.reverse()) {
    if (child.exitCode !== null || !child.pid) continue;
    const closed = new Promise((resolve) => child.once("close", resolve));
    if (win) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
    await Promise.race([closed, sleep(5000)]);
    if (child.exitCode === null && !win) child.kill("SIGKILL");
  }
}
