import { McpTool, ToolPolicy } from "../types.js";
import { appiumTools } from "./appium.js";
import { buildTools } from "./build.js";
import { ciTools } from "./ci.js";
import { codeTools } from "./code.js";
import { deviceTools } from "./device.js";
import { envTools } from "./env.js";
import { flowTools } from "./flow.js";
import { iosTools } from "./ios.js";
import { loopTools } from "./loop.js";
import { orchestratorTools } from "./orchestrator.js";
import { policyTools } from "./policy.js";
import { verifyTools } from "./verify.js";
import { attachToolPolicies } from "../utils/tool-policy.js";

export function allTools(policyOverrides: Record<string, Partial<ToolPolicy>> = {}): McpTool[] {
  let configuredTools: McpTool[] = [];
  const baseTools = [
    ...codeTools(),
    ...envTools(),
    ...buildTools(),
    ...deviceTools(),
    ...iosTools(),
    ...appiumTools(),
    ...verifyTools(),
    ...flowTools(),
    ...loopTools(),
    ...ciTools(),
    ...orchestratorTools(),
    ...policyTools(() => configuredTools)
  ];
  configuredTools = attachToolPolicies(baseTools, policyOverrides);
  return configuredTools;
}
