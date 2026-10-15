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
13. Confirm the pipeline's GitHub pre-release, package tarball, skill ZIP, and SHA-256 checksums.
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

The GHCR workflow uploads an SBOM artifact and runs a blocking HIGH/CRITICAL Trivy scan for fixable vulnerabilities. MCP Registry publication depends on that image job succeeding. Do not bypass failed checks or remove main's required independent review to publish.

NPM publish is not enabled yet.

GitHub Pages deploys `docs/` automatically from the reviewed `main` branch through
`.github/workflows/deploy-pages.yml`.
