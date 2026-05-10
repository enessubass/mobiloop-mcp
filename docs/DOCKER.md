# Docker Packaging

## Recommendation

Use Docker to package and distribute the MCP server itself. Do not try to force every mobile runtime into one universal container.

The practical split is:

```text
Docker image
  - Node runtime
  - compiled MCP server
  - git/ripgrep/sqlite helpers

Host or dedicated runner
  - Android SDK / emulator / physical device
  - Appium server and platform drivers
  - Flutter / Gradle / React Native toolchains
  - Xcode / iOS Simulator on macOS
```

This keeps MCP reproducible while respecting the hard platform constraints of mobile builds.

## Why Not One Giant Container?

- iOS simulator and Xcode require macOS. Linux Docker containers cannot run them.
- Android emulators in Docker require KVM, privileged/device mounts, and host-specific setup. This is possible on Linux runners but not a portable default.
- Physical devices are host resources. `adb` access depends on USB/network forwarding and permissions.
- Appium can run inside or outside Docker, but device connectivity is usually simpler when Appium runs on the same host as the emulator/device.

## Build Image

```bash
docker build -t mobiloop-mcp:local .
```

## Published Image

MobiLoop MCP is published to GitHub Container Registry:

```bash
docker pull ghcr.io/enessubass/mobiloop-mcp:latest
```

The image is built from this repository and is intended to run the MCP server only. Mobile SDKs, Appium, emulators, simulators, and physical devices should stay on the host or a dedicated runner.

## Run As MCP Server

For stdio MCP clients, the container must run with an interactive stdin:

```bash
docker run --rm -i \
  -e MOBILOOP_WORKSPACE_ROOT=/workspace \
  -e APPIUM_SERVER_URL=http://host.docker.internal:4723 \
  -v /absolute/path/to/mobile/app:/workspace \
  ghcr.io/enessubass/mobiloop-mcp:latest
```

On Linux, add host gateway mapping if needed:

```bash
docker run --rm -i \
  --add-host=host.docker.internal:host-gateway \
  -e MOBILOOP_WORKSPACE_ROOT=/workspace \
  -e APPIUM_SERVER_URL=http://host.docker.internal:4723 \
  -v /absolute/path/to/mobile/app:/workspace \
  ghcr.io/enessubass/mobiloop-mcp:latest
```

## MCP Client Config For Docker

```json
{
  "mcpServers": {
    "mobiloop": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--add-host=host.docker.internal:host-gateway",
        "-e",
        "MOBILOOP_WORKSPACE_ROOT=/workspace",
        "-e",
        "APPIUM_SERVER_URL=http://host.docker.internal:4723",
        "-v",
        "/absolute/path/to/mobile/app:/workspace",
        "ghcr.io/enessubass/mobiloop-mcp:latest"
      ]
    }
  }
}
```

## Compose

`docker-compose.example.yml` is a template. Replace `/absolute/path/to/mobile/app` before use.

```bash
docker compose -f docker-compose.example.yml build
```

Compose is less useful for stdio MCP clients because MCP clients usually spawn a command directly. Use the raw `docker run` command in the MCP client config for normal use.

## Android In Docker

Two supported patterns:

1. Recommended: run Android SDK, emulator/device, and Appium on the host or self-hosted runner. Run MCP in Docker and point `APPIUM_SERVER_URL` at the host Appium.
2. Advanced Linux-only: build a custom runner image with Android SDK and Appium, run with KVM/device privileges, and expose adb/Appium inside the container. This is environment-specific and not provided as the default image.

## iOS

iOS workflows are not Docker portable. Run the MCP server directly on a macOS runner for iOS, or run only non-iOS MCP tools in Docker and keep iOS tools on the macOS host.

## Preflight

Always call:

```text
env.preflight
```

before a build/test loop. In Docker, this checks the container view of the world, which may differ from the host. If Appium and devices run on the host, configure `APPIUM_SERVER_URL` and use host-side device tools when needed.
