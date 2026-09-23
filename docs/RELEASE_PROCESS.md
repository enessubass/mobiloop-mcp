# Release Process

## Versioning

Use SemVer:

- patch: bug fix, docs, non-breaking evidence fields
- minor: new tools or optional inputs
- major: breaking tool input/output changes

## Checklist

1. Update `CHANGELOG.md`.
2. Run `npm run format:check`.
3. Run `npm run lint`.
4. Run `npm run typecheck`.
5. Run `npm test`.
6. Run `npm run site:check`.
7. Run `npm run pack:check`.
8. Build Docker locally.
9. Merge the reviewed pull request to `main`.
10. Confirm CI and GitHub Pages deployment.
11. Create a Git tag.
12. Confirm GHCR and MCP Registry publish.
13. Create a GitHub pre-release with the matching release notes.
14. Smoke test the pulled image.

## Current Publishing

The project publishes container images to:

```text
ghcr.io/enessubass/mobiloop-mcp:latest
```

Tag builds also publish the SemVer tag, for example:

```text
ghcr.io/enessubass/mobiloop-mcp:<version>
ghcr.io/enessubass/mobiloop-mcp:v<version>
```

The GHCR workflow uploads an SBOM artifact and runs a non-blocking HIGH/CRITICAL Trivy scan. Treat scan findings as release review input during the alpha phase.

NPM publish is not enabled yet.

GitHub Pages deploys `docs/` automatically from the reviewed `main` branch through
`.github/workflows/deploy-pages.yml`.
