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
| `build.collect_build_logs`      | Read build logs from `.mobiloop/build`.                        | `read`      | No                            |

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

| Tool                                       | Purpose                                           |
| ------------------------------------------ | ------------------------------------------------- |
| `flow.analyze_from_code`                   | Static source-flow discovery.                     |
| `flow.generate_test_scenarios`             | AI-ready scenario candidates from source.         |
| `flow.run_script`                          | High-level flow DSL runner.                       |
| `flow.record_checkpoint`                   | Persist a stable runtime checkpoint.              |
| `flow.record_test_run`                     | Mark a checkpoint path as passed or failed.       |
| `flow.plan_replay`                         | Plan replay to a checkpoint without executing.    |
| `flow.replay_to_checkpoint`                | Replay remembered semantic actions.               |
| `flow.read_memory`, `flow.clear_memory`    | Inspect or reset flow memory.                     |
| `loop.record_iteration`                    | Append structured loop iteration JSONL.           |
| `loop.read_iterations`                     | Read loop history.                                |
| `loop.generate_report`                     | Generate Markdown report.                         |
| `ci.collect_artifact_manifest`             | Build CI artifact manifest.                       |
| `ci.write_github_step_summary`             | Write GitHub step summary.                        |
| `ci.comment_pr`                            | Comment on a PR.                                  |
| `ci.create_github_annotations`             | Create GitHub annotation JSON.                    |
| `orchestrator.run_android_validation_loop` | Bounded Android build-install-Appium-verify loop. |
