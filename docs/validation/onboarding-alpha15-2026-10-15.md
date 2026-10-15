# Alpha.15 Onboarding And Emulator Follow-Up

Candidate: `0.1.0-alpha.15`, reviewed through [PR 25](https://github.com/enessubass/mobiloop-mcp/pull/25). Physical devices are explicitly excluded. This record is not a claim that the PR has merged or that the candidate is published.

## Local Results

- Automated suite: 122 tests, 121 passed and one Windows-only batch-command test skipped on macOS. Earlier Windows CI executed all 116 tests present at that revision; the six additional release/runtime-selection checks require the current-head CI run.
- Clean package installation passed from a temporary directory with spaces, including the actual installed launcher, project-local setup, a second idempotent setup, doctor, 83-tool MCP discovery, and rejection of an unapproved patch.
- Setup tests cover all five output formats, preserving other settings, TOML comments on append, exact private backups, dry runs, intentional replacement, malformed input, unsafe endpoints, and symlink/junction destinations. This is not independent behavioral evaluation of every client/model.
- Kotlin Android, Flutter Android, React Native Android, and Flutter iOS each passed invalid-email, short-password, and successful-navigation assertions: 12/12 UI scenarios. Four intentionally wrong visibility expectations were correctly rejected. All created Appium sessions were deleted.
- React Native `0.76.5` was generated using CLI `15.1.3`, received the source fixture, passed three Jest cases, and was built through MobiLoop `build.build_debug_apk`. The resulting dedicated `com.mobiloopreactnative` APK was installed through MobiLoop and tested on Genymotion Android 15. A bundled debug APK avoids a Metro-server dependency. The scaffold fetched its required NDK `26.1.10909125`; these downloads are separate from the MobiLoop runtime.
- iOS Flutter was rebuilt, installed, and tested on the dedicated iPhone 17 Pro / iOS 26.2 simulator with an explicit platform version. The deprecated Appium GET-session probe was replaced by active page-source health checks.

The initial combined summary exercised installed Kotlin/Flutter binaries. Both were subsequently rebuilt from source through `build.build_debug_apk` and reinstalled through `device.install_app` without clearing app data. A fresh Flutter run exposed an unstable post-typing tap; stable-source observation before the single tap resolved the three scenarios on retest. Observation now fails explicitly if its readiness conditions time out. No MiniTakip data or physical device was modified.

The new keyboard-dismissal tool checks driver visibility, issues at most one hide command, and verifies the result. Genymotion with Appium's non-visual IME reported a keyboard that UiAutomator2 could not dismiss, despite no visible keyboard; this remains an explicit driver failure, not a false pass or a blind back/tap fallback. The fixture runner waits for a stable layout instead of requiring unnecessary keyboard dismissal.

## Evidence

Paths are relative to the checkout and intentionally excluded from distribution:

- Android combined summary: `.mobiloop/runs/mobile-qa-device-2026-10-15T16-34-10-168Z/summary.json`.
- iOS source-build/UI summary: `.mobiloop/runs/mobile-qa-ios-2026-10-15T16-34-14-172Z/summary.json`.
- Latest iOS source-build/UI summary: `.mobiloop/runs/mobile-qa-ios-2026-10-15T17-00-55-599Z/summary.json`.
- Fresh-source Flutter Android stable-layout retest: `.mobiloop/runs/mobile-qa-device-2026-10-15T17-00-01-789Z/summary.json`.
- All-three Android post-fix UI summary: `.mobiloop/runs/mobile-qa-device-2026-10-15T17-02-58-743Z/summary.json`. Its UI checks passed, but the launch shell omitted the JDK from PATH, so Android preflight correctly reported missing Java. The runner now requires preflight to pass rather than allowing that host-readiness failure to coexist with an overall successful invocation.
- Final Android summary with explicit JDK PATH and mandatory passing preflight: `.mobiloop/runs/mobile-qa-device-2026-10-15T17-07-41-646Z/summary.json`. All three fixtures passed preflight, all nine UI scenarios, all crash/session-health checks, and three negative controls; all sessions closed.
- Kotlin source build: `examples/mobile-fixtures/android-kotlin-login-demo/.mobiloop/build/2026-10-15T16-43-04-104Z-debug-apk.log`.
- Flutter Android source build: `.mobiloop/fixtures/flutter-android-login-demo/.mobiloop/build/2026-10-15T16-44-54-136Z-debug-apk.log`.
- Each Android fixture's run root appends `-android-kotlin-login-demo`, `-flutter-login-demo`, or `-react-native-login-demo` to the combined run ID and contains screenshots, source, logs, iterations, and its Markdown report.
- React Native unit/build logs: `.mobiloop/fixtures/react-native-login-demo/.mobiloop/build/2026-10-15T16-15-56-999Z-unit-tests.log` and `2026-10-15T16-27-43-023Z-debug-apk.log` in that same directory.
- Prepared candidate downloads: `.mobiloop/release/0.1.0-alpha.15/`. The package and skill ZIP contain no local run artifacts or generated native projects.

## Security Scope

The native launcher retains an exported-component review signal. The generated React Native debug manifest legitimately permits cleartext traffic for development; that high finding remains visible and is not hidden to obtain a UI pass. The final React Native scan has one high debug-cleartext signal and one medium exported-launcher signal. Do not call that debug scaffold production-hardened. XML license comments, tools namespaces, and properties documentation no longer create extra transport findings; actual HTTP values and cleartext flags remain detectable.

The root dependency audit and Docker production audit reported zero known vulnerabilities. Two small local runtime dependencies were added for structured TOML preservation and Windows command-shim escaping; no marketplace service or model backend was introduced. SDK/framework fixture dependencies have their own lifecycle and are not covered by that root-runtime audit claim.

A full-image Trivy check separately found three fixable HIGH advisories in the base image's bundled npm, outside the app dependency audit. Pinning npm 12.2.0 alone retained the affected dependencies. The container now installs compatible brace-expansion 5.0.11 and undici 6.28.1 patches in npm's production graph. Three bounded brace-pattern controls no longer throw, ordinary expansion still works, and the repeat full-image fixable HIGH/CRITICAL gate returns zero findings. A real approved MobiLoop `build.install_dependencies` call ran `npm ci` successfully on an isolated zero-dependency container fixture. This is not a claim that all severities or every possible exploit were tested.

The release workflow now scans before pushing and tags/pushes that same candidate without rebuilding. Its exact shell step was exercised against a disposable localhost registry: two tags and the emitted repository-specific digest all identified the scanned image. No GHCR or public release was published by that local test.

## External Validation And Publication

Linux/macOS package tests and Docker initially passed their runtime tests but CI caught stale registry version metadata in the first PR commit. That is a release-blocking failure, not a green run. The hosted Android setup also exposed a retired SDK `tools` default; its configuration now selects only supported platform-tools before explicit emulator packages.

Windows diagnostics subsequently identified MCP cleanup ordering (a live server locked its working directory) and a fixture LF/CRLF assumption. The test harness now closes the client before removing its workspace and sets only the disposable Git fixture's line-ending behavior. Hosted AVD creation and launch now share an explicit isolated directory. These fixes still require current hosted results; earlier failed runs are not counted as platform passes.

[CI run 38774218711](https://github.com/enessubass/mobiloop-mcp/actions/runs/38774218711) passed at runtime commit `8e5911d`: Ubuntu Node 20/26, macOS Node 22, Windows Node 22, Docker, and aggregate Validate. This includes 116/116 tests on Windows (the Windows-specific shim test ran), applicable tests on the other hosts, and clean package installation/first use on every package matrix entry. Native hosted-emulator validation is separate and is not implied by these package checks.

Hosted Linux run `38774218758` booted its emulator, built/installed the fixture, and correctly failed the invalid-input scenario: screenshots showed the small default display's visible keyboard covered the submit button. A semantic click hit the obscuring keyboard instead. The hosted harness now explicitly dismisses and verifies the visible keyboard before the single submit tap. That change requires a fresh emulator run; the earlier failure is retained as evidence, not relabeled as an app bug or a pass.

[Hosted run 38775303816](https://github.com/enessubass/mobiloop-mcp/actions/runs/38775303816) subsequently passed the Ubuntu API 35 emulator: source build/install, passing preflight, all three UI assertions, crash/session checks, the rejected negative control, and session cleanup. Its proof is in `.mobiloop/ci-debug/linux-final-2b5a82e/runs/mobile-qa-device-2026-10-15T17-17-21-976Z/summary.json`. The Windows API 35 software emulator failed boot readiness after 18 minutes, before app testing. Current preparation probes Windows acceleration and uses a lighter API 28 x86 image only when acceleration is unavailable; that fallback is pending execution, not a proven Windows device pass.

Final Windows/Linux package/clean-install and emulator results must be read from the current PR checks and fixture-only workflow artifacts. A workflow file alone does not prove a platform passed. Main retains required checks, strict freshness, and one independent approval; neither approval enforcement nor branch protection was disabled to publish. The tag, GHCR/Registry publish, and downloadable release assets must wait for the protected-main review and successful checks.
