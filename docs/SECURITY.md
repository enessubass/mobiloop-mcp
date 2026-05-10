# Security Model

This server is designed as a controlled tool layer between an AI agent and a mobile development environment.

## Path Controls

All file paths are resolved against `workspaceRoot`. Any path that escapes the workspace is rejected. Secret-like files are rejected by `forbiddenPathGlobs`.

Default blocked paths include:

- `.env` and `.env.*`
- keystores and certificates
- provisioning profiles
- Google service config files
- paths containing `secret` or `credential`

## Git Controls

Branch creation and commits use `allowedBranchPattern`, which defaults to:

```text
^feature/ai-[A-Za-z0-9._/-]+$
```

This keeps automated commits away from mainline branches by default.

## Command Controls

The server does not expose arbitrary shell execution as an MCP tool. Build and device commands are structured tools with fixed command shapes.

Command output is capped by `maxOutputBytes`, and command runtime is capped by `maxCommandMs` unless a tool uses a stricter timeout.

## API Controls

`verify.assert_api_response` uses `apiAllowlist`. The default allowlist only permits localhost:

```text
http://127.0.0.1:*
http://localhost:*
```

Add staging hosts explicitly in `mobiloop.config.json`. Use an empty allowlist only in a sandboxed runner where unrestricted outbound requests are acceptable.

## Verification Controls

Verification tools produce evidence rather than relying on model claims:

- Appium source and screenshots
- logcat or simulator logs
- API response bodies
- pixel-level screenshot diffs
- accessibility label findings
- sqlite read-only query results

## Human Approval Layer

MCP clients should still apply their own approval policy for high-impact actions such as dependency install, emulator launch, device install, commit, push, and PR creation.

MobiLoop exposes policy metadata for every tool. Inspect it with:

```bash
mobiloop list-tools --json
```

The metadata is advisory for MCP clients and includes risk level, approval recommendation, workspace/device mutation flags, network access, and artifact production. Override local policy with `toolPolicies` in `mobiloop.config.json` when your runner has stricter rules.

This server provides guardrails; it is not a replacement for host-level sandboxing.
