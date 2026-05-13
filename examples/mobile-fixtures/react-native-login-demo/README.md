# React Native Login Demo

Minimal React Native fixture for MobiLoop source-flow analysis and Android/Appium
validation planning.

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
