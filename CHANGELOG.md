# Changelog

## Unreleased

## 0.1.0-alpha.5

- Added a real Genymotion/Appium run artifact for the native Android Kotlin login fixture.
- Fixed native fixture JVM target configuration so it builds under Android Studio JBR/JDK 21 hosts.
- Kept renderer-only logcat warnings non-blocking in log classification while preserving the warning findings.
- Added Dependabot and CodeQL workflows for dependency and static security scanning.
- Merged the npm development dependency update group after CI and CodeQL passed.
- Left the Docker Node 26 runtime bump and GitHub Actions major-version bump open pending explicit runtime/self-hosted runner validation.

## 0.1.0-alpha.4

Release pipeline correction.

- Disabled automatic SBOM release-asset uploads in the GHCR workflow; the SBOM is still uploaded as a workflow artifact.
- Re-published the alpha line so GHCR image publish, SBOM artifact upload, and Trivy scan can complete from the corrected workflow.

## 0.1.0-alpha.3

Alpha fixture and artifact layout release.

- Added a native Android Kotlin login fixture with stable resource ids, accessibility labels, and validation/home screens.
- Added run-scoped artifact roots through `runId` and `MOBILOOP_RUN_ID`, writing evidence under `.mobiloop/runs/<runId>`.
- Updated artifact readers, manifests, reports, build log collection, env preflight, and flow memory to use the same run-scoped root.
- Added artifact pathing tests for legacy and run-scoped layouts.
- Improved static source-flow detection for native Android projects without an `android/` wrapper directory.
- Added native Android fixture packaging entries for npm/GHCR distribution.
- Sanitized GitHub step summaries and PR comment bodies when redaction is enabled.
- Clarified documentation for run-scoped artifacts and current fixture coverage.

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
