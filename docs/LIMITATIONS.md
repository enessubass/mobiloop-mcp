# Limitations

- Hosted CI validates the package, not a real emulator loop.
- Real Android E2E requires a self-hosted runner or local machine with Android SDK and Appium.
- iOS automation requires macOS and Xcode.
- `orchestrator.run_android_validation_loop` exists; iOS orchestration parity is planned.
- Scenario generation is a starting point. Generated scenarios must be executed and refined with evidence.
- Flow memory can misidentify screens if checkpoints are weak or mostly dynamic.
- Secret redaction is not yet a full artifact sanitizer.
- Tool policy metadata is provided, but final human-approval UX depends on the MCP client.
