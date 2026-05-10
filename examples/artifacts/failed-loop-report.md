# Sample Failed Loop Report

This is a sanitized example artifact for a failure that should not be patched by the agent.

## Summary

- Goal: resident login smoke
- Status: failed
- Classification: `remote_rules_not_deployed`
- Likely root cause: Firestore returned `PERMISSION_DENIED`
- Next suggested action: deploy or relax staging Firestore rules for test data
- Blocking external dependency: true

## Evidence

- Screenshot: `.mobiloop/screenshots/resident-login-failed.png`
- Page source: `.mobiloop/sources/resident-login-failed.xml`
- Logcat: `.mobiloop/logs/resident-login-failed.log`

## Decision

Do not patch app code unless the app is reading the wrong collection or document path. This failure is classified as a remote rules/test environment problem.
