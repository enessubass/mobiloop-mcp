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

It is manual because public hosted runners do not provide a stable Android emulator/Appium environment for every project. On a configured self-hosted runner it is intended to be the real proof pipeline for the Flutter fixture.

## Release

GHCR publish is manual or tag-triggered through `.github/workflows/publish-ghcr.yml`.
