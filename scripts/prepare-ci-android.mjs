import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";

if (process.env.CI !== "true") throw new Error("Use only on disposable CI VMs");
const repo = fileURLToPath(new URL("../", import.meta.url));
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error("Android SDK is required");
const avdHome = path.join(repo, ".mobiloop", "ci-avd");
await fs.mkdir(avdHome, { recursive: true });
process.env.ANDROID_AVD_HOME = avdHome;
const directories = await fs.readdir(path.join(sdk, "cmdline-tools"));
const version = directories.includes("latest")
  ? "latest"
  : directories.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
const suffix = process.platform === "win32" ? ".bat" : "";
const sdkTool = (name) => path.join(sdk, "cmdline-tools", version, "bin", `${name}${suffix}`);
function run(command, args, options = {}) {
  const result = spawn.sync(command, args, {
    cwd: repo,
    stdio: "inherit",
    timeout: 15 * 60_000,
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
// Reuse the hosted runner's emulator rather than downloading an unrelated newer revision.
const packages = [
  "platform-tools",
  "platforms;android-35",
  "build-tools;35.0.0",
  "system-images;android-35;google_apis;x86_64"
];
try {
  await fs.access(
    path.join(sdk, "emulator", `emulator${process.platform === "win32" ? ".exe" : ""}`)
  );
} catch {
  packages.push("emulator");
}
run(sdkTool("sdkmanager"), packages);
run(
  sdkTool("avdmanager"),
  [
    "create",
    "avd",
    "--name",
    "Mobiloop_CI",
    "--package",
    "system-images;android-35;google_apis;x86_64"
  ],
  { stdio: ["pipe", "inherit", "inherit"], input: "no\n" }
);
await fs.access(path.join(avdHome, "Mobiloop_CI.ini"));
run(
  process.execPath,
  [
    "dist/src/cli.js",
    "call",
    "build.build_debug_apk",
    JSON.stringify({
      kind: "android",
      approval: {
        approved: true,
        approvedBy: "hosted-ci",
        reason: "Build only the native demo from this revision on a disposable CI VM"
      }
    })
  ],
  {
    env: {
      ...process.env,
      MOBILOOP_WORKSPACE_ROOT: path.join(
        repo,
        "examples",
        "mobile-fixtures",
        "android-kotlin-login-demo"
      ),
      MOBILOOP_ARTIFACTS_DIR: path.join(repo, ".mobiloop")
    }
  }
);
