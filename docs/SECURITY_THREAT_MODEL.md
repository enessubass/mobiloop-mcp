# Security Threat Model

## Assets

- source code
- credentials and signing material
- device state and test data
- CI tokens
- generated evidence and logs
- remote staging systems

## Main Threats

| Threat                      | Mitigation                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Workspace escape            | Resolve paths against `workspaceRoot`; reject outside paths.                                   |
| Secret file access          | Block default secret-like globs.                                                               |
| Main branch mutation        | Restrict commit tools with `allowedBranchPattern`.                                             |
| Unbounded command execution | Use fixed command shapes, timeouts, and output caps.                                           |
| Unsafe network calls        | Use `apiAllowlist` and policy approval.                                                        |
| Destructive device actions  | Mark mutating device tools with policy metadata and optional server-side approval enforcement. |
| False success claims        | Require evidence, assertions, logs, and loop records.                                          |

## Required Host Controls

MobiLoop is not a sandbox by itself. Production deployments should also use:

- OS user separation
- ephemeral workspaces
- least-privilege CI tokens
- staging-only test credentials
- artifact retention limits
- host-level network egress policy

## Redaction Policy

Text artifacts and command text output are redacted by default for common bearer tokens, JWTs, API keys, GitHub/Slack/OpenAI tokens, password/token key-value pairs, emails, and phone numbers.

Limitations:

- Screenshots are binary artifacts and are not OCR-redacted.
- Project-specific secrets may need additional host-side scanners.
- Agents should still summarize logs instead of pasting full artifacts into PRs or chat.
