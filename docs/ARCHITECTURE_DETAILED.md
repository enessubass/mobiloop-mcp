# Detailed Architecture

## Data Flow

```text
AI agent
  -> MCP client
  -> MobiLoop tool schema
  -> guarded host command or WebDriver call
  -> artifact/evidence
  -> verifier/classifier
  -> iteration record
  -> report or bounded fix request
```

## Trust Boundaries

| Boundary          | Rule                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Agent to MCP      | Tools are structured; no generic shell tool is exposed.                                           |
| MCP to filesystem | Paths resolve inside `workspaceRoot`; forbidden globs block secrets.                              |
| MCP to git        | Commit tools require branches matching `allowedBranchPattern`.                                    |
| MCP to network    | API assertions use `apiAllowlist`; package installs require policy approval.                      |
| MCP to device     | Device mutation tools carry policy metadata and should be approval-gated.                         |
| MCP to evidence   | Artifacts are written under `.mobiloop`, optionally scoped by `runId`, and referenced in reports. |

## Orchestrator State Machine

```text
preflight
  -> build
  -> install
  -> session
  -> optional replay
  -> execute flow
  -> verify
  -> classify
  -> record
  -> pass | bounded retry | stop with external blocker
```

## Artifact Lifecycle

1. Tool creates an artifact under `.mobiloop`, or under `.mobiloop/runs/<runId>` when a run id is configured.
2. Tool returns a unified evidence object when possible.
3. Loop records reference artifact paths.
4. CI manifest uploads the artifact directory.
5. Reports summarize only sanitized paths and key findings.

## Multi-Session Guidance

Run one orchestrator loop per device/session. Parallel device execution should use separate:

- Appium sessions
- artifact subdirectories
- device serials
- runner workspaces

Do not share flow memory between unrelated app versions without review, including run-scoped memory under `.mobiloop/runs/<runId>/flow/memory.json`.
