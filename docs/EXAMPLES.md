# Examples

## Generate Scenarios

```bash
MOBILOOP_WORKSPACE_ROOT=/path/to/app \
mobiloop generate-scenarios "login, onboarding, validation"
```

## Run A Flow Script

```bash
MOBILOOP_WORKSPACE_ROOT=/path/to/app \
mobiloop call flow.run_script '{
  "sessionId": "APPIUM_SESSION_ID",
  "steps": [
    { "action": "observe", "waitForAnyText": ["Login", "Giriş Yap"], "timeoutMs": 15000 },
    { "action": "tapText", "text": "Giriş Yap", "matchMode": "exact" },
    { "action": "assertText", "text": "Ana Sayfa" },
    { "action": "collectEvidence", "label": "login-result" }
  ]
}'
```

## Inspect Tool Policies

```bash
mobiloop list-tools --json
```

## Flutter iOS Validation Loop

Use this from a Flutter project on macOS after starting Appium with the XCUITest driver:

```bash
MOBILOOP_WORKSPACE_ROOT=/path/to/flutter-app \
mobiloop call orchestrator.run_ios_validation_loop "$(cat examples/flutter-ios-validation-loop.json)"
```

Update the bundle id, simulator name, and expected text before running against a real app.

## Fixture Apps

Use the fixtures as known-small targets for local validation and CI smoke tests:

- `examples/mobile-fixtures/flutter-login-demo`
- `examples/mobile-fixtures/android-kotlin-login-demo`
- `examples/mobile-fixtures/react-native-login-demo`

The native Android fixture exercises resource-id and accessibility based locators that differ from Flutter semantics.
The React Native fixture exercises `testID`, `accessibilityLabel`, placeholder, and visible-text conventions used by Appium on RN apps.

## Example Artifacts

See:

- `examples/artifacts/successful-loop-report.md`
- `examples/artifacts/failed-loop-report.md`
- `examples/artifacts/appium-page-source.xml`
- `examples/artifacts/logcat-firestore-permission.log`
- `examples/artifacts/real-runs/flutter-login-android/`
- `examples/artifacts/real-runs/native-android-login/`
