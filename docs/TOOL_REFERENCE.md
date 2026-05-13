# Tool Reference

This document describes the public MCP surface at a product-contract level. The machine-readable source of truth is available through:

```bash
mobiloop list-tools --json
```

Each tool includes a `policy` block with risk metadata:

```json
{
  "riskLevel": "read | write | device | network | git | dangerous",
  "requiresApproval": true,
  "allowedInCi": false,
  "allowedInInteractive": true,
  "writesWorkspace": true,
  "writesDevice": false,
  "networkAccess": false,
  "producesArtifacts": false,
  "approvalReason": "Why an agent should ask first"
}
```

MCP clients should use this metadata to decide when to ask for human approval. MobiLoop still enforces path, branch, timeout, output, and API allowlist controls internally.

When `requireApproval` or `MOBILOOP_REQUIRE_APPROVAL=true` is enabled, the server also enforces this metadata before calling high-impact handlers.

## Code Tools

| Tool                  | Purpose                                             | Main Risk | Approval |
| --------------------- | --------------------------------------------------- | --------- | -------- |
| `code.read_file`      | Read a workspace file.                              | `read`    | No       |
| `code.search_code`    | Search workspace source with guarded path handling. | `read`    | No       |
| `code.apply_patch`    | Apply a unified diff inside `workspaceRoot`.        | `write`   | Yes      |
| `code.git_diff`       | Return current diff.                                | `read`    | No       |
| `code.create_branch`  | Create a branch matching `allowedBranchPattern`.    | `git`     | Yes      |
| `code.commit_changes` | Commit staged changes on an allowed branch.         | `git`     | Yes      |
| `code.open_pr`        | Open a pull request through `gh`.                   | `network` | Yes      |

Failure cases include path escape, forbidden path match, invalid branch pattern, and failed patch validation.

## Environment Tools

| Tool                       | Purpose                                                                      | Main Risk | Approval          |
| -------------------------- | ---------------------------------------------------------------------------- | --------- | ----------------- |
| `env.preflight`            | Check host tooling for Android, iOS, Flutter, React Native, Appium, and Git. | `read`    | No                |
| `env.compatibility_matrix` | Explain host/tool requirements per workflow.                                 | `read`    | No                |
| `env.ensure_appium`        | Check, install driver, or start Appium when requested.                       | `network` | Context dependent |

`env.ensure_appium` can install Appium drivers and start a long-running process. Use approval before `installDriver` or `startServer` in interactive environments.

## Build Tools

| Tool                            | Purpose                                                        | Main Risk   | Approval                      |
| ------------------------------- | -------------------------------------------------------------- | ----------- | ----------------------------- |
| `build.detect_project`          | Detect Flutter, React Native, Android Gradle, or iOS projects. | `read`      | No                            |
| `build.install_dependencies`    | Run package/dependency install for the detected project.       | `network`   | Yes                           |
| `build.run_lint`                | Run framework lint/analyze command.                            | `read`      | Usually no                    |
| `build.run_unit_tests`          | Run unit tests.                                                | `read`      | Usually no                    |
| `build.build_debug_apk`         | Build Android debug APK.                                       | `write`     | Usually no in CI, ask locally |
| `build.build_release_candidate` | Build release-candidate artifacts.                             | `dangerous` | Yes                           |
| `build.collect_build_logs`      | Read build logs from the current artifact root.                | `read`      | No                            |

## Device And iOS Tools

Device tools mutate emulator, simulator, or physical device state. Use approval for install, uninstall, clear-data, permission grant, boot, shutdown, and launch actions.

| Group          | Read Tools                                                             | Mutating Tools                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android device | `device.list_devices`, `device.capture_screenshot`, `device.pull_logs` | `device.start_emulator`, `device.stop_emulator`, `device.install_app`, `device.uninstall_app`, `device.clear_app_data`, `device.grant_permissions` |
| iOS simulator  | `ios.list_simulators`, `ios.capture_screenshot`, `ios.collect_logs`    | `ios.boot_simulator`, `ios.shutdown_simulator`, `ios.build_app`, `ios.install_app`, `ios.launch_app`                                               |

## Appium Tools

