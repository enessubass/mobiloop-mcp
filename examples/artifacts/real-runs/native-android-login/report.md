# Native Android Login Real Run

This is a sanitized real MobiLoop Android validation run for
`examples/mobile-fixtures/android-kotlin-login-demo`.

## Environment

- Device: Genymotion Galaxy S24
- Device serial: `127.0.0.1:6555`
- App package: `com.example.mobiloopnative`
- App activity: `com.example.mobiloopnative.MainActivity`
- Appium driver: UiAutomator2
- Run ID: `native-android-login-genymotion`

## Scenario

1. Build the native Android Kotlin fixture debug APK.
2. Install the APK on the Genymotion device.
3. Start an Appium UiAutomator2 session.
4. Wait for `com.example.mobiloopnative:id/email_field`.
5. Type deterministic test email into the email field.
6. Type deterministic test password into the password field.
7. Tap `com.example.mobiloopnative:id/login_button`.
8. Assert `Ana Sayfa`.
9. Assert `Hoş geldiniz`.
10. Assert Appium session health.
11. Assert no app crash in focused logcat.

## Result

Status: `passed`

Duration: `10945ms`

Evidence:

- `screenshot-home.png`
- `appium-page-source.xml`
- `logcat.log`
- `iterations.jsonl`
- `metrics.json`

Notes:

- The page source is redacted by MobiLoop artifact redaction.
- The log contains emulator renderer warnings, but no app crash findings.
