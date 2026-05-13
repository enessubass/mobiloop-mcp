# Orchestrator

MobiLoop provides bounded platform validation loops:

- `orchestrator.run_android_validation_loop`
- `orchestrator.run_ios_validation_loop`

It is currently a build-test-verify-classify loop, not an autonomous patch writer. Patch-and-retest should be layered on top by an agent only after approval, diff review, and rollback rules are configured.

## Android Responsibilities

- optionally run lint
- optionally run unit tests
- optionally build debug APK
- optionally install/clear data
- create or use an Appium session
- optionally replay flow memory
- run Appium steps
- run expected text checks
- collect evidence
- classify failures
- record iterations

## iOS Responsibilities

- optionally run Flutter dependency, lint, and unit-test checks
- build an iOS simulator `.app` with `xcodebuild`
- discover the generated `.app` bundle under DerivedData
- optionally boot a simulator and wait for boot completion
- optionally install and launch the app by bundle id
- create an Appium XCUITest session
- optionally replay flow memory
- run Appium steps
- run expected text checks
- collect Appium screenshot/source, simulator screenshot, and simulator logs
- record iterations

## Output Fields

Important fields include:

- `status`
- `iterations`
- `passed`
- `failedChecks`
- `likelyRootCause`
- `nextSuggestedAction`
- `blockingExternalDependency`
- `reportPath`

## Approval

When `MOBILOOP_REQUIRE_APPROVAL=true`, orchestrator tools require an approval payload because they can install apps, clear data, boot simulators/emulators, create Appium sessions, and drive UI flows.

## Bounded Loop Contract

The orchestrator should not loop forever. Respect:

- `maxFixAttempts`
- `maxTestIterations`
- `maxRuntimeMinutes`

If the likely cause is environment, remote rules, credentials, or missing test data, stop and report instead of patching blindly.

## Flutter iOS Example

Use this shape from the Flutter project root on a macOS host:

```json
{
  "goal": "Build and verify login flow on iOS.",
  "kind": "flutter",
  "workspace": "ios/Runner.xcworkspace",
  "scheme": "Runner",
  "destination": "platform=iOS Simulator,name=iPhone 15",
  "simulatorDevice": "iPhone 15",
  "bundleId": "com.example.app",
  "runLint": true,
  "runUnitTests": true,
  "buildIosApp": true,
  "bootSimulator": true,
  "installApp": true,
  "launchApp": true,
  "collectEvidence": true,
  "appiumCapabilities": {
    "platformName": "iOS",
    "appium:automationName": "XCUITest",
    "appium:deviceName": "iPhone 15",
    "appium:bundleId": "com.example.app"
  },
  "expectedTexts": ["Home"]
}
```

See `examples/flutter-ios-validation-loop.json`.