| Tool                                                                            | Purpose                                                  | Notes                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `appium.create_session`                                                         | Create a WebDriver session.                              | Requires Appium server and platform driver.                               |
| `appium.delete_session`                                                         | End a session.                                           | Safe cleanup.                                                             |
| `appium.observe_screen`                                                         | Capture screenshot/source and optional wait conditions.  | Supports `waitForAnyText`, `waitForPackageIdle`, and stable source waits. |
| `appium.tap_by_text`                                                            | Tap exact-first text match.                              | Returns the selected target.                                              |
| `appium.tap_by_accessibility_id`                                                | Tap by accessibility id.                                 | Preferred locator.                                                        |
| `appium.tap_by_resource_id`                                                     | Tap by Android resource id.                              | Preferred locator.                                                        |
| `appium.tap_coordinates`                                                        | Tap coordinates.                                         | Last resort; approval recommended.                                        |
| `appium.type_text`                                                              | Type text with `sendKeys`, `setValue`, or `adbKeyboard`. | Flutter defaults should prefer `sendKeys`.                                |
| `appium.swipe`, `appium.go_back`                                                | Navigate the app.                                        | Device state mutation.                                                    |
| `appium.wait_for_visible`, `appium.assert_visible`, `appium.assert_not_visible` | Visibility checks.                                       | Evidence-friendly assertions.                                             |

## Verification Tools

Verification tools should produce evidence instead of model claims.

| Tool                                   | Evidence                                          |
| -------------------------------------- | ------------------------------------------------- |
| `verify.assert_screen_contains_text`   | Appium page source and matched text.              |
| `verify.assert_no_crash_in_logcat`     | Logcat artifact and root-cause classification.    |
| `verify.assert_appium_session_healthy` | Session status and automation failure separation. |
| `verify.assert_api_response`           | Response status/body with allowlist enforcement.  |
| `verify.collect_evidence`              | Unified screenshot/source/log evidence object.    |
| `verify.assert_navigation_reached`     | Route/screen text assertion.                      |
| `verify.assert_accessibility_labels`   | Missing accessibility labels.                     |
| `verify.assert_screenshot_diff`        | Pixel comparison result.                          |
| `verify.assert_sqlite_query`           | Read-only SQLite query result.                    |
| `verify.hash_artifact`                 | Hash for report integrity.                        |

## Flow, Loop, CI, And Orchestrator

| Tool                                       | Purpose                                                 |
| ------------------------------------------ | ------------------------------------------------------- |
| `flow.analyze_from_code`                   | Static source-flow discovery.                           |
| `flow.generate_test_scenarios`             | AI-ready scenario candidates from source.               |
| `flow.run_script`                          | High-level flow DSL runner.                             |
| `flow.record_checkpoint`                   | Persist a stable runtime checkpoint.                    |
| `flow.record_test_run`                     | Mark a checkpoint path as passed or failed.             |
| `flow.plan_replay`                         | Plan replay to a checkpoint without executing.          |
| `flow.replay_to_checkpoint`                | Replay remembered semantic actions.                     |
| `flow.read_memory`, `flow.clear_memory`    | Inspect or reset flow memory.                           |
| `loop.record_iteration`                    | Append structured loop iteration JSONL.                 |
| `loop.read_iterations`                     | Read loop history.                                      |
| `loop.generate_report`                     | Generate Markdown report.                               |
| `ci.collect_artifact_manifest`             | Build CI artifact manifest.                             |
| `ci.write_github_step_summary`             | Write GitHub step summary.                              |
| `ci.comment_pr`                            | Comment on a PR.                                        |
| `ci.create_github_annotations`             | Create GitHub annotation JSON.                          |
| `orchestrator.run_android_validation_loop` | Bounded Android build-install-Appium-verify loop.       |
| `orchestrator.run_ios_validation_loop`     | Bounded iOS simulator build-install-Appium-verify loop. |

## Critical Tool Contracts

### `appium.tap_by_text`

Input:

```json
{
  "sessionId": "string",
  "serverUrl": "string optional",
  "text": "string",
  "matchMode": "auto | exact | contains"
}
```

Output:

```json
{
  "tapped": true,
  "sessionId": "APPIUM_SESSION_ID",
  "text": "Giriş Yap",
  "target": {
    "elementId": "element-id",
    "matchType": "exact:content-desc:clickable",
    "matchedAttribute": "content-desc",
    "matchedText": "Giriş Yap"
  }
}
```

