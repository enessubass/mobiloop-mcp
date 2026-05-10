import fs from "node:fs/promises";
import path from "node:path";
import { McpTool, jsonResponse } from "../types.js";
import { arraySchema, booleanSchema, numberSchema, objectSchema, stringSchema } from "../schema.js";
import { asObject, optionalBoolean, optionalNumber, optionalStringArray, requireString } from "../utils/validation.js";
import { matchesGlob, resolveWorkspacePath, toWorkspaceRelative } from "../utils/path-guard.js";
import { extractPatchPaths, requireAllowedBranch, requireGitRepo, validateNewBranchName } from "../utils/git.js";
import { runCommand } from "../utils/shell.js";

export function codeTools(): McpTool[] {
  return [
    {
      name: "code.read_file",
      description: "Read a non-secret file inside workspaceRoot.",
      inputSchema: objectSchema(
        {
          path: stringSchema,
          maxBytes: numberSchema
        },
        ["path"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const filePath = resolveWorkspacePath(config, requireString(args, "path"));
        const maxBytes = optionalNumber(args, "maxBytes") ?? 200_000;
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) throw new Error("path must be a file");
        if (stat.size > maxBytes) {
          throw new Error(`File is larger than maxBytes (${stat.size} > ${maxBytes})`);
        }
        return jsonResponse({
          path: toWorkspaceRelative(config, filePath),
          bytes: stat.size,
          content: await fs.readFile(filePath, "utf8")
        });
      }
    },
    {
      name: "code.search_code",
      description: "Search workspaceRoot. Uses ripgrep when available and falls back to a built-in scanner.",
      inputSchema: objectSchema(
        {
          query: stringSchema,
          glob: stringSchema,
          maxResults: numberSchema
        },
        ["query"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const query = requireString(args, "query");
        const glob = args.glob === undefined ? undefined : requireString(args, "glob");
        const maxResults = Math.max(1, Math.min(optionalNumber(args, "maxResults") ?? 100, 500));
        const rgArgs = ["--line-number", "--column", "--no-heading", "--color", "never"];
        if (glob) rgArgs.push("--glob", glob);
        for (const excludedGlob of ripgrepSecretExcludes(config.forbiddenPathGlobs)) {
          rgArgs.push("--glob", excludedGlob);
        }
        rgArgs.push(query, config.workspaceRoot);
        try {
          const result = await runCommand("rg", rgArgs, {
            cwd: config.workspaceRoot,
            config,
            allowFailure: true
          });
          if (result.exitCode !== 0 && result.exitCode !== 1) {
            throw new Error(result.stderr || "rg failed");
          }
          const lines = result.stdout
            .split(/\r?\n/)
            .filter(Boolean)
            .slice(0, maxResults)
            .map((line) => line.replace(`${config.workspaceRoot}${path.sep}`, ""));
          return jsonResponse({ query, engine: "rg", count: lines.length, results: lines });
        } catch (error) {
          const results = await nodeSearch(config, query, glob, maxResults);
          return jsonResponse({
            query,
            engine: "node-fallback",
            fallbackReason: error instanceof Error ? error.message : String(error),
            count: results.length,
            results
          });
        }
      }
    },
    {
      name: "code.apply_patch",
      description: "Apply a unified diff after validating all touched paths stay inside workspaceRoot and are not forbidden.",
      inputSchema: objectSchema({ patch: stringSchema }, ["patch"]),
      async handler(input, { config }) {
        await requireAllowedBranch(config);
        const args = asObject(input);
        const patch = requireString(args, "patch");
        const touchedPaths = extractPatchPaths(patch);
        if (touchedPaths.length === 0) {
          throw new Error("Patch did not contain recognizable file paths");
        }
        for (const touchedPath of touchedPaths) {
          resolveWorkspacePath(config, touchedPath);
        }
        const check = await runCommand("git", ["apply", "--check", "--whitespace=fix", "-"], {
          cwd: config.workspaceRoot,
          config,
          input: patch,
          allowFailure: true
        });
        if (check.exitCode !== 0) {
          throw new Error(check.stderr || check.stdout || "git apply --check failed");
        }
        const apply = await runCommand("git", ["apply", "--whitespace=fix", "-"], {
          cwd: config.workspaceRoot,
          config,
          input: patch
        });
        return jsonResponse({
          applied: true,
          touchedPaths,
          stdout: apply.stdout.trim(),
          stderr: apply.stderr.trim()
        });
      }
    },
    {
      name: "code.git_diff",
      description: "Return git diff for workspaceRoot.",
      inputSchema: objectSchema({ staged: booleanSchema }, []),
      async handler(input, { config }) {
        await requireGitRepo(config);
        const args = asObject(input ?? {});
        const staged = optionalBoolean(args, "staged") ?? false;
        const result = await runCommand("git", ["diff", "--no-ext-diff", ...(staged ? ["--staged"] : [])], {
          cwd: config.workspaceRoot,
          config
        });
        return jsonResponse({ staged, diff: result.stdout });
      }
    },
    {
      name: "code.create_branch",
      description: "Create and checkout a guarded feature branch. Branch must match allowedBranchPattern.",
      inputSchema: objectSchema({ branchName: stringSchema }, ["branchName"]),
      async handler(input, { config }) {
        await requireGitRepo(config);
        const args = asObject(input);
        const branchName = requireString(args, "branchName");
        validateNewBranchName(config, branchName);
        const result = await runCommand("git", ["checkout", "-b", branchName], {
          cwd: config.workspaceRoot,
          config
        });
        return jsonResponse({ branchName, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
      }
    },
    {
      name: "code.commit_changes",
      description: "Commit changes only while on an allowed feature/ai branch. Optionally stage specific non-secret paths.",
      inputSchema: objectSchema(
        {
          message: stringSchema,
          paths: arraySchema(stringSchema)
        },
        ["message"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const message = requireString(args, "message");
        const branch = await requireAllowedBranch(config);
        const paths = optionalStringArray(args, "paths");
        if (paths && paths.length > 0) {
          for (const entry of paths) resolveWorkspacePath(config, entry);
          await runCommand("git", ["add", "--", ...paths], { cwd: config.workspaceRoot, config });
        }
        await assertStagedPathsAllowed(config);
        const result = await runCommand("git", ["commit", "-m", message], {
          cwd: config.workspaceRoot,
          config
        });
        return jsonResponse({
          branch,
          committed: true,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim()
        });
      }
    },
    {
      name: "code.open_pr",
      description: "Open a pull request with GitHub CLI from the current allowed feature branch.",
      inputSchema: objectSchema(
        {
          title: stringSchema,
          body: stringSchema,
          base: stringSchema,
          draft: booleanSchema
        },
        ["title", "body"]
      ),
      async handler(input, { config }) {
        const args = asObject(input);
        const branch = await requireAllowedBranch(config);
        const title = requireString(args, "title");
        const body = requireString(args, "body");
        const base = typeof args.base === "string" && args.base.length > 0 ? args.base : "main";
        const draft = optionalBoolean(args, "draft") ?? false;
        const ghArgs = ["pr", "create", "--title", title, "--body", body, "--base", base, "--head", branch];
        if (draft) ghArgs.push("--draft");
        const result = await runCommand("gh", ghArgs, {
          cwd: config.workspaceRoot,
          config,
          timeoutMs: 120_000
        });
        return jsonResponse({
          branch,
          base,
          draft,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim()
        });
      }
    }
  ];
}

function ripgrepSecretExcludes(patterns: string[]): string[] {
  const excludes = new Set<string>();
  for (const pattern of patterns) {
    excludes.add(`!${pattern}`);
    if (!pattern.includes("/")) {
      excludes.add(`!**/${pattern}`);
    }
    if (pattern.startsWith("**/")) {
      excludes.add(`!${pattern.slice(3)}`);
    }
  }
  return [...excludes];
}

async function assertStagedPathsAllowed(config: Parameters<typeof requireAllowedBranch>[0]): Promise<void> {
  const staged = await runCommand("git", ["diff", "--cached", "--name-only", "-z"], {
    cwd: config.workspaceRoot,
    config
  });
  const paths = staged.stdout.split("\0").filter(Boolean);
  for (const entry of paths) {
    resolveWorkspacePath(config, entry);
  }
}

async function nodeSearch(
  config: Parameters<typeof requireAllowedBranch>[0],
  query: string,
  glob: string | undefined,
  maxResults: number
): Promise<string[]> {
  const results: string[] = [];
  await visit(config.workspaceRoot);
  return results;

  async function visit(dir: string): Promise<void> {
    if (results.length >= maxResults) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const filePath = path.join(dir, entry.name);
      const relative = toWorkspaceRelative(config, filePath);
      if (entry.isDirectory()) {
        if ([".git", "node_modules", "dist", ".mobiloop"].includes(entry.name)) continue;
        if (isForbidden(config.forbiddenPathGlobs, relative)) continue;
        await visit(filePath);
      } else if (entry.isFile()) {
        if (isForbidden(config.forbiddenPathGlobs, relative)) continue;
        if (glob && !matchesGlob(relative, glob)) continue;
        await searchFile(filePath, relative);
      }
    }
  }

  async function searchFile(filePath: string, relative: string): Promise<void> {
    const stat = await fs.stat(filePath).catch(() => undefined);
    if (!stat || stat.size > 2_000_000) return;
    const content = await fs.readFile(filePath, "utf8").catch(() => undefined);
    if (content === undefined || content.includes("\u0000")) return;
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length && results.length < maxResults; index += 1) {
      const column = lines[index].indexOf(query);
      if (column >= 0) {
        results.push(`${relative}:${index + 1}:${column + 1}:${lines[index]}`);
      }
    }
  }
}

function isForbidden(patterns: string[], relative: string): boolean {
  return patterns.some((pattern) => matchesGlob(relative, pattern) || matchesGlob(path.basename(relative), pattern));
}
