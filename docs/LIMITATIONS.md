# Limitations

- Hosted CI validates the package, not a real emulator loop.
- Real Android E2E requires a self-hosted runner or local machine with Android SDK and Appium.
- iOS automation requires macOS and Xcode.
- `orchestrator.run_android_validation_loop` exists; iOS orchestration parity is planned.
- Scenario generation is a starting point. Generated scenarios must be executed and refined with evidence.
- Flow memory can misidentify screens if checkpoints are weak or mostly dynamic.
- Text artifact and MCP/CLI text response redaction exists, but screenshot/OCR redaction and project-specific secret patterns still need host-side controls.
- Tool policy metadata and optional server-side enforcement exist, but final human-approval UX still depends on the MCP client.
- The default Android orchestrator validates and classifies; autonomous patch-and-retest remains an agent-layer workflow guarded by approval and review.
