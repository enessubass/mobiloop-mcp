# Changelog

## 0.1.0-alpha.2

Follow-up alpha hardening release.

- Fixed native Appium locator translation so `android uiautomator` and `ios predicate string` inputs are sent to WebDriver as `-android uiautomator` and `-ios predicate string`.
- Added regression coverage for native mobile locator strategy mapping.
- Narrowed JWT redaction to avoid masking normal hostnames, package names, class names, and localhost URLs in evidence.
- Narrowed phone redaction to avoid masking logcat timestamps while still redacting labeled phone values.
- Added sanitized real-run Android evidence for the Flutter login fixture under `examples/artifacts/real-runs/flutter-login-android`.
- Fixed the Flutter login fixture widget test import for `ValueKey`.
- Tightened npm and Docker package contents so generated Flutter `.dart_tool`, `build`, and `pubspec.lock` outputs are excluded while example evidence logs remain included.
- Added the Firestore permission sample log artifact referenced by the examples documentation.

## 0.1.0-alpha.1

Initial alpha release.

- Added deterministic self-hosted Android fixture E2E readiness with optional AVD boot, device listing, nightly schedule, and PR label gate.
- Added GHCR SBOM artifact generation and non-blocking Trivy image scan during image publishing.
- Added policy hint tags to MCP/CLI tool descriptions for clients that do not call `policy.list_tools`.
- Added CLI fallback wrapper (`mobiloop call`, `mobiloop list-tools`, `mobiloop generate-scenarios`).
- Added generated E2E scenario candidates and high-level flow script execution.
- Improved Appium exact-first text tapping, Flutter-friendly text input modes, readiness waits, and clicked-target reporting.
- Added Appium server bootstrap helper, session health assertion, common evidence schema, and logcat root-cause classification.
- Added machine-readable tool policy metadata, config schema, CLI policy listing, lint/format checks, and expanded production documentation.
- Added server-side approval enforcement, `policy.list_tools`, runtime config schema validation, and default redaction for text artifacts, command output, and MCP/CLI text responses.
- Added mock Appium integration tests for Appium client, flow script execution, and Android orchestrator happy path.
- Added a self-hosted Android fixture E2E workflow for the Flutter login demo.
- Added sample artifacts and a minimal Flutter login fixture for local MobiLoop trials.
- Made Java preflight context-aware so Flutter target checks warn instead of blocking solely on a missing global `java`.
- Branded the project as MobiLoop MCP with `mobiloop-*` binaries, `MOBILOOP_*` env vars, and `.mobiloop` artifacts.
- Added GitHub Actions CI and GHCR image publishing workflow.
- Added guarded MCP tools for code, environment, build, Android device, iOS simulator, Appium, verification, flow memory, loop reporting, CI, and orchestration.
- Added source-flow analysis for Flutter, React Native, Android, and iOS codebases.
- Added runtime checkpoint memory and replay-to-checkpoint support for repeated mobile test setup flows.
- Added Docker packaging for the MCP runtime.
- Added examples for Android validation loops, flow-memory replay, and GitHub Actions/self-hosted runner setup.
- Added tests for path safety, patch parsing, API allowlisting, config safety, and flow replay planning.
