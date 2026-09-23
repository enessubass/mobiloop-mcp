# Security Model

This server is designed as a controlled tool layer between an AI agent and a mobile development environment. The AI decides what to inspect, test, fix, and retest. MobiLoop owns the constrained execution path, evidence, and policy checks.

## Execution Modes

`secure` is the default mode. It does not load `mobiloop.config.json` from the current project directory, requires server-side approval for high-impact tools, keeps artifact redaction on, and only permits loopback Appium endpoints configured by the host.

Use `MOBILOOP_CONFIG=/absolute/path/to/mobiloop.config.json` for an explicitly selected host configuration. Use `MOBILOOP_SECURITY_MODE=trusted` only for an isolated local worktree or runner that needs file-based command paths, custom Appium endpoints, or policy overrides. Trusted mode is not appropriate for an arbitrary repository checkout controlled by an agent.

## Path Controls

All file paths are resolved against `workspaceRoot` and checked again after resolving existing symbolic links. Any path that escapes the workspace is rejected. Secret-like files are rejected by `forbiddenPathGlobs`.

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

`verify.assert_api_response` uses `apiAllowlist`. Appium, flow, and verification tools use a separate `appiumAllowlist`; in secure mode it is fixed to loopback endpoints. Tool input cannot override `serverUrl` in secure mode.

The default API allowlist only permits localhost:

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

Text artifacts, command text output, and MCP/CLI text responses are redacted by default for common bearer tokens, JWTs, API keys, secret-like key-value pairs, emails, and phone numbers. Screenshot redaction still requires external OCR/sanitization if screenshots can contain sensitive values.

## Human Approval Layer

MCP clients should still apply their own approval policy for high-impact actions such as dependency install, emulator launch, device install, commit, push, and PR creation.

MobiLoop exposes policy metadata for every tool. Inspect it with:

```bash
mobiloop list-tools --json
```

The metadata includes risk level, approval recommendation, workspace/device mutation flags, network access, and artifact production. Override local policy with `toolPolicies` in `mobiloop.config.json` when your runner has stricter rules.

Server-side enforcement is enabled by default in secure mode. Use this command only when an explicit trusted configuration needs to re-enable it:

```bash
MOBILOOP_REQUIRE_APPROVAL=true
```

When enabled, tools marked `requiresApproval` fail unless the input includes a valid `approval` object with `approved`, `approvedBy`, `reason`, and an optional non-expired `expiresAt`.

## Built-In Security Testing

MobiLoop provides deterministic security tools without adding a scanner package or uploading source code:

- `security.scan_source` scans supported mobile source, Android manifests, and iOS plist files without executing target code.
- `security.generate_test_plan` turns scan results into emulator/device validation work for an AI or engineer.
- `security.compare_scans` re-runs the scan after a fix and reports resolved, remaining, and introduced signals.
- `security.release_gate` blocks a release decision at a selected severity threshold.

The checks are guardrails, not a claim of complete security assurance. Dynamic testing, authenticated attack simulation, dependency review, and production network controls remain host or CI responsibilities.

This server provides guardrails; it is not a replacement for host-level sandboxing.
