import { McpTool, ToolPolicy, ToolRiskLevel } from "../types.js";

type PolicyOverride = Partial<ToolPolicy>;

const READ_POLICY: ToolPolicy = {
  riskLevel: "read",
  requiresApproval: false,
  allowedInCi: true,
  allowedInInteractive: true,
  writesWorkspace: false,
  writesDevice: false,
  networkAccess: false,
  producesArtifacts: false
};

export function attachToolPolicies(
  tools: McpTool[],
  overrides: Record<string, PolicyOverride> = {}
): McpTool[] {
  return tools.map((tool) => ({
    ...tool,
    policy: { ...policyForTool(tool.name), ...(overrides[tool.name] ?? {}) }
  }));
}

export function policyForTool(toolName: string): ToolPolicy {
  const policy = policyForPrefix(toolName);
  return { ...policy, ...explicitPolicy(toolName) };
}

function policyForPrefix(toolName: string): ToolPolicy {
  if (toolName.startsWith("code.")) return writePolicy("write", true);
  if (toolName.startsWith("build.")) return writePolicy("network", true);
  if (toolName.startsWith("device.")) return devicePolicy(false);
  if (toolName.startsWith("ios.")) return devicePolicy(false);
  if (toolName.startsWith("appium.")) return devicePolicy(false);
  if (toolName.startsWith("verify.")) return artifactPolicy("read");
  if (toolName.startsWith("flow.")) return artifactPolicy("read");
  if (toolName.startsWith("loop.")) return artifactPolicy("read");
  if (toolName.startsWith("ci.")) return writePolicy("network", false);
  if (toolName.startsWith("orchestrator.")) return devicePolicy(true);
  return READ_POLICY;
}

function explicitPolicy(toolName: string): PolicyOverride {
  switch (toolName) {
    case "code.read_file":
    case "code.search_code":
    case "code.git_diff":
    case "build.detect_project":
    case "build.collect_build_logs":
    case "build.run_lint":
    case "build.run_unit_tests":
    case "env.preflight":
    case "env.compatibility_matrix":
    case "device.list_devices":
    case "device.capture_screenshot":
    case "device.pull_logs":
    case "ios.list_simulators":
    case "ios.capture_screenshot":
    case "ios.collect_logs":
    case "appium.observe_screen":
    case "appium.get_page_source":
    case "appium.get_accessibility_tree":
    case "appium.wait_for_visible":
    case "appium.assert_visible":
    case "appium.assert_not_visible":
    case "verify.assert_screen_contains_text":
    case "verify.assert_no_crash_in_logcat":
    case "verify.assert_appium_session_healthy":
    case "verify.assert_navigation_reached":
    case "verify.assert_accessibility_labels":
    case "verify.assert_screenshot_diff":
    case "verify.hash_artifact":
    case "flow.analyze_from_code":
    case "flow.generate_test_scenarios":
    case "flow.plan_replay":
    case "flow.read_memory":
    case "loop.read_iterations":
    case "ci.collect_artifact_manifest":
      return {
        ...artifactPolicy("read"),
        requiresApproval: false,
        writesDevice: false,
        networkAccess: false,
        approvalReason: undefined
      };
    case "env.ensure_appium":
      return {
        ...writePolicy("network", true),
        approvalReason: "Can install Appium drivers or start an Appium server when requested."
      };
    case "flow.record_checkpoint":
    case "flow.record_test_run":
    case "loop.record_iteration":
    case "loop.generate_report":
    case "ci.write_github_step_summary":
    case "ci.create_github_annotations":
      return { ...artifactPolicy("write"), writesWorkspace: true };
    case "verify.assert_api_response":
      return { ...artifactPolicy("network"), networkAccess: true };
    case "code.apply_patch":
      return { ...approval("Modifies source files inside workspaceRoot."), writesWorkspace: true };
    case "code.create_branch":
    case "code.commit_changes":
    case "code.open_pr":
      return {
        ...approval("Changes repository state or publishes repository metadata."),
        writesWorkspace: true
      };
    case "build.install_dependencies":
      return {
        ...approval("Installs dependencies and may reach package registries."),
        writesWorkspace: true,
        networkAccess: true
      };
    case "build.build_release_candidate":
      return { ...approval("Creates release candidate artifacts."), writesWorkspace: true };
    case "build.build_debug_apk":
      return {
        ...artifactPolicy("write"),
        writesWorkspace: true,
        approvalReason: undefined
      };
    case "device.install_app":
    case "device.uninstall_app":
    case "device.clear_app_data":
    case "device.grant_permissions":
    case "device.start_emulator":
    case "device.stop_emulator":
    case "ios.boot_simulator":
    case "ios.shutdown_simulator":
    case "ios.install_app":
    case "ios.launch_app":
      return { ...approval("Mutates simulator, emulator, or device state."), writesDevice: true };
    case "appium.tap_coordinates":
      return {
        ...approval("Uses coordinate interaction, which is intentionally a last-resort action."),
        writesDevice: true
      };
    case "flow.run_script":
    case "flow.replay_to_checkpoint":
    case "orchestrator.run_android_validation_loop":
      return {
        ...approval("Runs a multi-step automation loop that can mutate app and device state."),
        writesDevice: true
      };
    case "flow.clear_memory":
      return { ...approval("Deletes flow-memory state."), writesWorkspace: true };
    case "ci.comment_pr":
      return { ...approval("Writes to a pull request over the network."), networkAccess: true };
    default:
      return {};
  }
}

function artifactPolicy(riskLevel: ToolRiskLevel): ToolPolicy {
  return {
    ...READ_POLICY,
    riskLevel,
    producesArtifacts: true
  };
}

function writePolicy(riskLevel: ToolRiskLevel, requiresApproval: boolean): ToolPolicy {
  return {
    ...READ_POLICY,
    riskLevel,
    requiresApproval,
    writesWorkspace: true,
    networkAccess: riskLevel === "network",
    approvalReason: requiresApproval
      ? "Can change files, dependencies, or repository state."
      : undefined
  };
}

function devicePolicy(requiresApproval: boolean): ToolPolicy {
  return {
    ...READ_POLICY,
    riskLevel: requiresApproval ? "dangerous" : "device",
    requiresApproval,
    writesDevice: true,
    producesArtifacts: true,
    approvalReason: requiresApproval ? "Can execute a bounded device automation loop." : undefined
  };
}

function approval(approvalReason: string): PolicyOverride {
  return {
    riskLevel: "dangerous",
    requiresApproval: true,
    allowedInCi: false,
    allowedInInteractive: true,
    approvalReason
  };
}
