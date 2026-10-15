# Installation And First Use

MobiLoop runs locally. No marketplace account, model API key, or hosted MobiLoop service is required. Your AI client supplies the reasoning. Android SDK, Xcode, framework SDKs, Appium, and drivers remain host prerequisites; MobiLoop does not bundle a universal emulator.

## Install A Stable Source Checkout

Use Node.js 20 or later and Git. Keep the checkout at a stable path: generated MCP configurations point to its built server and the Node executable used by setup.

```bash
git clone https://github.com/enessubass/mobiloop-mcp.git
cd mobiloop-mcp
npm ci
npm run build
```

NPM registry publication is not enabled. Do not assume `npx mobiloop-mcp@latest` contains this work. GHCR containers and downloadable package/skill assets are separate release outputs. The source route is recommended for host-side builds and devices. Docker needs deliberate access to host SDKs/Appium; installing a container does not install them.

## One Setup Command

From the MobiLoop checkout, select the existing mobile project:

```bash
node dist/src/cli.js setup --workspace /absolute/path/to/mobile-app --client codex --yes
```

PowerShell supports the same arguments with quoted Windows paths:

```powershell
node .\dist\src\cli.js setup --workspace "C:\Projects\My Mobile App" --client vscode --yes
```

In an interactive terminal, `node dist/src/cli.js setup` asks for project, client, and confirmation. Non-interactive invocations require `--workspace`, `--client`, and `--yes`, or `--dry-run`.

| Client          | Project MCP configuration     | Skill directory                     |
| --------------- | ----------------------------- | ----------------------------------- |
| Codex           | `.codex/config.toml`          | `.agents/skills/mobiloop-mobile-qa` |
| Claude Code     | `.mcp.json`                   | `.claude/skills/mobiloop-mobile-qa` |
| Cursor          | `.cursor/mcp.json`            | `.agents/skills/mobiloop-mobile-qa` |
| VS Code/Copilot | portable `.mcp.json`          | `.agents/skills/mobiloop-mobile-qa` |
| Generic         | `.mobiloop/mcp.json` fragment | `.agents/skills/mobiloop-mobile-qa` |

For `generic`, import the fragment into your client's supported location; automatic discovery is not assumed. Client format support does not prove every model/client follows the skill correctly.

Setup keeps secure mode and captures only toolchain variables: `PATH`, `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `DEVELOPER_DIR`, `APPIUM_HOME`. It copies no API keys or account tokens. Review machine-specific paths before sharing configuration. Setup does not change global client settings, install SDKs/drivers, start servers, modify app source/data, or authorize future tool actions.

Reload the agent and review its MCP trust prompt. Confirm `policy.list_tools` and `build.detect_project` are callable. Codex setup writes `tool_timeout_sec = 1800` so first mobile builds and driver startup are not cut off by its default 60-second tool deadline; this is a per-call ceiling, not extra consent or a reset of the skill's shared run budget. See the [official OpenAI MCP configuration](https://learn.chatgpt.com/docs/extend/mcp). Other clients retain their own timeout settings; adjust them for long builds separately from MobiLoop command limits.

## Preview, Existing Settings, And Upgrades

```bash
node dist/src/cli.js setup --workspace /absolute/path/to/mobile-app --client cursor --dry-run
```

Setup parses and preserves unrelated servers/settings. New TOML sections are appended without removing comments. The same setup is idempotent. Invalid JSON/TOML, symbolic-link destinations, and conflicting MobiLoop entries/customized skills stop before writes. JSON client files must be strict JSON; JSONC requires manual review instead of silent comment removal.

After reviewing a conflict, use `--replace --yes` to intentionally update the MobiLoop entry or bundled skill. Exact original files are backed up under `.mobiloop/setup-backups/`; setup adds `.mobiloop/` to `.gitignore` if missing. Backups can contain credentials from existing configuration: keep them private. Other servers remain intact. Replacing a Codex entry may reserialize TOML comments, with the original retained in its backup. Extra skill files are not deleted.

## Diagnose Prerequisites

```bash
node dist/src/cli.js doctor --workspace /absolute/path/to/mobile-app --target android
node dist/src/cli.js doctor --workspace /absolute/path/to/mobile-app --target ios --json
```

Targets: `android`, `ios`, `flutter`, `react-native`, `ci`, `all`. `all` checks every toolchain; choose a specific target if the machine does not need iOS/Flutter. Doctor returns nonzero for required failures and supplies repair guidance without mutating the host. Explicit device selection and an Appium session are still necessary to establish device/driver readiness.

Android: set `ANDROID_HOME`/`ANDROID_SDK_ROOT`, expose SDK `platform-tools` and `emulator` on `PATH`, use the project's supported JDK, and confirm `adb devices -l`. Android Studio's JBR can supply Java without a global installation. A Genymotion window alone does not prove responsive ADB/screen access.

iOS: use macOS, full Xcode and a simulator runtime. Set process-local `DEVELOPER_DIR` if Command Line Tools are globally selected. Configure the same environment for the GUI agent and Appium, not just a terminal they do not inherit.

Appium: use compatible UiAutomator2/XCUITest drivers and loopback, default `http://127.0.0.1:4723`. Use `--appium-url http://127.0.0.1:4725` in setup for another local port. Downloads require network access and authorization; existing tooling does not require a MobiLoop cloud service.

Continue with the [Flutter quickstart](QUICKSTART_FLUTTER.md), [skill workflow](SKILLS.md), and [test strategy](TEST_STRATEGY.md).

## Validation

`npm test` covers preservation, backups, idempotency, previews, unsafe destinations, missing-tool diagnostics, and generated-config MCP startup. `npm run test:install` packs and installs the built project in a clean temporary directory with spaces, then runs setup, doctor, MCP discovery, and approval checks from that installed copy. It uses no global installation and removes its temporary workspace.

Formats were checked against official [Codex MCP](https://developers.openai.com/codex/mcp/), [Codex skills](https://developers.openai.com/codex/skills/), [Claude MCP](https://code.claude.com/docs/en/mcp), [Cursor MCP](https://cursor.com/docs/context/mcp), [Cursor skills](https://cursor.com/docs/skills), and [VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers) documentation. Client trust and approvals remain enabled.
