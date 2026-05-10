import fs from "node:fs/promises";
import path from "node:path";
import { McpTool, jsonResponse } from "../types.js";
import { arraySchema, numberSchema, objectSchema, stringSchema } from "../schema.js";
import {
  asObject,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requireString
} from "../utils/validation.js";
import { ensureArtifactsDir, writeArtifactText } from "../utils/artifacts.js";

export function loopTools(): McpTool[] {
  return [
    {
      name: "loop.record_iteration",
      description: "Append one build-test-fix loop iteration as JSONL evidence.",
      inputSchema: objectSchema(
        {
          iteration: numberSchema,
          goal: stringSchema,
          build: stringSchema,
          device: stringSchema,
          test_result: stringSchema,
          failure: stringSchema,
          root_cause: stringSchema,
          fix: stringSchema,
          retest: stringSchema,
          artifacts: arraySchema(stringSchema)
        },
        ["iteration", "goal", "test_result"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const iteration = optionalNumber(args, "iteration");
        if (iteration === undefined) throw new Error("iteration is required");
        const record = {
          timestamp: new Date().toISOString(),
          iteration,
          goal: requireString(args, "goal"),
          build: optionalString(args, "build") ?? "unknown",
          device: optionalString(args, "device") ?? "unknown",
          test_result: requireString(args, "test_result"),
          failure: optionalString(args, "failure"),
          root_cause: optionalString(args, "root_cause"),
          fix: optionalString(args, "fix"),
          retest: optionalString(args, "retest"),
          artifacts: optionalStringArray(args, "artifacts") ?? []
        };
        const dir = await ensureArtifactsDir(config, "loop");
        const filePath = path.join(dir, "iterations.jsonl");
        await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
        return jsonResponse({ recorded: true, filePath, record: record as never });
      }
    },
    {
      name: "loop.generate_report",
      description: "Generate a Markdown report from recorded iterations.",
      inputSchema: objectSchema(
        {
          title: stringSchema,
          finalStatus: stringSchema,
          summary: stringSchema
        },
        []
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const title = optionalString(args, "title") ?? "MobiLoop Development Report";
        const finalStatus = optionalString(args, "finalStatus") ?? "unknown";
        const summary = optionalString(args, "summary") ?? "";
        const records = await readIterations(config.artifactsDir);
        const markdown = renderReport(title, finalStatus, summary, records);
        const reportPath = await writeArtifactText(
          config,
          "reports",
          "mobiloop-report",
          "md",
          markdown
        );
        return jsonResponse({ reportPath, finalStatus, iterations: records.length });
      }
    },
    {
      name: "loop.read_iterations",
      description: "Read recorded loop iterations.",
      inputSchema: objectSchema({}),
      async handler(_input, { config }) {
        const records = await readIterations(config.artifactsDir);
        return jsonResponse({ iterations: records as never });
      }
    }
  ];
}

async function readIterations(artifactsDir: string): Promise<Array<Record<string, unknown>>> {
  const filePath = path.join(artifactsDir, "loop", "iterations.jsonl");
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function renderReport(
  title: string,
  finalStatus: string,
  summary: string,
  records: Array<Record<string, unknown>>
): string {
  const lines = [
    `# ${title}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Final status: ${finalStatus}`,
    ""
  ];
  if (summary) {
    lines.push("## Summary", "", summary, "");
  }
  lines.push("## Iterations", "");
  if (records.length === 0) {
    lines.push("No iterations recorded.", "");
    return lines.join("\n");
  }
  for (const record of records) {
    lines.push(
      `### Iteration ${record.iteration ?? "?"}`,
      "",
      `- Goal: ${record.goal ?? ""}`,
      `- Build: ${record.build ?? "unknown"}`,
      `- Device: ${record.device ?? "unknown"}`,
      `- Test result: ${record.test_result ?? "unknown"}`,
      `- Failure: ${record.failure ?? ""}`,
      `- Root cause: ${record.root_cause ?? ""}`,
      `- Fix: ${record.fix ?? ""}`,
      `- Retest: ${record.retest ?? ""}`
    );
    const artifacts = Array.isArray(record.artifacts) ? record.artifacts : [];
    if (artifacts.length > 0) {
      lines.push("- Artifacts:");
      for (const artifact of artifacts) {
        lines.push(`  - ${artifact}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}
