# Changelog

## 0.1.0

Initial release candidate.

- Added CLI fallback wrapper (`mobiloop call`, `mobiloop list-tools`, `mobiloop generate-scenarios`).
- Added generated E2E scenario candidates and high-level flow script execution.
- Improved Appium exact-first text tapping, Flutter-friendly text input modes, readiness waits, and clicked-target reporting.
- Added Appium server bootstrap helper, session health assertion, common evidence schema, and logcat root-cause classification.
- Made Java preflight context-aware so Flutter target checks warn instead of blocking solely on a missing global `java`.
- Branded the project as MobiLoop MCP with `mobiloop-*` binaries, `MOBILOOP_*` env vars, and `.mobiloop` artifacts.
- Added GitHub Actions CI and GHCR image publishing workflow.
- Added guarded MCP tools for code, environment, build, Android device, iOS simulator, Appium, verification, flow memory, loop reporting, CI, and orchestration.
- Added source-flow analysis for Flutter, React Native, Android, and iOS codebases.
- Added runtime checkpoint memory and replay-to-checkpoint support for repeated mobile test setup flows.
- Added Docker packaging for the MCP runtime.
- Added examples for Android validation loops, flow-memory replay, and GitHub Actions/self-hosted runner setup.
- Added tests for path safety, patch parsing, API allowlisting, config safety, and flow replay planning.
