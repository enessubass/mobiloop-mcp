import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { allTools } from "./tools/index.js";

export async function runDoctor(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      workspace: { type: "string" },
      target: { type: "string", default: "all" },
      json: { type: "boolean" }
    }
  });
  if (values.workspace) process.env.MOBILOOP_WORKSPACE_ROOT = path.resolve(values.workspace);
  const config = await loadConfig();
  const tools = new Map(allTools(config.toolPolicies).map((tool) => [tool.name, tool]));
  const preflight = await tools
    .get("env.preflight")!
    .handler({ target: values.target }, { config });
  const payload = JSON.parse(
    preflight.content.map((part) => ("text" in part ? part.text : "")).join("\n")
  );
  const fixes = payload.checks
    .filter((check: { ok: boolean }) => !check.ok)
    .map((check: { name: string; required: boolean; detail: string }) => ({
      name: check.name,
      required: check.required,
      detail: check.detail,
      action: suggestedFix(check.name)
    }));
  const result = {
    ...payload,
    fixes,
    changedHost: false,
    scope:
      "Host/tool readiness only; select a device and create a platform-driver session before claiming device readiness. No SDKs, drivers, servers, or app data were changed."
  };
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`MobiLoop doctor: ${payload.passed ? "PASS" : "NOT READY"} (${payload.target})`);
    for (const check of payload.checks)
      console.log(
        `${check.ok ? "OK" : check.required ? "FAIL" : "WARN"} ${check.name}: ${check.detail}`
      );
    for (const fix of fixes) console.log(`Next: ${fix.action}`);
    console.log(result.scope);
  }
  if (!payload.passed) process.exitCode = 1;
}

function suggestedFix(name: string): string {
  if (name.includes("adb") || name.includes("emulator"))
    return "Install Android SDK platform-tools/emulator and add their directories to PATH; set ANDROID_HOME and ANDROID_SDK_ROOT. Genymotion devices must also appear in adb devices -l.";
  if (name.includes("java"))
    return "Use the Android project's supported JDK. Android Studio's bundled JBR can supply JAVA_HOME; add JAVA_HOME/bin to PATH for the agent and Appium processes.";
  if (name.includes("flutter"))
    return "Install Flutter and run flutter doctor -v with its bin directory on the agent's PATH.";
  if (/xcrun|xcodebuild|macOS/.test(name))
    return "iOS requires macOS and full Xcode. Select its developer directory with process-local DEVELOPER_DIR and install a simulator runtime.";
  if (name === "appium")
    return "Start Appium on the configured loopback endpoint with the compatible UiAutomator2 (Android) or XCUITest (iOS) driver. env.ensure_appium can assist after explicit approval; doctor never installs or starts it.";
  if (name.includes("git"))
    return "Install Git and expose it on the agent's PATH; initialize a repository only when source changes are in scope.";
  if (name.includes("workspace") || name.includes("artifacts"))
    return "Select an existing mobile project directory and a writable local artifact directory.";
  if (name.includes("node") || name.includes("npm"))
    return "Install a supported Node.js version with npm and make both available to the agent.";
  return "Check the reported tool/path. Optional warnings do not block unrelated workflows.";
}
