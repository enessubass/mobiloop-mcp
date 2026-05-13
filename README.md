# MobiLoop MCP

Guarded MCP servers for agentic mobile development loops.

```text
code change -> build -> install on device -> Appium test -> evidence -> classify -> report
```

MobiLoop MCP is a controlled tool layer between an AI coding agent and a real mobile development environment. It lets an MCP client read and patch a mobile project, build it, install it on Android or iOS targets, drive the app through Appium, verify logs/screens/API results, remember known app-flow checkpoints, and produce evidence-based reports.

The name reflects the core contract: mobile work should run through a measurable loop of change, build, device execution, verification, and evidence-backed triage.

It is built for the workflow where the agent does not just write code. It builds, runs, tests, observes, classifies failures, and hands back evidence. An agent can still use the separate guarded code tools to patch and retest, but that patch step is intentionally outside the default orchestrator.

Today, MobiLoop provides guarded build-test-verify loops and evidence-based failure classification. Fully automated patch-and-retest is intentionally kept outside the default orchestrator until stricter approval, rollback, and review controls are enabled.

## Highlights

- **Evidence-first mobile loops**: build logs, screenshots, Appium XML source, logcat/simulator logs, API responses, screenshot diffs, and iteration records.
- **Android and iOS tool split**: Android `adb`/emulator tools and iOS `xcrun simctl`/`xcodebuild` tools are separated.
- **Appium UI automation**: semantic taps, typing, swipes, back navigation, visibility assertions, screenshots, and accessibility summaries.
- **Flow memory**: record runtime screen checkpoints, remember the latest passing path, and auto-replay stable setup steps to a target checkpoint.
- **Scenario generation and flow DSL**: scan source for candidate E2E scenarios, then run high-level JSON flows with wait/tap/type/assert/evidence steps.
- **Source-flow analysis**: scan Flutter, React Native, Android, and iOS source for screen, route, transition, and visible-text candidates.
- **Root-cause classification**: classify logcat evidence into app bugs, automation errors, missing environment, remote rules, and test-data issues.
- **Server-side approval gate**: optionally block high-impact tools unless input includes a valid approval payload.
- **Redaction by default**: redact common secrets, bearer tokens, API keys, emails, and phone numbers from text artifacts, command output, and MCP/CLI text responses.
- **Guarded code tools**: workspace-only reads/searches/patches, forbidden secret paths, guarded branches, commits, and PR creation.
- **Docker-ready MCP runtime**: package the Node MCP server in Docker while keeping mobile SDKs, emulators, devices, and Appium on the host or runner.
- **Composable binaries**: run everything as one server or split each responsibility into its own MCP server.

## What This Is

This project provides MCP tools for this architecture:

```text
AI / MCP client
  |
  v
MobiLoop MCP
  |
  |-- code tools
  |-- environment preflight
  |-- build tools
  |-- Android device tools
  |-- iOS simulator tools
  |-- Appium tools
  |-- verification tools
  |-- flow-memory replay tools
  |-- loop/report tools
  |-- CI publication tools
  |-- Android/iOS orchestrators
  |
  v
mobile repo + emulator/device + Appium + build toolchain
```

The server does not claim that a test passed because a model says so. A pass should be backed by tool output: command exit codes, screenshots, page source, log checks, API assertions, and recorded loop iterations.

## What This Is Not

- It is not a replacement for Android SDK, Xcode, Flutter, Gradle, React Native, Appium, or platform drivers.
- It is not a universal mobile emulator container. iOS simulator requires macOS, and Android emulator portability depends on host acceleration and device access.
- It is not an unrestricted shell bridge. Tools are structured and guarded.
- It is not a production deployer. Release signing, store upload, and production secrets remain outside the default scope.

## Requirements

Install only what your target app needs.

| Workflow             | Host                  | Required tools                                                                                        |
| -------------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| MCP runtime          | macOS, Linux, Windows | Node.js 20+                                                                                           |
| Android build/test   | macOS, Linux, Windows | Android SDK, `adb`, emulator or physical device, Java/Gradle as needed, Appium 2, UiAutomator2 driver |
| Flutter Android      | macOS, Linux, Windows | Flutter SDK, Android SDK, Appium for UI flows                                                         |
| React Native Android | macOS, Linux, Windows | Node/npm, Android Gradle toolchain, Android SDK, Appium                                               |
| iOS simulator        | macOS only            | Xcode, `xcrun simctl`, iOS Simulator, Appium 2, XCUITest driver                                       |
| Docker MCP runtime   | macOS, Linux, Windows | Docker, plus host-side mobile tools when driving devices                                              |

