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

Expected integration fixtures:

```text
test/integration/
  appium-client.mock.test.ts
  flow-script.mock.test.ts
  orchestrator.mock.test.ts
```

These should use mock Appium and adb/xcrun responses, not real devices.

## E2E

Real mobile E2E belongs on self-hosted runners:

```text
test/e2e/
  android-emulator.smoke.test.ts
  flutter-login.loop.test.ts
  react-native-login.loop.test.ts
```

Hosted GitHub Linux runners are good for package correctness. They are not enough to prove emulator/Appium behavior for every host.

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

1. Mock Appium client tests.
2. Orchestrator happy/failure path tests.
3. Flutter login demo on self-hosted Android.
4. React Native login demo on self-hosted Android.
5. Native Android login demo on self-hosted Android.
6. iOS simulator smoke on macOS runner.
