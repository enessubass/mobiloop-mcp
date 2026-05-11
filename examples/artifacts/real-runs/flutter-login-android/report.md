# Flutter Login Android Real Run

Sanitized evidence from a local Android validation run against the
`examples/mobile-fixtures/flutter-login-demo` fixture.

## Summary

- Status: passed
- Date: 2026-05-11
- Device: Genymotion Samsung Galaxy S24, Android 15 / API 35
- ADB serial: 127.0.0.1:6555
- Appium: 3.4.2 with UiAutomator2 7.2.2
- App package: `com.example.mobiloop_flutter_login_demo`
- Duration: 26911 ms

## Flow

1. Installed the debug APK on the Genymotion device.
2. Cleared app data before the test.
3. Waited for `Giris Yap` on the login screen.
4. Typed fixture credentials using Flutter-safe `adbKeyboard` input mode.
5. Tapped the exact `Giris Yap` target.
6. Verified the home screen text.
7. Collected screenshot, page source, and logcat evidence.

## Assertions

- `Ana Sayfa` visible: passed
- `Hos geldiniz` visible: passed
- Appium session healthy: passed
- No application crash in logcat: passed

## Notes

The original screen text contains Turkish characters. This report keeps the
Markdown ASCII-only, while the XML and screenshot preserve the captured UI text.
Renderer warnings from the Android emulator were classified as non-blocking;
the crash assertion returned no crash findings.