Start Appium before Appium or flow replay tools:

```bash
appium --address 127.0.0.1 --port 4723
```

Local Appium installs also work:

```bash
npx appium --address 127.0.0.1 --port 4723
```

For Android, make sure the Appium process can see:

```bash
export ANDROID_HOME=/absolute/path/to/android/sdk
export ANDROID_SDK_ROOT=/absolute/path/to/android/sdk
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

## Install From Source

```bash
npm ci
npm test
```

Run the all-in-one MCP server:

```bash
MOBILOOP_WORKSPACE_ROOT=/absolute/path/to/mobile/app \
node dist/src/index.js
```

For development:

```bash
npm run dev
```

## CLI Fallback

When an MCP client cannot expose the server as callable tools, use the CLI wrapper:

```bash
MOBILOOP_WORKSPACE_ROOT=/absolute/path/to/mobile/app \
node dist/src/cli.js list-tools
```

Inspect tool policy metadata:

```bash
MOBILOOP_WORKSPACE_ROOT=/absolute/path/to/mobile/app \
node dist/src/cli.js list-tools --json
```

The same metadata is available inside MCP through `policy.list_tools`.

Call any tool directly:

```bash
MOBILOOP_WORKSPACE_ROOT=/absolute/path/to/mobile/app \
node dist/src/cli.js call flow.generate_test_scenarios '{"goal":"login smoke and validation"}'
```

Generate scenario candidates:

```bash
MOBILOOP_WORKSPACE_ROOT=/absolute/path/to/mobile/app \
node dist/src/cli.js generate-scenarios "cover onboarding, login, and validation"
```

## MCP Client Configuration

### All-In-One Server

Use this for local development and simpler MCP clients.

```json
{
  "mcpServers": {
    "mobiloop": {
      "command": "node",
      "args": ["/absolute/path/to/mobiloop-mcp/dist/src/index.js"],
      "env": {
        "MOBILOOP_WORKSPACE_ROOT": "/absolute/path/to/mobile/app",
        "APPIUM_SERVER_URL": "http://127.0.0.1:4723"
      }
    }
  }
}
```

### Split Servers

Use split servers when you want tighter policy boundaries per responsibility.

```json
{
  "mcpServers": {
    "mobile-code": {
      "command": "node",
      "args": ["/absolute/path/to/mobiloop-mcp/dist/src/servers/code.js"],
      "env": {
        "MOBILOOP_WORKSPACE_ROOT": "/absolute/path/to/mobile/app"
      }
    },
    "mobile-build": {
      "command": "node",
      "args": ["/absolute/path/to/mobiloop-mcp/dist/src/servers/build.js"],
      "env": {
        "MOBILOOP_WORKSPACE_ROOT": "/absolute/path/to/mobile/app"
      }
    },
    "mobile-device": {
      "command": "node",
      "args": ["/absolute/path/to/mobiloop-mcp/dist/src/servers/device.js"],
      "env": {
        "MOBILOOP_WORKSPACE_ROOT": "/absolute/path/to/mobile/app"
      }
    },
    "mobile-appium": {
      "command": "node",
      "args": ["/absolute/path/to/mobiloop-mcp/dist/src/servers/appium.js"],
      "env": {
        "MOBILOOP_WORKSPACE_ROOT": "/absolute/path/to/mobile/app",
        "APPIUM_SERVER_URL": "http://127.0.0.1:4723"
      }
    },
    "mobile-flow": {
      "command": "node",
      "args": ["/absolute/path/to/mobiloop-mcp/dist/src/servers/flow.js"],
      "env": {
        "MOBILOOP_WORKSPACE_ROOT": "/absolute/path/to/mobile/app",
        "APPIUM_SERVER_URL": "http://127.0.0.1:4723"
      }
    },
    "mobile-verify": {
      "command": "node",
      "args": ["/absolute/path/to/mobiloop-mcp/dist/src/servers/verify.js"],
      "env": {
        "MOBILOOP_WORKSPACE_ROOT": "/absolute/path/to/mobile/app"
      }
    },
    "mobile-loop": {
      "command": "node",
      "args": ["/absolute/path/to/mobiloop-mcp/dist/src/servers/loop.js"],
      "env": {
        "MOBILOOP_WORKSPACE_ROOT": "/absolute/path/to/mobile/app"
      }
    }
  }
}
```

All binaries are listed below.

| Binary                      | Scope                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| `mobiloop`                  | CLI wrapper for listing tools, calling tools, and generating scenarios |
| `mobiloop-mcp`              | All tools                                                              |
| `mobiloop-code-mcp`         | Code and git tools                                                     |
| `mobiloop-env-mcp`          | Environment preflight and compatibility matrix                         |
| `mobiloop-build-mcp`        | Dependency, lint, test, and APK build tools                            |
| `mobiloop-device-mcp`       | Android `adb` and emulator tools                                       |
| `mobiloop-ios-mcp`          | iOS simulator and Xcode tools                                          |
| `mobiloop-appium-mcp`       | Appium UI automation tools                                             |
| `mobiloop-verify-mcp`       | Assertions and evidence collection                                     |
| `mobiloop-flow-mcp`         | Source-flow analysis and checkpoint replay                             |
| `mobiloop-loop-mcp`         | Iteration records and reports                                          |
| `mobiloop-ci-mcp`           | Artifact manifests, GitHub summaries, PR comments                      |
| `mobiloop-orchestrator-mcp` | Android and iOS build-install-test-verify loops                        |

## Configuration

Copy the example if you want file-based config:

```bash
cp mobiloop.config.example.json mobiloop.config.json
```

Or point to it explicitly:

```bash
export MOBILOOP_CONFIG=/absolute/path/to/mobiloop.config.json
```

`AGENTIC_MOBILE_MCP_CONFIG` and `AGENTIC_MOBILE_WORKSPACE_ROOT` are still accepted as legacy fallbacks, but new projects should use the `MOBILOOP_*` names.

Common fields:

| Field                  | Default                         | Purpose                                                               |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------- |
| `workspaceRoot`        | current working directory       | Mobile app workspace the MCP server may access                        |
| `artifactsDir`         | `.mobiloop`                     | Evidence, logs, screenshots, reports, flow memory                     |
| `runId`                | unset                           | Optional run identifier; writes artifacts under `.mobiloop/runs/<id>` |
| `maxCommandMs`         | `120000`                        | Default command timeout                                               |
| `maxOutputBytes`       | `1048576`                       | Output cap for command tools                                          |
| `maxFixAttempts`       | `3`                             | Suggested fix-loop limit                                              |
| `maxTestIterations`    | `5`                             | Orchestrator loop limit                                               |
| `maxRuntimeMinutes`    | `30`                            | Suggested total runtime limit                                         |
| `allowedBranchPattern` | `^feature/ai-[A-Za-z0-9._/-]+$` | Branches where commit tools are allowed                               |
| `appiumServerUrl`      | `http://127.0.0.1:4723`         | Appium server endpoint                                                |
| `adbPath`              | `adb`                           | Android Debug Bridge path                                             |
| `emulatorPath`         | `emulator`                      | Android emulator CLI path                                             |
| `xcrunPath`            | `xcrun`                         | iOS simulator CLI path                                                |
| `xcodebuildPath`       | `xcodebuild`                    | Xcode build CLI path                                                  |
| `sqlitePath`           | `sqlite3`                       | SQLite CLI path for read-only assertions                              |
| `apiAllowlist`         | localhost only                  | URLs allowed for API verification                                     |
| `forbiddenPathGlobs`   | secret-like defaults            | Files blocked from read/write operations                              |
| `toolPolicies`         | built-in defaults               | Per-tool risk and approval metadata overrides                         |
| `requireApproval`      | `false`                         | Require approval payloads for high-impact tools                       |
| `redactArtifacts`      | `true`                          | Redact common secrets and PII from text artifacts and text responses  |

