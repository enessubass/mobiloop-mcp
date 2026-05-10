# Contributing

Thanks for helping improve MobiLoop MCP. This project is a tool layer that can change code, build apps, install APKs, and drive devices, so changes should preserve the guardrails by default.

## Development

```bash
npm ci
npm test
```

Use Node.js 20 or newer.

## Quality Bar

- Keep workspace path checks in place for every file operation.
- Do not add a generic shell execution tool.
- Keep secret-like files blocked by default.
- Add or update tests for behavior changes.
- Keep Appium actions semantic first. Coordinates should remain a fallback.
- Prefer evidence-producing verification over model-only assertions.

## Testing Mobile Changes

For Android behavior, test with a real device or emulator plus Appium UiAutomator2:

```bash
appium --address 127.0.0.1 --port 4723
```

Then run the relevant MCP tool flow against a sample app. Store generated artifacts under `.mobiloop`.

For iOS behavior, use macOS with Xcode and iOS Simulator. Linux and Windows cannot run iOS simulator workflows.

## Pull Requests

Include:

- What changed
- Why the change is needed
- Test commands and results
- Any new tool permissions or safety implications

Avoid unrelated refactors in the same PR.
