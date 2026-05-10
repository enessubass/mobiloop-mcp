import { McpTool, ToolPolicy, jsonResponse } from "../types.js";
import { booleanSchema, enumSchema, objectSchema, stringSchema } from "../schema.js";
import { asObject, optionalBoolean, optionalString } from "../utils/validation.js";

export function policyTools(getTools: () => McpTool[]): McpTool[] {
  return [
    {
      name: "policy.list_tools",
      description: "List effective tool policy metadata for MCP clients and approval gates.",
      inputSchema: objectSchema({
        riskLevel: enumSchema(["read", "write", "device", "network", "git", "dangerous"]),
        requiresApproval: booleanSchema,
        includeDescriptions: booleanSchema,
        toolName: stringSchema
      }),
      async handler(input) {
        const args = asObject(input ?? {});
        const riskLevel = optionalString(args, "riskLevel");
        const requiresApproval = optionalBoolean(args, "requiresApproval");
        const includeDescriptions = optionalBoolean(args, "includeDescriptions") ?? true;
        const toolName = optionalString(args, "toolName");
        const tools = getTools()
          .filter((tool) => !toolName || tool.name === toolName)
          .filter((tool) => !riskLevel || tool.policy?.riskLevel === riskLevel)
          .filter(
            (tool) =>
              requiresApproval === undefined || tool.policy?.requiresApproval === requiresApproval
          )
          .map((tool) => ({
            name: tool.name,
            ...(includeDescriptions ? { description: tool.description } : {}),
            policy: tool.policy as ToolPolicy
          }));
        return jsonResponse({ tools });
      }
    }
  ];
}
