# Android And iOS QA Validation - 2026-10-15

Scope: local, unreleased work on `codex/mobile-qa-skill`, based on MobiLoop `0.1.0-alpha.14`. This follows the [initial blocked attempt](mobile-qa-2026-10-15.md). No release, registry publication, push, or merge was performed.

## Result

| Target                                     | Execution                                                     | Result                 |
| ------------------------------------------ | ------------------------------------------------------------- | ---------------------- |
| Genymotion Android 15 / native Kotlin demo | Installed binary, three input-validation/navigation scenarios | 3/3 passed             |
| Genymotion Android 15 / Flutter demo       | Installed binary, same scenarios                              | 3/3 passed             |
| Xcode iOS 26.2 / Flutter demo              | Unit test, source build, install, same scenarios              | 3/3 passed             |
| Negative assertion controls                | One per target, visible login button asserted absent          | 3/3 correctly rejected |
| Automated package tests                    | Local Node and Docker build                                   | 84/84 passed in each   |

Each target exercised invalid email, a short password with a valid email, and valid local input reaching the home screen. These are deterministic demo forms, not a production authentication service. Expected UI text was asserted; screenshots, source, and platform logs were saved. Android also passed Appium session-health and crash-signature assertions; iOS passed session-health assertions and collected scoped simulator logs. Final screenshots were inspected visually.

## Toolchain And Scope

- Genymotion Galaxy S24: explicitly selected `127.0.0.1:6555`, Android 15.
- Appium `3.6.0`, UiAutomator2 `7.2.2`, XCUITest `11.4.0`, temporary loopback port `4725`.
- Xcode `26.2` (`17C52`), iPhone 17 Pro simulator `1892ED61-B3E5-4506-9F2D-C9F8C09EEB56`, iOS `26.2`.
- Flutter `3.38.6`, Dart `3.10.7`; isolated fixture copy under `.mobiloop/fixtures/flutter-ios-login-demo`.
- Android Studio's existing JBR `21.0.8` was selected through process-local `JAVA_HOME`/`PATH`; Android preflight then passed for both fixtures. No global Java installation was added.
- `DEVELOPER_DIR` selected the installed Xcode for build, simulator, Appium, and MCP processes. Global `xcode-select` was not changed.

Android used only `com.example.mobiloopnative` and `com.example.mobiloop_flutter_login_demo`. Those binaries were not rebuilt, reinstalled, or cleared, so this is not proof that the current Android source revision builds. The iOS suite ran the fixture unit test, called MobiLoop `ios.build_app`, installed its returned `.app`, and tested only `io.github.enessubass.mobiloopFlutterLoginDemo`.

MiniTakip and other user application data were not modified. Every session created by the runners was deleted, including negative-control sessions. The temporary Appium process was terminated after validation. Genymotion and the test simulator remain available; the user's pre-existing iPhone 16e simulator was not shut down. Appium's guarded session-discovery feature was not enabled merely to inventory sessions.

## Failures Found And Fixed

1. Failed Appium assertions and `found: false` could be treated as successful orchestration. Both platform loops now reject them, stop dependent steps, report failure, and close sessions.
2. Retry arguments retained the first session ID. Steps now copy their arguments, preserving the caller's input and using the new session on retry.
3. Android setup errors were not consistently structured, disabled failure evidence could still be captured, and numeric HTTP status values could break failure classification. Focused regression tests cover each behavior.
4. Flutter Android inputs exposed labels only through `hint`; semantic locators did not find them. Hint matching now works in text lookup, tapping, and accessibility summaries.
5. Input calls could succeed without entering Flutter Android text. iOS secure-field focus/clear could replace native elements and produce stale references. Shared text entry now focuses, reacquires after focus and clear, and retries only a rejected stale entry once. Both platforms passed the short-password and valid-input cases after this change.
6. A caught `InteractionJankMonitor` Java exception was classified as an app crash. Only explicit fatal/ANR signatures now count as crashes. Fatal events beyond 100 earlier warnings remain detectable, and root-cause text selects the blocking error instead of a renderer warning.
7. Standard plist DTD and Android namespace HTTP identifiers were classified as cleartext application traffic. Narrow metadata-context masking removes those false positives while preserving source line numbers. Tests retain real HTTP URLs, including values on the same line and URLs using those same hosts outside declaration contexts.

