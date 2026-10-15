# React Native Login Demo

Minimal React Native fixture for MobiLoop source-flow analysis and Android/Appium
validation planning.

The three unit scenarios and Android/Appium execution have also been exercised
locally against a generated React Native 0.76.5 application. Generated native
projects and dependencies stay under `.mobiloop/fixtures/react-native-login-demo`
and are not distributed with this source fixture.

This fixture intentionally uses `testID`, `accessibilityLabel`, placeholders, and
visible text so MobiLoop can exercise React Native locator conventions that differ
from Flutter semantics and native Android resource ids.

## Expected Flow

1. Launch `com.mobiloopreactnative`.
2. Type an email into `login.email`.
3. Type a password into `login.password`.
4. Tap `login.submit`.
5. Assert `Ana Sayfa` and `Hos geldiniz`.

The UI strings contain Turkish characters in the source app. This README keeps
the expected flow ASCII-only.

## Build

This fixture is intentionally source-only and does not vendor generated
`android/`, `ios/`, or `node_modules` output. To turn it into a runnable app, use
the React Native CLI on a host with Node, Android SDK, and Appium installed, then
add or generate the native platform folders locally.

The validated preparation used `@react-native-community/cli@15.1.3 init
MobiloopReactNative --version 0.76.5 --directory
.mobiloop/fixtures/react-native-login-demo --skip-install --skip-git-init --pm npm`
from the repository root. Copy this fixture's `src/` and `__tests__/` into that
generated project, import `./src/App` from its `index.js`, and add
`@testing-library/react-native@12.9.0` to its test dependencies. Run Jest in band.
For a self-contained debug APK without Metro, set `debuggableVariants = []` in
the generated Android app's `react` Gradle block before building. These pinned
versions test legacy compatibility; this is not a production starter template.

MobiLoop can run `build.run_unit_tests`, `build.build_debug_apk`, and
`device.install_app` for that isolated project with actual authorization.
Then opt into only this fixture with `MOBILOOP_TEST_FIXTURES=react-native-login-demo`,
select an emulator with `MOBILOOP_TEST_DEVICE`, and run `npm run test:device`.
The runner uses exact Android `resource-id` XPath matches for React Native testIDs
and does not clear data. It tests three UI outcomes plus an intentionally failing
assertion control and closes its Appium sessions.

Generated debug platform settings can intentionally trigger security findings
(for example Metro's cleartext allowance). Review those signals separately from
UI outcomes; a passing demo flow is not a passing production security assessment.
