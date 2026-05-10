# Agent Protocol

This is the expected behavior for AI agents using MobiLoop.

## Default Flow

1. Run `env.preflight`.
2. Run `build.detect_project`.
3. Run `flow.analyze_from_code`.
4. Generate scenarios with `flow.generate_test_scenarios`.
5. Pick one small scenario and convert it to `flow.run_script`.
6. Run lint and unit tests when available.
7. Build a debug app.
8. Install on emulator, simulator, or device.
9. Create an Appium session.
10. Run the flow script.
11. Collect evidence.
12. Classify failure.
13. Patch only when the failure is an app bug or automation bug.
14. Stop after bounded attempts and produce a report.

## Fix Decision Table

| Classification              | Agent Action                                            |
| --------------------------- | ------------------------------------------------------- |
| `app_bug`                   | Patch app code, rebuild, rerun.                         |
| `automation_error`          | Fix locator, wait, input mode, or Appium session setup. |
| `environment_missing`       | Stop and report host requirement.                       |
| `remote_rules_not_deployed` | Stop unless staging rules are explicitly in scope.      |
| `test_data_missing`         | Seed or request test data; do not fake success.         |
| `external_dependency`       | Stop with evidence and next action.                     |

## Locator Rules

1. Prefer accessibility id.
2. Prefer resource id.
3. Use exact visible text.
4. Use semantic source analysis.
5. Use screenshot/OCR only if available.
6. Use coordinates only as a last resort and record why.

## Approval Rules

Ask before tools whose policy has `requiresApproval: true`. Typical examples:

- dependency install
- app install/uninstall
- clearing app data
- coordinate taps
- code patches
- commits and PRs
- orchestrator loops that mutate device state

## Stop Conditions

Stop and report when:

- `maxFixAttempts` is reached
- `maxTestIterations` is reached
- runtime exceeds `maxRuntimeMinutes`
- failure is classified as environment, remote rules, credentials, or missing test data
- evidence cannot be collected reliably
