# Configuration

MobiLoop reads config from `mobiloop.config.json` in the current working directory, or from:

```bash
MOBILOOP_CONFIG=/absolute/path/to/mobiloop.config.json
```

`MOBILOOP_WORKSPACE_ROOT` and `APPIUM_SERVER_URL` override their matching config values.

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
| `workspaceRoot`        | Set this to the mobile app root, not a broad home or projects directory.      |
| `artifactsDir`         | Keep it inside `workspaceRoot`; MobiLoop rejects paths outside the workspace. |
| `allowedBranchPattern` | Keep the default `feature/ai-*` pattern for automated commits.                |
| `apiAllowlist`         | Keep it narrow. Prefer localhost and explicit staging hosts.                  |
| `forbiddenPathGlobs`   | Keep secret, keystore, provisioning, and service-config patterns blocked.     |
| `toolPolicies`         | Override risk metadata for local policy engines or MCP clients.               |

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

- Empty `apiAllowlist` should only be used inside a network-isolated sandbox.
- Do not point `workspaceRoot` at a directory that contains multiple unrelated products or secrets.
- Do not remove default forbidden path globs unless another secret scanner blocks the same files.
- Treat `device.clear_app_data`, `device.uninstall_app`, coordinate taps, and orchestrator loops as approval-worthy actions.
