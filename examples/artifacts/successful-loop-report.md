# Sample Successful Loop Report

This is a sanitized example artifact. It documents the shape expected from a real `.mobiloop/reports` output.

## Summary

- Goal: login smoke on Android emulator
- Status: passed
- Iterations: 1
- Device: Pixel_8_API_35
- Package: `com.example.login`
- Appium session: `sample-session`

## Evidence

- Screenshot: `.mobiloop/screenshots/login-result.png`
- Page source: `.mobiloop/sources/login-result.xml`
- Logcat: `.mobiloop/logs/login-result.log`
- Iteration record: `.mobiloop/loop/iterations.jsonl`

## Assertions

| Assertion                          | Result |
| ---------------------------------- | ------ |
| Login screen visible               | passed |
| Text input accepted email/password | passed |
| Home text visible after submit     | passed |
| No app crash in logcat             | passed |
| Appium session healthy             | passed |

## Root Cause

None. The flow passed with evidence.
