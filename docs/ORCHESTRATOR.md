# Orchestrator

`orchestrator.run_android_validation_loop` coordinates Android validation.

## Responsibilities

- optionally run lint
- optionally run unit tests
- optionally build debug APK
- optionally install/clear data
- create or use an Appium session
- optionally replay flow memory
- run Appium steps
- run expected text checks
- collect evidence
- classify failures
- record iterations

## Output Fields

Important fields include:

- `status`
- `iterations`
- `passed`
- `failedChecks`
- `likelyRootCause`
- `nextSuggestedAction`
- `blockingExternalDependency`
- `reportPath`

## Bounded Loop Contract

The orchestrator should not loop forever. Respect:

- `maxFixAttempts`
- `maxTestIterations`
- `maxRuntimeMinutes`

If the likely cause is environment, remote rules, credentials, or missing test data, stop and report instead of patching blindly.

## iOS Parity Gap

iOS has lower-level tools today, but no equivalent `orchestrator.run_ios_validation_loop` yet. That is a planned parity item.
