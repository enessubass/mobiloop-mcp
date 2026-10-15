# MobiLoop Mobile QA Skill

The MIT-licensed [mobiloop-mobile-qa](../skills/mobiloop-mobile-qa/SKILL.md) skill teaches an AI coding agent how to plan, execute, classify, fix, and retest mobile scenarios with MobiLoop. It works independently of any marketplace and contains no model service, telemetry, or installer scripts.

## Install

The [setup command](INSTALLATION.md) adds the MCP connection and skill together without changing global settings:

```bash
node dist/src/cli.js setup --workspace /absolute/path/to/mobile-app --client codex --yes
```

The manual alternative follows.

Configure the local [MobiLoop MCP connection](../README.md#mcp-client-configuration) for the mobile app first. The skill requires the host SDKs and Appium for device testing; copying the skill does not install them.

Copy `skills/mobiloop-mobile-qa` into a skill directory supported by your client. For clients supporting project-level `.agents/skills`, run from the MobiLoop checkout:

```bash
mkdir -p /absolute/path/to/mobile-app/.agents/skills
cp -R skills/mobiloop-mobile-qa /absolute/path/to/mobile-app/.agents/skills/
```

Other clients can use their own skill directory, such as `.claude/skills` or `.cursor/skills`. Reload skill discovery as required by the client. The same folder is included in the npm package. The optional `agents/openai.yaml` supplies display metadata to compatible clients; the instructions are in the self-contained `SKILL.md`.

Example request:

```text
Use mobiloop-mobile-qa to test login and input validation on my Android
test device. Use the supplied test account. Investigate failures, fix
confirmed app or automation bugs, and rerun affected tests. Preserve app
data and return the evidence report.
```

Client-specific invocation syntax and access to local MCP tools vary. File-format compatibility does not establish tested runtime compatibility with every agent. A cloud-only agent also needs an authorized connection to a machine with the mobile toolchain.

## Workflow

The agent discovers tool policies, checks the selected environment, generates scenario candidates, adds applicable security checks, and executes observable assertions. It honors the user's existing authorization and the host's guards. Fixes happen in the agent layer, with a rebuild and a retest; the orchestrators do not write patches.

The skill limits work to three fixes, five iterations, and 30 minutes by default, subject to lower user or host limits. These are agent workflow limits, not a new server-side global execution budget. Source scans, blocked scenarios, missing evidence, and installed-binary tests are reported separately from executed source-to-device validation.

## Validation

`npm test` checks that the skill's referenced tools exist, exercises failure and cleanup paths for Android/iOS orchestration, and runs an isolated MCP stdio workflow with real approval enforcement, a guarded source patch, security comparison, and a fresh release gate. These deterministic tests validate the tool contracts. They do not prove that every model or client will follow the instructions.

Real-device runs use dedicated demo fixtures and keep evidence under `.mobiloop/runs`. Keep credentials and personal screenshots out of distributed skill packages.

See the [Android/iOS validation record](validation/mobile-qa-android-ios-2026-10-15.md) for executed scenarios, discovered fixes, and remaining coverage limits.

From a source checkout, with both included Android demo applications already installed and Appium running, execute the opt-in device suite:

```bash
MOBILOOP_TEST_DEVICE=your-adb-serial \
APPIUM_SERVER_URL=http://127.0.0.1:4723 \
npm run test:device
```

Ensure `adb` and the Android toolchain are on `PATH`. If using Android Studio's bundled JDK, set `JAVA_HOME` to its JDK home and prepend `$JAVA_HOME/bin` to `PATH` for the test process; no global Java installation is required. The suite records full-build preflight failures separately because it tests installed binaries. It launches only `com.example.mobiloopnative` and `com.example.mobiloop_flutter_login_demo`, enters synthetic fixture data, tests invalid email, short password, and successful login, and checks an intentionally failing assertion. It closes its sessions and does not build, reinstall, or clear app data. This verifies installed demo binaries; it does not prove that they match the current source revision.

## iOS Simulator Suite

The iOS suite builds and installs a separate copy of the Flutter fixture. From the source checkout, prepare it once with the installed Flutter SDK:

```bash
mkdir -p .mobiloop/fixtures/flutter-ios-login-demo
cp -R examples/mobile-fixtures/flutter-login-demo/lib \
  examples/mobile-fixtures/flutter-login-demo/test \
  examples/mobile-fixtures/flutter-login-demo/pubspec.yaml \
  .mobiloop/fixtures/flutter-ios-login-demo/
cd .mobiloop/fixtures/flutter-ios-login-demo
flutter create --platforms=ios --project-name mobiloop_flutter_login_demo \
  --org io.github.enessubass --no-pub .
flutter pub get
flutter build ios --simulator --debug --config-only --no-pub
cd ../../..
```

Start Appium with the XCUITest driver on the same Mac. Select a test simulator UDID from `xcrun simctl list devices available`, then run:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
MOBILOOP_IOS_TEST_DEVICE=your-simulator-udid \
APPIUM_SERVER_URL=http://127.0.0.1:4723 \
npm run test:ios
```

Set `DEVELOPER_DIR` for preparation and Appium too if the host's default developer directory points to Command Line Tools. No global `xcode-select` change is required. The test runner uses MobiLoop to check the environment, scan source, run the fixture unit test, build the simulator app, install it, execute three login/input-validation scenarios, collect Appium and simulator evidence, and check an intentionally failing assertion. It only installs the dedicated `io.github.enessubass.mobiloopFlutterLoginDemo` bundle and closes its own Appium sessions. Simulator shutdown remains under host/user control.
