# Architecture

## Runtime Shape

```text
AI orchestrator
  |
  |-- mobiloop-code-mcp
  |-- mobiloop-env-mcp
  |-- mobiloop-build-mcp
  |-- mobiloop-device-mcp
  |-- mobiloop-ios-mcp
  |-- mobiloop-appium-mcp
  |-- mobiloop-verify-mcp
  |-- mobiloop-flow-mcp
  |-- mobiloop-loop-mcp
  |-- mobiloop-ci-mcp
  |-- mobiloop-orchestrator-mcp
```

The package also exposes `mobiloop-mcp`, an all-in-one server for local development and simpler MCP clients.

## Loop Contract

The expected loop is evidence-first:

```text
goal
  -> guarded code change
  -> lint/unit test/build
  -> install on device
  -> optional flow-memory replay to known checkpoint
  -> generated or hand-authored high-level flow script
  -> Appium user flow
  -> verification assertions
  -> evidence collection
  -> iteration record
  -> fix and retry
  -> report
```

The MCP server does not claim success by itself. Success must be represented by tool outputs:

- build command exit code and logs
- Appium page source and screenshots
- flow checkpoint signatures and replay plans
- generated scenario candidates and flow script execution records
- logcat crash checks
- logcat root-cause classification
- API assertion output
- loop iteration records
- generated Markdown report

## Separation Boundaries

- Code MCP owns workspace file and git operations.
- Env MCP owns host preflight and compatibility reporting.
- Build MCP owns dependency, lint, unit test, and APK build commands.
- Device MCP owns `adb` and emulator operations.
- iOS MCP owns `xcrun simctl` and `xcodebuild` operations.
- Appium MCP owns UI automation through WebDriver/Appium.
- Verification MCP owns assertions and evidence collection.
- Flow MCP owns source-flow analysis, generated scenario candidates, high-level flow scripts, screen checkpoint memory, and deterministic Appium replay to a remembered checkpoint.
- Loop MCP owns iteration JSONL and final reports.
- CI MCP owns artifact manifests, GitHub step summaries, and PR comments.
- Orchestrator MCP owns a bounded Android validation pass across build, install, optional flow replay, Appium, verification, evidence, and loop record tools.

## Safety Defaults

- paths must stay inside `workspaceRoot`
- secret-like paths are blocked
- commits are allowed only on branches matching `feature/ai-*`
- artifacts are written under `.mobiloop`
- when `runId` is set, artifacts are isolated under `.mobiloop/runs/<runId>`
- command output is capped
- API checks are restricted by `apiAllowlist`
- loop defaults are bounded by `maxFixAttempts`, `maxTestIterations`, and `maxRuntimeMinutes`

For stronger production isolation, run the separated MCP binaries in separate OS users or containers and give each server only the external tools it needs.
