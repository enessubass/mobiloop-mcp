# Agent Protocol

This is the expected behavior for AI agents using MobiLoop.

## Default Flow

1. Run `security.scan_source` and save its report path.
2. Run `security.generate_test_plan` and include relevant checks in the scenario.
3. Run `env.preflight` and `build.detect_project`.
4. Run `flow.analyze_from_code`, then generate scenarios with `flow.generate_test_scenarios`.
5. Run approved lint, unit-test, build, device, Appium, and verification actions.
6. Collect evidence and classify failure.
7. Patch only when the failure is an app bug or automation bug and approval permits it.
8. Rerun the failed scenario and relevant security plan checks.
9. Run `security.compare_scans` and `security.release_gate` before reporting a fix as ready.
10. Stop after bounded attempts and produce a report with unresolved findings.

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

Secure mode enforces approval server-side. Include:

```json
{
  "approval": {
    "approved": true,
    "approvedBy": "human-or-ci",
    "reason": "Specific reason for this high-impact action"
  }
}
```

Use `policy.list_tools` or `mobiloop list-tools --json` before planning a run so the agent knows which actions need approval.

## Stop Conditions

Stop and report when:

- `maxFixAttempts` is reached
- `maxTestIterations` is reached
- runtime exceeds `maxRuntimeMinutes`
- failure is classified as environment, remote rules, credentials, or missing test data
- evidence cannot be collected reliably
