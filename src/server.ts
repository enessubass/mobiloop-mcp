import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { McpTool, errorResponse } from "./types.js";

export async function runMcpServer(name: string, tools: McpTool[]): Promise<void> {
  const config = await loadConfig();
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));

  const server = new Server(
    {
      name,
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolByName.get(request.params.name);
    if (!tool) {
      return errorResponse(`Unknown tool: ${request.params.name}`);
    }
    try {
      return await tool.handler(request.params.arguments ?? {}, { config });
    } catch (error) {
      return errorResponse(error);
    }
  });

  await server.connect(new StdioServerTransport());
}

export function runAndExitOnError(name: string, tools: McpTool[]): void {
  runMcpServer(name, tools).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  });
}
