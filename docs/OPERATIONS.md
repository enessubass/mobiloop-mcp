# Operations Runbook

## First Run

1. Install package dependencies:

   ```bash
   npm ci
   npm run build
   ```

2. Point the MCP server at a real mobile app:

   ```bash
   export MOBILOOP_WORKSPACE_ROOT=/absolute/path/to/mobile/app
   ```

3. Start Appium:

   ```bash
   appium --address 127.0.0.1 --port 4723
   ```

4. Run `env.preflight` from the MCP client for the target:

   ```json
   { "target": "android" }
   ```

5. Fix required failures before running `orchestrator.run_android_validation_loop`.

6. Let MobiLoop generate candidate E2E scenarios when starting from a new app:

   ```json
   { "tool": "flow.generate_test_scenarios", "args": { "goal": "cover onboarding, login, validation, and main navigation" } }
   ```

7. Seed flow context when you want faster repeated runs:

   ```json
   { "tool": "flow.analyze_from_code", "args": { "maxFiles": 1000 } }
   ```

8. During a passing Appium path, record checkpoints with `flow.record_checkpoint`, then persist the ordered path with `flow.record_test_run`.

## Android Host Checklist

- Java installed and on `PATH`
- Android SDK installed
- `adb` on `PATH` or configured as `adbPath`
- `emulator` on `PATH` or configured as `emulatorPath`
- an AVD exists, or a physical device is connected
- Appium 2 installed
- Appium UiAutomator2 driver installed
- app framework SDK installed: Flutter, Gradle, or React Native dependencies

## iOS Host Checklist

- macOS host
- Xcode installed
- command line tools selected
- iOS Simulator runtime installed
- Appium 2 installed
- Appium XCUITest driver installed
- WebDriverAgent signing configured if using real devices

## Failure Triage

- Build failures: inspect `.mobiloop/build/*.log`
- Device failures: run `device.list_devices` and collect logcat
- Appium locator failures: run `appium.observe_screen` and inspect source XML
- Appium setup failures: run `env.ensure_appium` to check server reachability, install a driver, or start a detached server
- Appium session failures: run `verify.assert_appium_session_healthy` to separate automation failure from AUT failure
- Flow replay failures: run `flow.plan_replay` with `dryRun` first, inspect match score, then lower neither `minimumScore` nor checkpoint quality blindly
- Crash failures: run `verify.assert_no_crash_in_logcat`
- Root cause triage: inspect `verify.collect_evidence.classification` for `app_bug`, `automation_error`, `environment_missing`, `remote_rules_not_deployed`, and `test_data_missing`
- Visual regressions: run `verify.assert_screenshot_diff`
- API failures: confirm `apiAllowlist` and expected status/body

## Release Candidate

Use `build.build_release_candidate` only after debug flow passes. Release signing is delegated to the target app project. The MCP server does not read or modify keystores, certificates, provisioning profiles, or production secrets.

## CI Template

See `examples/github-actions-mobiloop.yml` for a split workflow:

- package checks on `ubuntu-latest`
- real Android validation on a self-hosted runner with SDK/Appium/device access

## Fast Repeat Runs

Keep the device and Appium server warm. Use `flow.replay_to_checkpoint` for stable setup flows such as onboarding, login, role selection, or fixture navigation. This reduces repeated test time while keeping the final assertions evidence-based.
