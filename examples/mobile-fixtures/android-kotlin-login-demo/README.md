# Android Kotlin Login Demo

Minimal native Android fixture for MobiLoop Android/Appium validation.

This fixture intentionally uses native `EditText`, `Button`, stable resource ids,
and accessibility labels so MobiLoop can exercise Android locator paths that are
different from Flutter semantics.

## Expected Flow

1. Launch `com.example.mobiloopnative`.
2. Type an email into `com.example.mobiloopnative:id/email_field`.
3. Type a password into `com.example.mobiloopnative:id/password_field`.
4. Tap `com.example.mobiloopnative:id/login_button`.
5. Assert `Ana Sayfa` and `Hos geldiniz`.

The UI strings contain Turkish characters in the source app. This README keeps
the expected flow ASCII-only.

## Build

This fixture is intentionally source-only and does not vendor a Gradle wrapper.
Use a host with Android SDK and Gradle installed, or add a wrapper locally before
running `build.build_debug_apk`.
