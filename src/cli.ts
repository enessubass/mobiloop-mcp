#!/usr/bin/env node
import fs from "node:fs/promises";
import { loadConfig } from "./config.js";
import { allTools } from "./tools/index.js";
import { enforceToolApproval, stripApproval } from "./utils/approval.js";
import { redactToolResponse } from "./utils/redaction.js";
import { enforceToolSecurityPolicy } from "./utils/security-policy.js";
import { describeToolWithPolicy } from "./utils/tool-policy.js";
import { runSetup } from "./setup.js";
import { runDoctor } from "./doctor.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || ["help", "--help", "-h"].includes(command)) {
    printHelp();
    return;
  }
  if (["setup", "doctor"].includes(command) && args.includes("--help")) return printHelp();
  if (command === "setup") return runSetup(args);
  if (command === "doctor") return runDoctor(args);

  if (command === "list-tools") {
    const config = await loadConfig();
    const tools = allTools(config.toolPolicies);
    if (args.includes("--json")) {
      console.log(
        JSON.stringify(
          tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            policy: tool.policy
          })),
          null,
          2
        )
      );
      return;
    }
    for (const tool of tools) {
      console.log(`${tool.name}\t${describeToolWithPolicy(tool)}`);
    }
    return;
  }

  if (command === "call") {
    const [toolName, rawJson = "{}", inputPath] = args;
    if (!toolName) throw new Error("Usage: mobiloop call <tool.name> '<json-args>'");
    const config = await loadConfig();
    const tool = allTools(config.toolPolicies).find((entry) => entry.name === toolName);
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);
    if (rawJson === "--file" && !inputPath) throw new Error("--file requires a JSON input path");
    const input = JSON.parse(rawJson === "--file" ? await fs.readFile(inputPath, "utf8") : rawJson);
    enforceToolSecurityPolicy(tool, input, config);
    enforceToolApproval(tool, input, config);
    const response = redactToolResponse(
      await tool.handler(stripApproval(input), { config }),
      config.redactArtifacts
    );
    if (response.isError) {
      const message = response.content
        .map((entry) => ("text" in entry ? entry.text : ""))
        .join("\n");
      throw new Error(message || "Tool returned an error");
    }
    for (const entry of response.content) {
      if ("text" in entry) process.stdout.write(`${entry.text}\n`);
    }
    return;
  }

  if (command === "generate-scenarios") {
    const goal = args.join(" ").trim();
    const config = await loadConfig();
    const tool = allTools(config.toolPolicies).find(
      (entry) => entry.name === "flow.generate_test_scenarios"
    );
    if (!tool) throw new Error("flow.generate_test_scenarios is not registered");
    const response = redactToolResponse(
      await tool.handler({ goal: goal || undefined }, { config }),
      config.redactArtifacts
    );
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
  mobiloop setup --workspace <project> --client codex|claude|cursor|vscode|generic --yes
  mobiloop setup --workspace <project> --client codex --dry-run
  mobiloop setup --workspace <project> --client codex --replace --yes
  mobiloop doctor --workspace <project> --target android|ios|flutter|react-native|ci|all [--json]
  mobiloop list-tools
  mobiloop list-tools --json
  mobiloop call <tool.name> '<json-args>'
  mobiloop call <tool.name> --file approved-input.json
  mobiloop generate-scenarios [goal text]

Environment:
  MOBILOOP_WORKSPACE_ROOT=/absolute/path/to/mobile/app
  MOBILOOP_CONFIG=/absolute/path/to/mobiloop.config.json
  MOBILOOP_SECURITY_MODE=secure|trusted
  APPIUM_SERVER_URL=http://127.0.0.1:4723
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
