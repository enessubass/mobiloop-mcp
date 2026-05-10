import { ServerConfig } from "../types.js";
import { runCommand } from "./shell.js";

export async function requireGitRepo(config: ServerConfig): Promise<void> {
  const result = await runCommand("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: config.workspaceRoot,
    config,
    allowFailure: true
  });
  if (result.exitCode !== 0 || result.stdout.trim() !== "true") {
    throw new Error("workspaceRoot is not a git repository");
  }
}

export async function currentBranch(config: ServerConfig): Promise<string> {
  await requireGitRepo(config);
  const result = await runCommand("git", ["branch", "--show-current"], {
    cwd: config.workspaceRoot,
    config
  });
  return result.stdout.trim();
}

export async function requireAllowedBranch(config: ServerConfig): Promise<string> {
  const branch = await currentBranch(config);
  const pattern = new RegExp(config.allowedBranchPattern);
  if (!pattern.test(branch)) {
    throw new Error(`Current branch is not allowed for write operations: ${branch}`);
  }
  return branch;
}

export function validateNewBranchName(config: ServerConfig, branchName: string): void {
  if (branchName.includes("..") || branchName.startsWith("/") || branchName.endsWith("/")) {
    throw new Error(`Invalid branch name: ${branchName}`);
  }
  const pattern = new RegExp(config.allowedBranchPattern);
  if (!pattern.test(branchName)) {
    throw new Error(`Branch must match allowedBranchPattern: ${config.allowedBranchPattern}`);
  }
}

export function extractPatchPaths(patch: string): string[] {
  const paths = new Set<string>();
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      const parts = line.slice("diff --git ".length).split(" ");
      for (const part of parts) {
        addPatchPath(paths, part);
      }
    } else if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      addPatchPath(paths, line.slice(4).trim());
    } else if (line.startsWith("rename from ") || line.startsWith("rename to ")) {
      addPatchPath(paths, line.replace(/^rename (from|to) /, "").trim());
    }
  }
  return [...paths].filter((entry) => entry !== "/dev/null");
}

function addPatchPath(paths: Set<string>, raw: string): void {
  const unquoted = raw.replace(/^"|"$/g, "");
  if (unquoted === "/dev/null") return;
  const stripped = unquoted.replace(/^[ab]\//, "");
  if (!stripped || stripped === ".") return;
  paths.add(stripped);
}
