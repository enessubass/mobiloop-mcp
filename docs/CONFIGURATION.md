# Configuration

MobiLoop starts in `secure` mode by default. Secure mode ignores `mobiloop.config.json` in the current project directory so an untrusted checkout cannot weaken the server. Configure the workspace and Appium endpoint in the host environment:

```bash
MOBILOOP_WORKSPACE_ROOT=/absolute/path/to/mobile/app
APPIUM_SERVER_URL=http://127.0.0.1:4723
```

For an explicitly selected host configuration, use:

```bash
MOBILOOP_CONFIG=/absolute/path/to/mobiloop.config.json
```

`MOBILOOP_WORKSPACE_ROOT`, `MOBILOOP_ARTIFACTS_DIR`, `APPIUM_SERVER_URL`, `MOBILOOP_RUN_ID`, `MOBILOOP_REQUIRE_APPROVAL`, and `MOBILOOP_REDACT_ARTIFACTS` override their matching config values. `MOBILOOP_ARTIFACTS_DIR` is the one host-controlled exception to the normal in-workspace artifact rule. Use it only for a dedicated writable evidence mount, such as `/artifacts` in the read-only Docker security server.

Set `MOBILOOP_SECURITY_MODE=trusted` only when the configuration file and workspace are controlled by the same trusted runner. Trusted mode permits file-based executable paths, custom Appium allowlists, and tool policy overrides.

## Schema

The JSON schema is published in the repo:

```text
schema/mobiloop.config.schema.json
```

Use it in config files:

```json
{
  "$schema": "schema/mobiloop.config.schema.json",
  "workspaceRoot": ".",
  "artifactsDir": ".mobiloop"
}
```

## Important Fields

| Field                  | Production Guidance                                                           |
| ---------------------- | ----------------------------------------------------------------------------- |
| `securityMode`         | Keep `secure`; use `trusted` only inside an isolated, controlled worktree.    |
| `workspaceRoot`        | Set this to the mobile app root, not a broad home or projects directory.      |
| `artifactsDir`         | Keep it inside `workspaceRoot`; MobiLoop rejects paths outside the workspace. |
| `runId`                | Set per CI/job/test run to isolate evidence under `.mobiloop/runs/<runId>`.   |
| `allowedBranchPattern` | Keep the default `feature/ai-*` pattern for automated commits.                |
| `apiAllowlist`         | Keep it narrow. Prefer localhost and explicit staging hosts.                  |
| `appiumAllowlist`      | Trusted mode only; keep Appium targets on a narrow, known origin allowlist.   |
| `forbiddenPathGlobs`   | Keep secret, keystore, provisioning, and service-config patterns blocked.     |
| `toolPolicies`         | Override risk metadata for local policy engines or MCP clients.               |
| `requireApproval`      | Required in secure mode; set true in trusted mode unless CI owns the gate.    |
| `redactArtifacts`      | Keep true unless another artifact/response sanitizer runs after MobiLoop.     |

Only the host-controlled `MOBILOOP_ARTIFACTS_DIR` may use a dedicated external evidence mount.

MobiLoop validates `mobiloop.config.json` against the JSON schema at startup. Invalid fields fail early with a path-specific error.

## Run-Scoped Artifacts

Without `runId`, tools use the legacy artifact root:

```text
.mobiloop/
```

With `runId` or `MOBILOOP_RUN_ID`, artifact-producing tools write under:

```text
.mobiloop/runs/<runId>/
```

This keeps parallel CI jobs, nightly runs, and local investigations from mixing evidence. Unsafe characters in environment-supplied run ids are normalized before path use.

## Approval Enforcement

In secure mode, and whenever `requireApproval` or `MOBILOOP_REQUIRE_APPROVAL=true` is enabled, tools whose effective policy has `requiresApproval: true` must include:

```json
{
  "approval": {
    "approved": true,
    "approvedBy": "human-or-ci",
    "reason": "Why this high-impact tool is allowed",
    "expiresAt": "2026-05-11T12:00:00Z"
  }
}
```

`expiresAt` is optional. Expired or malformed approvals are rejected before the tool handler runs.

## Tool Policy Overrides

MobiLoop ships default policy metadata for every tool. Override only when your host policy differs:

```json
{
  "toolPolicies": {
    "device.clear_app_data": {
      "requiresApproval": true,
      "riskLevel": "dangerous",
      "allowedInCi": false
    },
    "flow.run_script": {
      "requiresApproval": false,
      "allowedInCi": true
    }
  }
}
```

Inspect effective policies:

```bash
mobiloop list-tools --json
```

## Risk Warnings

- Empty `apiAllowlist` or `appiumAllowlist` should only be used inside a network-isolated trusted runner.
- Do not point `workspaceRoot` at a directory that contains multiple unrelated products or secrets.
- Do not remove default forbidden path globs unless another secret scanner blocks the same files.
- Treat `device.clear_app_data`, `device.uninstall_app`, coordinate taps, and orchestrator loops as approval-worthy actions.