UI outcome assertions and deliberately failing controls were retained. Diagnostic classification changes have both false-positive and fatal-event regression tests. The intentionally failing controls remain failing validations and are recorded as such in each generated report.

## Security And Packaging

Final source scans covered eight native Android source/configuration files, three Flutter Android source/test files, and two iOS source/configuration files. None had critical/high findings. The native fixture retains one medium exported-component review signal: its launcher activity is deliberately exported and does not process external intent extras in the inspected fixture source. This is not an executed penetration test or a general exemption for exported components.

Generated security plans were not fully executed. Dependency audit reported zero known vulnerabilities after updating the MCP SDK minimum to `1.31.0`, locking SDK `1.32.1`, and locking transitive `proxy-addr` `2.0.8`.

The automated MCP stdio integration also verified denial without approval, an approved guarded source patch in an isolated workspace, scan comparison, a fresh scan and release gate, reporting, and path/endpoint restrictions. This is a real tool-contract test, not an independent evaluation of a model following the skill.

Lint, formatting, TypeScript compilation, static-site validation, skill frontmatter validation, and npm package dry run passed. The standalone skill ZIP contains only its instructions, license, and optional client metadata. No new runtime dependency or marketplace service was added.

The local `mobiloop-mcp:mobile-qa-local` Docker image built with all 84 tests passing and a clean production dependency audit. A read-only, network-disabled, non-root container completed a real stdio handshake, exposed 82 tools, returned effective policies, wrote a source scan to an explicit tmpfs artifact directory, and passed its release gate.

## Local Evidence

Raw artifacts are intentionally excluded from version control and distribution. Paths below are relative to the checkout:

- Android summary: `.mobiloop/runs/mobile-qa-device-2026-10-15T15-42-29-452Z/summary.json`.
- Native Android report: `.mobiloop/runs/mobile-qa-device-2026-10-15T15-42-29-452Z-android-kotlin-login-demo/reports/2026-10-15T15-43-23-652Z-mobiloop-report.md`.
- Flutter Android report: `.mobiloop/runs/mobile-qa-device-2026-10-15T15-42-29-452Z-flutter-login-demo/reports/2026-10-15T15-44-54-740Z-mobiloop-report.md`.
- iOS summary: `.mobiloop/runs/mobile-qa-ios-2026-10-15T15-42-32-932Z/summary.json`.
- iOS report: `.mobiloop/runs/mobile-qa-ios-2026-10-15T15-42-32-932Z/reports/2026-10-15T15-43-48-635Z-mobiloop-report.md`.
- iOS build log, unit-test log, screenshots, source, scoped simulator logs, and four iteration records are retained under that iOS run root. Each Android fixture has its own corresponding evidence and iteration root.

## Remaining Limits

This proves the listed scenarios on the listed local toolchain, not error-free operation on every app or agent. React Native runtime, physical iPhones, other Android/iOS versions, Windows/Linux device hosts, and every agent client were not validated here. Android source-to-device builds and complete dynamic security scenarios need separate runs.

The Appium run emitted a deprecated GET-session health-probe warning and XCUITest platform-version inference warnings. They did not fail the observed runs, but future driver compatibility and explicit platform-version selection remain follow-up work. No insecure Appium feature was enabled to silence a warning.

Reproduction and fixture preparation are documented in [SKILLS.md](../SKILLS.md). Use `npm test`, `npm run test:device`, and `npm run test:ios` within their documented prerequisites and explicitly selected test devices.
