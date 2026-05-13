# Flutter Quickstart

This guide is the shortest path for using MobiLoop against your own Flutter app on Android and iOS.

## 1. Prepare The Host

Install the target platform tooling:

```bash
flutter doctor -v
```

For Android, make sure `adb` sees a device or emulator:

```bash
adb devices -l
```

For iOS, use macOS with Xcode and a bootable simulator:

```bash
xcrun simctl list devices available
```

Start Appium with the platform drivers you need:

```bash
npx appium driver install uiautomator2
npx appium driver install xcuitest
npx appium --address 127.0.0.1 --port 4723
```

## 2. Point MobiLoop At Your Flutter Project

From the MobiLoop repository:

```bash
npm ci
npm run build
```

Set the target app workspace and a run id:

```bash
export MOBILOOP_WORKSPACE_ROOT=/absolute/path/to/flutter/app
export APPIUM_SERVER_URL=http://127.0.0.1:4723
export MOBILOOP_RUN_ID=flutter-login-local
```

Run a preflight:

```bash
node dist/src/cli.js call env.preflight '{"target":"flutter"}'
```

Generate candidate flows from source:

```bash
node dist/src/cli.js call flow.generate_test_scenarios '{"goal":"login smoke, validation, and home navigation","maxScenarios":6}'
```

## 3. Android Validation Loop

Start or connect an Android target, then adapt `packageName`, `serial`, activity, and visible text:

```bash
node dist/src/cli.js call orchestrator.run_android_validation_loop '{
  "goal": "Build and verify Flutter login flow on Android.",
  "kind": "flutter",
  "packageName": "com.example.app",
  "serial": "emulator-5554",
  "runLint": true,
  "runUnitTests": true,
  "buildDebugApk": true,
  "clearAppData": true,
  "collectEvidence": true,
  "maxTestIterations": 2,
  "appiumCapabilities": {
    "platformName": "Android",
    "appium:automationName": "UiAutomator2",
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
        "timeoutMs": 15000
      }
    }
  ],
  "expectedTexts": ["Home"]
}'
```

## 4. iOS Validation Loop

On macOS, adapt the simulator name, bundle id, and visible text:

```bash
node dist/src/cli.js call orchestrator.run_ios_validation_loop '{
  "goal": "Build and verify Flutter login flow on iOS simulator.",
  "kind": "flutter",
  "workspace": "ios/Runner.xcworkspace",
  "scheme": "Runner",
  "configuration": "Debug",
  "sdk": "iphonesimulator",
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
}'
```

The iOS loop builds the simulator app with `xcodebuild`, discovers the generated `.app`, boots the simulator, installs and launches the app, creates an Appium XCUITest session, runs semantic Appium steps, verifies expected text, captures Appium evidence, captures a simulator screenshot, collects simulator logs, and records the iteration.

## 5. Artifacts

With `MOBILOOP_RUN_ID=flutter-login-local`, outputs are written under:

```text
.mobiloop/runs/flutter-login-local/
```

Expect:

```text
build/
screenshots/
sources/
logs/
loop/
reports/
```

Do not publish artifacts that may contain real user data unless your host policy has reviewed screenshots and logs.
