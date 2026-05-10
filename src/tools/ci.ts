import fs from "node:fs/promises";
import path from "node:path";
import { McpTool, jsonResponse } from "../types.js";
import { arraySchema, objectSchema, stringSchema } from "../schema.js";
import {
  asObject,
  optionalString,
  optionalStringArray,
  requireString
} from "../utils/validation.js";
import { resolveWorkspacePathAllowArtifacts } from "../utils/path-guard.js";
import { runCommand } from "../utils/shell.js";
import { ensureArtifactsDir, writeArtifactText } from "../utils/artifacts.js";

export function ciTools(): McpTool[] {
  return [
    {
      name: "ci.collect_artifact_manifest",
      description: "Create a JSON manifest of files under the MCP artifacts directory.",
      inputSchema: objectSchema({}),
      async handler(_input, { config }) {
        const files = await listFiles(config.artifactsDir);
        const manifest = {
          generatedAt: new Date().toISOString(),
          artifactsDir: config.artifactsDir,
          files
        };
        const manifestPath = await writeArtifactText(
          config,
          "reports",
          "artifact-manifest",
          "json",
          JSON.stringify(manifest, null, 2)
        );
        return jsonResponse({ manifestPath, files: files.length });
      }
    },
    {
      name: "ci.write_github_step_summary",
      description: "Append Markdown to GitHub Actions step summary or a workspace fallback file.",
      inputSchema: objectSchema(
        {
          markdown: stringSchema,
          sourcePath: stringSchema
        },
        []
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const sourcePath = optionalString(args, "sourcePath");
        const markdown = sourcePath
          ? await fs.readFile(resolveWorkspacePathAllowArtifacts(config, sourcePath), "utf8")
          : requireString(args, "markdown");
        const summaryPath = process.env.GITHUB_STEP_SUMMARY
          ? process.env.GITHUB_STEP_SUMMARY
          : path.join(await ensureArtifactsDir(config, "reports"), "github-step-summary.md");
        await fs.appendFile(summaryPath, `${markdown}\n`, "utf8");
        return jsonResponse({ summaryPath, bytes: Buffer.byteLength(markdown) });
      }
    },
    {
      name: "ci.comment_pr",
      description:
        "Create a GitHub PR comment through gh. Uses current PR when prNumber is omitted.",
      inputSchema: objectSchema(
        {
          body: stringSchema,
          bodyPath: stringSchema,
          prNumber: stringSchema
        },
        []
      ),
      async handler(input, { config }) {
        const args = asObject(input ?? {});
        const bodyPath = optionalString(args, "bodyPath");
        const body = bodyPath
          ? await fs.readFile(resolveWorkspacePathAllowArtifacts(config, bodyPath), "utf8")
          : requireString(args, "body");
        const prNumber = optionalString(args, "prNumber");
        const ghArgs = ["pr", "comment", ...(prNumber ? [prNumber] : []), "--body", body];
        const result = await runCommand("gh", ghArgs, {
          cwd: config.workspaceRoot,
          config,
          timeoutMs: 120_000
        });
        return jsonResponse({
          prNumber,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim()
        });
      }
    },
    {
      name: "ci.create_github_annotations",
      description: "Emit GitHub Actions warning/error annotations from findings.",
      inputSchema: objectSchema(
        {
          level: stringSchema,
          title: stringSchema,
          findings: arraySchema(stringSchema)
        },
        ["findings"]
      ),
      async handler(input) {
        const args = asObject(input);
        const level = optionalString(args, "level") ?? "warning";
        if (!["notice", "warning", "error"].includes(level)) {
          throw new Error("level must be notice, warning, or error");
        }
        const title = optionalString(args, "title") ?? "MobiLoop MCP";
        const findings = optionalStringArray(args, "findings") ?? [];
        const lines = findings.map(
          (finding) => `::${level} title=${escapeAnnotation(title)}::${escapeAnnotation(finding)}`
        );
        return jsonResponse({ emitted: lines });
      }
    }
  ];
}

async function listFiles(root: string): Promise<Array<{ path: string; bytes: number }>> {
  const output: Array<{ path: string; bytes: number }> = [];
  await visit(root);
  return output;

  async function visit(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(filePath);
        output.push({ path: filePath, bytes: stat.size });
      }
    }
  }
}

function escapeAnnotation(value: string): string {
  return value
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}
