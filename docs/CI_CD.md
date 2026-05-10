# CI/CD

## Default Hosted CI

The default GitHub workflow proves package health:

1. `npm ci`
2. `npm run format:check`
3. `npm run lint`
4. `npm run typecheck`
5. `npm test`
6. `npm audit --audit-level=high`
7. `npm run pack:check`
8. Docker build

This does not prove a real emulator/Appium loop.

## Self-Hosted Android Validation

Use a self-hosted runner when you need a real mobile proof:

```text
self-hosted runner
  -> Android SDK
  -> hardware acceleration or physical device
  -> Appium 2 + UiAutomator2
  -> mobile app workspace
  -> MobiLoop CLI/MCP
```

The validation job should:

- boot or select a device
- start Appium
- build the sample app
- install APK
- create Appium session
- run `flow.run_script`
- call `verify.collect_evidence`
- upload `.mobiloop`

The repository includes a concrete self-hosted workflow:

```text
.github/workflows/android-fixture-e2e.yml
```

It can be run manually, runs nightly, and also runs for PRs labeled `android-e2e`. Public hosted runners do not provide a stable Android emulator/Appium environment for every project, so this workflow still requires a configured self-hosted runner.

The workflow boots the configured AVD when requested, verifies `adb devices`, builds the Flutter fixture APK, starts Appium, runs `orchestrator.run_android_validation_loop`, and uploads `.mobiloop` artifacts.

Configure the runner with either the default `Pixel_7_API_35` AVD or a repository variable:

```text
MOBILOOP_ANDROID_AVD_NAME=Pixel_7_API_35
```

## Release

GHCR publish is manual or tag-triggered through `.github/workflows/publish-ghcr.yml`. The publish workflow emits an SBOM artifact and runs a non-blocking Trivy HIGH/CRITICAL image scan so alpha images are observable without blocking on upstream base-image advisories.
