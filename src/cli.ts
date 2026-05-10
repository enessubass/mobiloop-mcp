#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { allTools } from "./tools/index.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || ["help", "--help", "-h"].includes(command)) {
    printHelp();
    return;
  }

  if (command === "list-tools") {
    for (const tool of allTools()) {
      console.log(`${tool.name}\t${tool.description}`);
    }
    return;
  }

  if (command === "call") {
    const [toolName, rawJson = "{}"] = args;
    if (!toolName) throw new Error("Usage: mobiloop call <tool.name> '<json-args>'");
    const tool = allTools().find((entry) => entry.name === toolName);
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);
    const input = JSON.parse(rawJson);
    const response = await tool.handler(input, { config: await loadConfig() });
    if (response.isError) {
      const message = response.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n");
      throw new Error(message || "Tool returned an error");
    }
    for (const entry of response.content) {
      if ("text" in entry) process.stdout.write(`${entry.text}\n`);
    }
    return;
  }

  if (command === "generate-scenarios") {
    const goal = args.join(" ").trim();
    const tool = allTools().find((entry) => entry.name === "flow.generate_test_scenarios");
    if (!tool) throw new Error("flow.generate_test_scenarios is not registered");
    const response = await tool.handler({ goal: goal || undefined }, { config: await loadConfig() });
    for (const entry of response.content) {
      if ("text" in entry) process.stdout.write(`${entry.text}\n`);
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function printHelp(): void {
  console.log(`MobiLoop CLI

Usage:
  mobiloop list-tools
  mobiloop call <tool.name> '<json-args>'
  mobiloop generate-scenarios [goal text]

Environment:
  MOBILOOP_WORKSPACE_ROOT=/absolute/path/to/mobile/app
  MOBILOOP_CONFIG=/absolute/path/to/mobiloop.config.json
  APPIUM_SERVER_URL=http://127.0.0.1:4723
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
