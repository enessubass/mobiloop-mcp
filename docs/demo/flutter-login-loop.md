# Flutter Login Demo Loop

Fixture:

```text
examples/mobile-fixtures/flutter-login-demo
```

Local trial:

```bash
cd examples/mobile-fixtures/flutter-login-demo
flutter pub get
flutter test
flutter build apk --debug
```

Then point MobiLoop at the fixture workspace:

```bash
MOBILOOP_WORKSPACE_ROOT=$PWD mobiloop generate-scenarios "login validation"
```

Example flow script:

```json
{
  "sessionId": "APPIUM_SESSION_ID",
  "steps": [
    { "action": "observe", "waitForAnyText": ["Giriş"], "timeoutMs": 15000 },
    {
      "action": "type",
      "locator": { "strategy": "text", "value": "E-posta" },
      "text": "test@example.com",
      "mode": "sendKeys"
    },
    {
      "action": "type",
      "locator": { "strategy": "text", "value": "Şifre" },
      "text": "123456",
      "mode": "sendKeys"
    },
    { "action": "tapText", "text": "Giriş Yap", "matchMode": "exact" },
    { "action": "assertText", "text": "Ana Sayfa" },
    { "action": "collectEvidence", "label": "flutter-login-demo" }
  ]
}
```

This fixture is intentionally tiny. Its purpose is to let contributors test generated scenarios, Flutter text input behavior, exact text tapping, evidence collection, and report output without bringing a private app into the repo.
