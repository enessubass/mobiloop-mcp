# Test Strategy

MobiLoop has three test levels.

## Unit

Current unit tests cover:

- config loading and workspace path constraints
- API allowlist matching
- forbidden path handling
- patch path extraction
- env preflight behavior
- flow-memory matching
- logcat classification
- tool registration

## Integration

Current mock integration tests:

```text
test/integration/
  appium-client.mock.test.ts
  flow-script.mock.test.ts
  orchestrator.mock.test.ts
```

These use a mock Appium HTTP server and verify exact-first text tapping, high-level flow script execution, and the Android orchestrator happy path without real device mutation.

## E2E

Real mobile E2E belongs on self-hosted runners:

```text
test/e2e/
  android-emulator.smoke.test.ts
  flutter-login.loop.test.ts
  react-native-login.loop.test.ts
```

Hosted GitHub Linux runners are good for package correctness. They are not enough to prove emulator/Appium behavior for every host.

The self-hosted proof workflow is:

```text
.github/workflows/android-fixture-e2e.yml
```

It prepares the Flutter login fixture, builds a debug APK, starts Appium, runs `orchestrator.run_android_validation_loop`, and uploads `.mobiloop` artifacts.

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

1. Add an orchestrator failure-path mock integration test.
2. Run Flutter login demo on self-hosted Android and publish real artifacts.
3. Add React Native login demo on self-hosted Android.
4. Add native Android login demo on self-hosted Android.
5. Add iOS simulator smoke on macOS runner.
