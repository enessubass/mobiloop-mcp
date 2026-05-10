# Operations Runbook

## Appium Server

Check status:

```bash
curl http://127.0.0.1:4723/status
```

Start:

```bash
npx appium --address 127.0.0.1 --port 4723
```

Install Android driver:

```bash
npx appium driver install uiautomator2
```

## Android Device Stuck Offline

```bash
adb kill-server
adb start-server
adb devices -l
```

If the emulator is stuck, stop it from the emulator UI or `device.stop_emulator`, then start a clean AVD.

## Port Collision

If Appium cannot bind `4723`, either stop the old process or set:

```bash
APPIUM_SERVER_URL=http://127.0.0.1:4725
```

and start Appium on the same port.

## Artifact Cleanup

Artifacts are under `.mobiloop`. Keep recent failing runs and clean old successful runs:

```bash
find .mobiloop -type f -mtime +14 -delete
```

Run this only in disposable workspaces or with explicit operator approval.

## Failure Triage

1. Read `verify.collect_evidence` classification.
2. Separate app crash from automation crash.
3. Check Appium session health.
4. Check logcat for Firebase, Play Services, permission, network, and ANR findings.
5. Patch only if the classifier points to app or automation code.