Environment variables override selected fields:

```bash
export MOBILOOP_WORKSPACE_ROOT=/absolute/path/to/mobile/app
export APPIUM_SERVER_URL=http://127.0.0.1:4723
export MOBILOOP_RUN_ID=local-login-smoke
export MOBILOOP_REQUIRE_APPROVAL=true
```

The config schema is available at [schema/mobiloop.config.schema.json](schema/mobiloop.config.schema.json). See [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

Approval payloads use this shape:

```json
{
  "approval": {
    "approved": true,
    "approvedBy": "human-or-ci",
    "reason": "Run Android validation on emulator",
    "expiresAt": "2026-05-11T12:00:00Z"
  }
}
```

## Recommended First Run

1. Start an emulator or connect a device.
2. Start Appium.
3. Point `MOBILOOP_WORKSPACE_ROOT` at your mobile app.
4. Run `env.preflight`.
5. Run `flow.analyze_from_code`.
6. Run build/lint/unit tests.
7. Install the app on the device.
8. Create an Appium session.
9. Drive and verify one small user flow.
10. Collect evidence and generate a report.

For a Flutter Android app, the rough tool sequence is:

```text
env.preflight { "target": "flutter" }
flow.analyze_from_code
build.detect_project
build.install_dependencies
build.run_lint
build.run_unit_tests
build.build_debug_apk
device.list_devices
device.install_app
appium.create_session
appium.wait_for_visible
appium.tap_by_text
verify.assert_no_crash_in_logcat
verify.collect_evidence
loop.record_iteration
loop.generate_report
```

## Android Orchestrator

`orchestrator.run_android_validation_loop` runs a bounded Android loop across build, install, Appium, verification, evidence, and iteration records.

Minimal shape:

```json
{
  "goal": "Build and verify login flow on Android.",
  "kind": "flutter",
  "packageName": "com.example.app",
  "serial": "emulator-5554",
  "runLint": true,
  "runUnitTests": true,
  "buildDebugApk": true,
  "clearAppData": true,
  "collectEvidence": true,
  "maxTestIterations": 3,
  "appiumCapabilities": {
    "platformName": "Android",
    "appium:automationName": "UiAutomator2",
    "appium:deviceName": "Android Emulator",
    "appium:udid": "emulator-5554",
    "appium:appPackage": "com.example.app",
    "appium:appActivity": ".MainActivity",
    "appium:noReset": false
  },
  "appiumSteps": [
    {
      "tool": "appium.wait_for_visible",
      "args": {
        "locator": { "strategy": "text", "value": "Login" },
        "timeoutMs": 10000
      }
    }
  ],
  "expectedTexts": ["Home"]
}
```

See [examples/android-validation-loop.json](examples/android-validation-loop.json).

## iOS Orchestrator

`orchestrator.run_ios_validation_loop` runs a bounded iOS simulator loop across `xcodebuild`, simulator boot, app install/launch, Appium XCUITest, verification, evidence, and iteration records.

Minimal Flutter shape:

```json
{
  "goal": "Build and verify login flow on iOS.",
  "kind": "flutter",
  "workspace": "ios/Runner.xcworkspace",
  "scheme": "Runner",
  "configuration": "Debug",
  "sdk": "iphonesimulator",
  "destination": "platform=iOS Simulator,name=iPhone 15",
  "buildSettings": {
    "ARCHS": "arm64",
    "EXCLUDED_ARCHS": ""
  },
  "simulatorDevice": "iPhone 15",
  "bundleId": "com.example.app",
  "runLint": true,
  "runUnitTests": true,
  "buildIosApp": true,
  "bootSimulator": true,
  "installApp": true,
  "launchApp": true,
  "collectEvidence": true,
  "maxTestIterations": 2,
  "appiumCapabilities": {
    "platformName": "iOS",
    "appium:automationName": "XCUITest",
    "appium:deviceName": "iPhone 15",
    "appium:bundleId": "com.example.app",
    "appium:noReset": false
  },
  "appiumSteps": [
    {
      "tool": "appium.wait_for_visible",
      "args": {
        "locator": { "strategy": "text", "value": "Login" },
        "timeoutMs": 15000
      }
    }
  ],
  "expectedTexts": ["Home"]
}
```

See [examples/flutter-ios-validation-loop.json](examples/flutter-ios-validation-loop.json) and [docs/QUICKSTART_FLUTTER.md](docs/QUICKSTART_FLUTTER.md).

`buildSettings` and `xcodebuildArgs` are forwarded to `ios.build_app`, so projects can handle host-specific simulator requirements such as Apple Silicon arm64 simulator builds or custom DerivedData settings without leaving the MCP loop.

## AI-Generated Scenario Candidates

MobiLoop can generate candidate E2E scenarios from the app source so the agent starts from a concrete test plan instead of an empty screen.

```json
{
  "tool": "flow.generate_test_scenarios",
  "args": {
    "goal": "cover onboarding, login, form validation, and main navigation",
    "maxScenarios": 8,
    "includeNegativeCases": true
  }
}
```

The output includes priorities, candidate steps, assertions, source references, and limitations. Treat these as executable candidates: the agent should run them through Appium, collect evidence, and refine them into stable checkpoint paths.

For scripted execution without writing custom client code:

```json
{
  "tool": "flow.run_script",
  "args": {
    "sessionId": "APPIUM_SESSION_ID",
    "steps": [
      { "action": "observe", "waitForAnyText": ["Giriş Yap", "Login"], "waitForPackageIdle": true },
      { "action": "tapText", "text": "Giriş Yap", "matchMode": "auto" },
      {
        "action": "type",
        "locator": { "strategy": "text", "value": "E-posta" },
        "text": "test@example.com",
        "mode": "sendKeys"
      },
      { "action": "assertText", "text": "Ana Sayfa" },
      { "action": "collectEvidence", "label": "login-result" }
    ]
  }
}
```

## Flow Memory And Auto-Replay

Flow memory makes repeated mobile tests faster without pretending that setup screens passed.

```text
current Appium source
  -> normalized screen signature
  -> match recorded checkpoint
  -> replay known semantic actions
  -> arrive at target checkpoint
  -> continue test-specific assertions
```

The screen signature is built from Appium page source:

- visible text
- accessibility labels and content descriptions
- resource ids
- class names
- clickable text

This data is persisted under:

```text
.mobiloop/flow/memory.json
```

With `runId` enabled, the same file lives under `.mobiloop/runs/<runId>/flow/memory.json`.

### Record Checkpoints

At a stable screen:

```json
{
  "testName": "onboarding-to-login",
  "name": "Onboarding 1",
  "order": 1,
  "sessionId": "APPIUM_SESSION_ID",
  "actionToNext": {
    "tool": "appium.tap_by_text",
    "args": {
      "text": "Next"
    }
  }
}
```

At the next screen:

```json
{
  "testName": "onboarding-to-login",
  "name": "Login",
  "order": 2,
  "sessionId": "APPIUM_SESSION_ID"
}
```

Record the passing path:

```json
{
  "testName": "onboarding-to-login",
  "status": "passed",
  "checkpointIds": ["onboarding-to-login-001-onboarding-1", "onboarding-to-login-002-login"]
}
```

### Replay Later

Plan without executing:

```json
{
  "sessionId": "APPIUM_SESSION_ID",
  "testName": "onboarding-to-login",
  "targetCheckpointId": "onboarding-to-login-002-login",
  "dryRun": true
}
```

Execute:

```json
{
  "sessionId": "APPIUM_SESSION_ID",
  "testName": "onboarding-to-login",
  "targetCheckpointId": "onboarding-to-login-002-login",
  "minimumScore": 0.55,
  "delayMs": 500
}
```

Supported replay actions:

- `appium.tap_by_text`
- `appium.tap_by_accessibility_id`
- `appium.tap_by_resource_id`
- `appium.tap_coordinates`
- `appium.type_text`
- `appium.swipe`
- `appium.go_back`
- `appium.wait_for_visible`
- `appium.assert_visible`

Prefer semantic actions. Coordinates should be the last fallback.

See [examples/flow-memory-replay.json](examples/flow-memory-replay.json).

## Docker

The recommended Docker model is:

```text
Docker container
  - Node runtime
  - compiled MCP server
  - git/ripgrep/sqlite helpers

Host or self-hosted runner
  - Android SDK
  - emulator or physical device
  - Appium server and drivers
  - Flutter / Gradle / React Native toolchain
  - Xcode and iOS Simulator on macOS
```

Build:

```bash
docker build -t mobiloop-mcp:local .
```

Published GHCR image:

```bash
docker pull ghcr.io/enessubass/mobiloop-mcp:latest
```

Run as an MCP stdio server:

```bash
docker run --rm -i \
  -e MOBILOOP_WORKSPACE_ROOT=/workspace \
  -e APPIUM_SERVER_URL=http://host.docker.internal:4723 \
  -v /absolute/path/to/mobile/app:/workspace \
  ghcr.io/enessubass/mobiloop-mcp:latest
```

On Linux, add:

```bash
--add-host=host.docker.internal:host-gateway
```

See [docs/DOCKER.md](docs/DOCKER.md).

## Safety Model

Defaults are intentionally conservative.

- File access is restricted to `workspaceRoot`.
- Secret-like paths are blocked.
- Commit tools only work on branches matching `feature/ai-*` by default.
- There is no generic shell execution tool.
- API checks are restricted by `apiAllowlist`.
- Evidence is written under `.mobiloop`.
- Runtime and output limits are enforced.

Default blocked paths include:

- `.env`, `.env.*`
- `*.keystore`, `*.jks`, `*.p12`
- `*.mobileprovision`
- `GoogleService-Info.plist`
- `google-services.json`
- paths containing `secret` or `credential`

MCP clients should still apply human approval for high-impact operations such as dependency installation, emulator launch, app install, commits, pushes, and PR creation.
MobiLoop exposes machine-readable policy metadata through `mobiloop list-tools --json`; see [docs/TOOL_REFERENCE.md](docs/TOOL_REFERENCE.md).

See [docs/SECURITY.md](docs/SECURITY.md).

## Artifacts

The default artifact directory is:

```text
.mobiloop
```

When `runId` or `MOBILOOP_RUN_ID` is set, artifact writers use a run-scoped root:

```text
.mobiloop/runs/<runId>
```

Typical contents:

| Directory      | Contents                                                |
| -------------- | ------------------------------------------------------- |
| `build/`       | dependency, lint, test, and APK build logs              |
| `screenshots/` | Appium or device screenshots                            |
| `sources/`     | Appium page source XML                                  |
| `logs/`        | device or simulator logs                                |
| `evidence/`    | combined verification artifacts                         |
| `flow/`        | source-flow analysis, checkpoint memory, replay records |
| `loop/`        | JSONL iteration records                                 |
| `reports/`     | Markdown final reports                                  |
| `ci/`          | CI manifests, summaries, annotations                    |

## Tool Groups

### Code

- `code.read_file`
- `code.search_code`
- `code.apply_patch`
- `code.git_diff`
- `code.create_branch`
- `code.commit_changes`
- `code.open_pr`

### Environment

- `env.preflight`
- `env.compatibility_matrix`
- `env.ensure_appium`

### Build

- `build.detect_project`
- `build.install_dependencies`
- `build.run_lint`
- `build.run_unit_tests`
- `build.build_debug_apk`
- `build.build_release_candidate`
- `build.collect_build_logs`

### Android Device

- `device.list_devices`
- `device.start_emulator`
- `device.stop_emulator`
- `device.install_app`
- `device.uninstall_app`
- `device.clear_app_data`
- `device.grant_permissions`
- `device.capture_screenshot`
- `device.pull_logs`

### iOS

- `ios.list_simulators`
- `ios.boot_simulator`
- `ios.shutdown_simulator`
- `ios.build_app`
- `ios.install_app`
- `ios.launch_app`
- `ios.capture_screenshot`
- `ios.collect_logs`

### Appium

- `appium.create_session`
- `appium.delete_session`
- `appium.observe_screen`
- `appium.get_page_source`
- `appium.get_accessibility_tree`
- `appium.tap_by_text`
- `appium.tap_by_accessibility_id`
- `appium.tap_by_resource_id`
- `appium.tap_coordinates`
- `appium.type_text`
- `appium.swipe`
- `appium.go_back`
- `appium.wait_for_visible`
- `appium.assert_visible`
- `appium.assert_not_visible`

### Verification

- `verify.assert_screen_contains_text`
- `verify.assert_no_crash_in_logcat`
- `verify.assert_appium_session_healthy`
- `verify.assert_api_response`
- `verify.collect_evidence`
- `verify.assert_navigation_reached`
- `verify.assert_accessibility_labels`
- `verify.assert_screenshot_diff`
- `verify.assert_sqlite_query`
- `verify.hash_artifact`

### Flow

- `flow.analyze_from_code`
- `flow.generate_test_scenarios`
- `flow.run_script`
- `flow.record_checkpoint`
- `flow.record_test_run`
- `flow.plan_replay`
- `flow.replay_to_checkpoint`
- `flow.read_memory`
- `flow.clear_memory`

### Loop

- `loop.record_iteration`
- `loop.read_iterations`
- `loop.generate_report`

### CI

- `ci.collect_artifact_manifest`
- `ci.write_github_step_summary`
- `ci.comment_pr`
- `ci.create_github_annotations`

### Policy

- `policy.list_tools`

### Orchestrator

- `orchestrator.run_android_validation_loop`
- `orchestrator.run_ios_validation_loop`

## Troubleshooting

### `env.preflight` says Appium is missing

Start Appium and make sure `APPIUM_SERVER_URL` points to it:

```bash
APPIUM_SERVER_URL=http://127.0.0.1:4723
```

`env.preflight` accepts either a reachable Appium server or a global `appium` command.

### Appium cannot find Android SDK

Start Appium with Android environment variables:

```bash
ANDROID_HOME=/absolute/path/to/android/sdk \
ANDROID_SDK_ROOT=/absolute/path/to/android/sdk \
PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH" \
appium --address 127.0.0.1 --port 4723
```

### Appium taps text but the screen does not move

Prefer accessibility ids or resource ids. If using text, this server first tries a clickable parent containing the text, then falls back to the text node. For custom Flutter or React Native widgets, add stable semantics/accessibility ids when possible.

### Flow replay matched the wrong screen

Use `flow.plan_replay` first. Raise `minimumScore`, record better checkpoints, and avoid checkpointing transient loading states.

### Docker cannot see the emulator or Appium

Run Appium on the host and point the container to it with `host.docker.internal`. On Linux, add `--add-host=host.docker.internal:host-gateway`.

### iOS does not work in Docker

iOS simulator workflows require macOS with Xcode. Run iOS tools directly on the macOS host or a macOS self-hosted runner.

### `npm pack --dry-run` fails with npm cache permissions

Use a clean cache:

```bash
npm_config_cache=/tmp/mobiloop-npm-cache npm pack --dry-run
```

## Development

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run pack:check
```

The Dockerfile also runs the test suite during image build.

## Project Files

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/ARCHITECTURE_DETAILED.md](docs/ARCHITECTURE_DETAILED.md)
- [docs/TOOL_REFERENCE.md](docs/TOOL_REFERENCE.md)
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md)
- [docs/AGENT_PROTOCOL.md](docs/AGENT_PROTOCOL.md)
- [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md)
- [docs/CI_CD.md](docs/CI_CD.md)
- [docs/SECURITY_THREAT_MODEL.md](docs/SECURITY_THREAT_MODEL.md)
- [docs/OPERATIONS.md](docs/OPERATIONS.md)
- [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md)
- [docs/TROUBLESHOOTING_DETAILED.md](docs/TROUBLESHOOTING_DETAILED.md)
- [docs/FLOW_MEMORY.md](docs/FLOW_MEMORY.md)
- [docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md)
- [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md)
- [docs/LIMITATIONS.md](docs/LIMITATIONS.md)
- [docs/EXAMPLES.md](docs/EXAMPLES.md)
- [docs/QUICKSTART_FLUTTER.md](docs/QUICKSTART_FLUTTER.md)
- [docs/DOCKER.md](docs/DOCKER.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/demo/flutter-login-loop.md](docs/demo/flutter-login-loop.md)
- [docs/releases/v0.1.0-alpha.1.md](docs/releases/v0.1.0-alpha.1.md)
- [docs/releases/v0.1.0-alpha.2.md](docs/releases/v0.1.0-alpha.2.md)
- [docs/releases/v0.1.0-alpha.3.md](docs/releases/v0.1.0-alpha.3.md)
- [docs/releases/v0.1.0-alpha.4.md](docs/releases/v0.1.0-alpha.4.md)
- [.github/workflows/android-fixture-e2e.yml](.github/workflows/android-fixture-e2e.yml)
- [examples/android-validation-loop.json](examples/android-validation-loop.json)
- [examples/flutter-ios-validation-loop.json](examples/flutter-ios-validation-loop.json)
- [examples/flow-memory-replay.json](examples/flow-memory-replay.json)
- [examples/github-actions-mobiloop.yml](examples/github-actions-mobiloop.yml)
- [examples/mobile-fixtures/flutter-login-demo](examples/mobile-fixtures/flutter-login-demo)
- [examples/mobile-fixtures/android-kotlin-login-demo](examples/mobile-fixtures/android-kotlin-login-demo)
- [examples/mobile-fixtures/react-native-login-demo](examples/mobile-fixtures/react-native-login-demo)
- [examples/artifacts/successful-loop-report.md](examples/artifacts/successful-loop-report.md)
- [examples/artifacts/real-runs/flutter-login-android](examples/artifacts/real-runs/flutter-login-android)
- [examples/artifacts/real-runs/native-android-login](examples/artifacts/real-runs/native-android-login)

## License

MIT. See [LICENSE](LICENSE).
