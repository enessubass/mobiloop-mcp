# Flutter Quickstart

Use a local test app and synthetic accounts. Do not start with production data. MobiLoop executes guarded tools; the agent selects scenarios and fixes confirmed problems.

## 1. Prepare Only The Target Platform

Run `flutter doctor -v`. Android needs Android SDK platform-tools, a compatible JDK, and an emulator visible in `adb devices -l`. An already-running Genymotion VM is supported. iOS needs macOS, full Xcode, a simulator runtime, and `xcrun simctl list devices available`.

If macOS selects Command Line Tools instead of full Xcode, set `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` for the setup, agent, Flutter, and Appium processes. This does not require changing global `xcode-select`. For Android Studio's bundled JDK, set `JAVA_HOME` and add its `bin` directory to `PATH`.

Use a locally installed Appium with a compatible platform driver. Install only the driver you need:

```bash
npx appium driver install uiautomator2
```

On macOS for iOS, use `npx appium driver install xcuitest` instead. Then start Appium on loopback:

```bash
npx appium --address 127.0.0.1 --port 4723
```

The agent's `env.ensure_appium` tool can assist with driver installation/startup after actual authorization. It is not permission to install platform SDKs silently. `doctor` never starts or installs anything.

## 2. Configure MCP And The Skill

From a stable MobiLoop source checkout:

```bash
npm ci
npm run build
node dist/src/cli.js setup --workspace /absolute/path/to/flutter/app --client codex --yes
node dist/src/cli.js doctor --workspace /absolute/path/to/flutter/app --target android
```

Choose `claude`, `cursor`, or `vscode` for those agents. For iOS, choose `--target ios`; also run `--target flutter` to check the framework. See [installation](INSTALLATION.md) for Windows/PowerShell commands, previews, backups, and existing configuration.

Setup adds only project-local configuration and the bundled skill, preserving other MCP servers. Reload the agent, trust the reviewed project MCP configuration in the client, and confirm that MobiLoop tools are visible. A successful setup is not a passing device test.

## 3. Ask The Agent To Execute A Bounded Test

```text
Use mobiloop-mobile-qa on this Flutter test app and my selected emulator.
Test invalid email, short password, and successful navigation using synthetic
test data. I authorize building and installing this test app, interacting
with it, and making focused fixes for confirmed failures. Preserve app data,
do not publish or deploy, rerun affected checks, and return the evidence.
```

The agent should read policies, preflight the platform and framework, select the explicit device, scan source, generate/refine scenarios, execute assertions, inspect failures, fix within scope, rebuild, and retest. Missing SDKs, accounts, or backend dependencies must be reported rather than marked passed.

## 4. Manual CLI Alternative

The reusable payloads are [Android](../examples/android-validation-loop.json) and [iOS](../examples/flutter-ios-validation-loop.json). Adapt the app id, device/UDID, locators, expected text, and actual authorization before use. They are templates, not universal login scripts.

Run the CLI from the mobile app directory, or set `MOBILOOP_WORKSPACE_ROOT`. A JSON file avoids platform-dependent shell quoting:

```bash
node /absolute/path/to/mobiloop-mcp/dist/src/cli.js call orchestrator.run_android_validation_loop --file /absolute/path/to/approved-android-plan.json
```

For iOS, use `orchestrator.run_ios_validation_loop` and the adapted iOS payload. Its build must target the same selected simulator/UDID as the Appium session. Provide the simulator's actual `appium:platformVersion` when known. Apple Silicon projects can use `buildSettings` with `ARCHS: arm64` and `EXCLUDED_ARCHS: ""` when their dependencies support that simulator architecture.

The examples preserve data with `clearAppData: false` on Android and `appium:noReset: true` on both platforms. A fresh deterministic test state must come from fixture design or a separately authorized reset, not an implicit data wipe. Building/installing and entering test data still require consent.

An `approval` object represents permission already given by the real user or CI owner. Never manufacture it to bypass a rejection; keep secure mode enabled.

## 5. Inspect Evidence

Set a fresh `MOBILOOP_RUN_ID` for each run when useful. Evidence lives under `.mobiloop/runs/<runId>/`, otherwise under `.mobiloop/`. Inspect build logs, assertions, screenshots, page source, platform logs, iteration records, and the final Markdown report.

Generated scenarios and static source findings are not executed device tests. Reports must distinguish passing, failing, blocked, and unexecuted checks. Keep screenshots/logs private unless sharing is explicitly authorized; text redaction does not remove personal data from screenshots.
