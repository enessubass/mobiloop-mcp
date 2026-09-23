import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { McpTool, errorResponse } from "./types.js";
import { enforceToolApproval, stripApproval } from "./utils/approval.js";
import { redactToolResponse } from "./utils/redaction.js";
import { enforceToolSecurityPolicy } from "./utils/security-policy.js";
import { attachToolPolicies, describeToolWithPolicy } from "./utils/tool-policy.js";
import { PACKAGE_VERSION } from "./version.js";

export async function runMcpServer(name: string, tools: McpTool[]): Promise<void> {
  const config = await loadConfig();
  const configuredTools = attachToolPolicies(tools, config.toolPolicies);
  const toolByName = new Map(configuredTools.map((tool) => [tool.name, tool]));

  const server = new Server(
    {
      name,
      version: PACKAGE_VERSION
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: configuredTools.map((tool) => ({
      name: tool.name,
      description: describeToolWithPolicy(tool),
      inputSchema: tool.inputSchema
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolByName.get(request.params.name);
    if (!tool) {
      return errorResponse(`Unknown tool: ${request.params.name}`);
    }
    try {
      const input = request.params.arguments ?? {};
      enforceToolSecurityPolicy(tool, input, config);
      enforceToolApproval(tool, input, config);
      return redactToolResponse(
        await tool.handler(stripApproval(input), { config }),
        config.redactArtifacts
      );
    } catch (error) {
      return redactToolResponse(errorResponse(error), config.redactArtifacts);
    }
  });

  await server.connect(new StdioServerTransport());
}

export function runAndExitOnError(name: string, tools: McpTool[]): void {
  runMcpServer(name, tools).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
    );
    process.exit(1);
  });
}
