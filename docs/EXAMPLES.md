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

## Example Artifacts

See:

- `examples/artifacts/successful-loop-report.md`
- `examples/artifacts/failed-loop-report.md`
- `examples/artifacts/appium-page-source.xml`
- `examples/artifacts/logcat-firestore-permission.log`
- `examples/artifacts/real-runs/flutter-login-android/`
