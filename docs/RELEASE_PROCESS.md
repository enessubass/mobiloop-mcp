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
6. Run `npm run pack:check`.
7. Build Docker locally.
8. Push to `main`.
9. Confirm CI.
10. Create a Git tag.
11. Run GHCR publish.
12. Smoke test the pulled image.

## Current Publishing

The project publishes container images to:

```text
ghcr.io/enessubass/mobiloop-mcp:latest
```

NPM publish is not enabled yet.
