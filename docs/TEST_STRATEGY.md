# Test Strategy

MobiLoop has three test levels.

## Unit

Current unit tests cover:

- config loading and workspace path constraints
- symbolic-link containment and secure-mode configuration behavior
- API allowlist matching
- forbidden path handling
- patch path extraction
- env preflight behavior
- flow-memory matching
- logcat classification
- run-scoped artifact pathing
- tool registration
- deterministic mobile security scan, fix comparison, and release gate behavior

## Integration

Current mock integration tests:

```text
test/integration/
  appium-client.mock.test.ts
  flow-script.mock.test.ts
  orchestrator.mock.test.ts
  mobile-qa.mcp.test.ts
```

Appium integration tests use mock HTTP responses to verify exact-first text tapping, high-level flow execution, and Android/iOS orchestration without real device mutation. Failure coverage includes negative assertions, stop-on-failure behavior, bounded retries, session cleanup, Android setup failures, and numeric HTTP assertion results.

The mobile QA integration tests start the actual MCP server over stdio in a temporary Git workspace. They verify source discovery, scan/plan/gate, denial of an unapproved patch, an approved guarded patch, scan comparison, a fresh release gate, report generation, workspace and endpoint guards, and missing-tool preflight. The skill contract test checks that referenced tool names remain registered. See [skill installation and validation](SKILLS.md).

## E2E

Real mobile E2E runs on a local machine or a self-hosted runner with the mobile SDK and Appium. The ordinary `npm test` suite does not require an emulator. The Android fixture workflow below and opt-in `npm run test:device` / `npm run test:ios` local suites are available. See [fixture preparation and invocation](SKILLS.md). Broad React Native and additional iOS app coverage remain work to add.

Hosted GitHub Linux runners are good for package correctness. They are not enough to prove emulator/Appium behavior for every host.

The [2026-10-15 initial device validation](validation/mobile-qa-android-ios-2026-10-15.md) records the Android native/Flutter and iOS Flutter results. The alpha.15 onboarding follow-up also covers generated React Native Android, setup/doctor, and clean package installation. Physical devices are excluded from that follow-up.

CI runs package tests and actual clean-install/first-use checks on Linux, Windows, and macOS, including Linux Node 20/26. The required `Validate` status aggregates those jobs and Docker. Platform workflow definitions alone are not passing results: inspect each run.

The opt-in `Android Host E2E` workflow builds the native fixture from the reviewed revision, creates a disposable Android emulator, and executes three UI scenarios plus a negative control on Ubuntu and Windows. It runs manually or on PRs labeled `android-host-e2e`. Windows uses software emulation and may be slower or fail host readiness; such a run is blocked/failed, never a claimed pass. Artifacts are fixture-only screenshots, source, logs, and reports. No physical devices are selected.

## Security Validation

Run `security.scan_source` before a build-test-fix loop and save the emitted JSON report. After an approved fix, use `security.compare_scans` with that report path and apply `security.release_gate` at `high` or stricter before release.

The built-in scan is static and does not execute the target project. It complements, but does not replace, dependency audit, CodeQL, container scanning, platform penetration testing, or host network controls.

The self-hosted proof workflow is:

```text
.github/workflows/android-fixture-e2e.yml
```

It can boot the configured AVD, verifies `adb devices`, prepares the Flutter login fixture, builds a debug APK, starts Appium, runs `orchestrator.run_android_validation_loop`, and uploads `.mobiloop` artifacts. It runs manually, nightly, and for pull requests labeled `android-e2e`.

## Required Evidence For A Passing Loop

A loop is not considered proven unless the run captures:

- build log
- installed app package/bundle id
- Appium session id
- screenshot
- page source
- logcat or simulator logs
- assertion output
- loop iteration JSON
- final Markdown report

## Fixture Roadmap

Add fixtures in this order:

1. Maintain orchestrator failure-path coverage alongside the skill workflow.
2. Expand the native Android login fixture into a self-hosted Android E2E workflow.
3. Add React Native login demo on self-hosted Android.
4. Run the local iOS simulator suite on a dedicated macOS runner using `orchestrator.run_ios_validation_loop`.

Current fixture roots:

- `examples/mobile-fixtures/flutter-login-demo`
- `examples/mobile-fixtures/android-kotlin-login-demo`
- `examples/mobile-fixtures/react-native-login-demo`