Failure cases: session not reachable, text not visible, Appium element lookup failure, click failure.

### `flow.run_script`

Input:

```json
{
  "sessionId": "string",
  "serverUrl": "string optional",
  "testName": "login-smoke",
  "stopOnFailure": true,
  "steps": [
    { "action": "waitText", "text": "Giriş Yap" },
    { "action": "tapText", "text": "Giriş Yap", "matchMode": "exact" },
    { "action": "assertText", "text": "Ana Sayfa" },
    { "action": "collectEvidence", "label": "login-result" }
  ]
}
```

Output:

```json
{
  "passed": true,
  "sessionId": "APPIUM_SESSION_ID",
  "executed": [{ "index": 0, "passed": true }],
  "evidence": [{ "label": "login-result", "screenshotPath": "...", "sourcePath": "..." }]
}
```

Failure cases: unsupported action, missing locator/text, visibility timeout, assertion failure, evidence collection failure.

### `verify.collect_evidence`

Input:

```json
{
  "sessionId": "string optional",
  "serverUrl": "string optional",
  "serial": "string optional",
  "packageName": "string optional",
  "prefix": "login-result"
}
```

Output:

```json
{
  "evidence": {
    "label": "login-result",
    "timestamp": "ISO-8601",
    "screenshotPath": ".mobiloop/screenshots/...",
    "sourcePath": ".mobiloop/sources/...",
    "logPath": ".mobiloop/logs/..."
  },
  "status": "passed | app_bug | automation_error | environment_missing | remote_rules_not_deployed | test_data_missing | external_dependency | unknown_failure",
  "likelyRootCause": "string",
  "nextSuggestedAction": "string"
}
```

Text artifacts and MCP/CLI text responses are redacted when `redactArtifacts` is enabled.

### `orchestrator.run_android_validation_loop`

Input:

```json
{
  "goal": "Validate login flow",
  "kind": "flutter",
  "apkPath": "build/app/outputs/flutter-apk/app-debug.apk",
  "packageName": "com.example.app",
  "runLint": false,
  "runUnitTests": false,
  "buildDebugApk": false,
  "appiumCapabilities": {
    "platformName": "Android",
    "appium:automationName": "UiAutomator2"
  },
  "appiumSteps": [
    {
      "tool": "appium.wait_for_visible",
      "args": { "locator": { "strategy": "text", "value": "Login" } }
    }
  ],
  "expectedTexts": ["Home"],
  "approval": {
    "approved": true,
    "approvedBy": "human-or-ci",
    "reason": "Run Android validation on emulator"
  }
}
```

Output:

```json
{
  "passed": true,
  "status": "passed",
  "iterations": [],
  "likelyRootCause": "",
  "nextSuggestedAction": "",
  "blockingExternalDependency": false,
  "durationMs": 12345
}
```

Failure cases: build failure, APK not found, install failure, Appium session failure, failed assertion, classified external dependency.

### `orchestrator.run_ios_validation_loop`

Input:

```json
{
  "goal": "Validate login flow on iOS",
  "kind": "flutter",
  "workspace": "ios/Runner.xcworkspace",
  "scheme": "Runner",
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
  "appiumCapabilities": {
    "platformName": "iOS",
    "appium:automationName": "XCUITest",
    "appium:deviceName": "iPhone 15",
    "appium:bundleId": "com.example.app"
  },
  "appiumSteps": [
    {
      "tool": "appium.wait_for_visible",
      "args": { "locator": { "strategy": "text", "value": "Login" } }
    }
  ],
  "expectedTexts": ["Home"],
  "approval": {
    "approved": true,
    "approvedBy": "human-or-ci",
    "reason": "Run iOS validation on simulator"
  }
}
```

Output:

```json
{
  "passed": true,
  "status": "passed",
  "iterations": [],
  "likelyRootCause": "",
  "nextSuggestedAction": "",
  "blockingExternalDependency": false,
  "durationMs": 12345
}
```

`buildSettings` is converted to `KEY=value` xcodebuild command-line settings. `xcodebuildArgs` can be used for additional explicit xcodebuild arguments when a host or project needs them.

Failure cases: `xcodebuild` failure, `.app` bundle not found, simulator boot/install/launch failure, Appium XCUITest session failure, failed assertion, missing Xcode/Appium/XCUITest host setup.
