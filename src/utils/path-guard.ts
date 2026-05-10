import path from "node:path";
import { ServerConfig } from "../types.js";

export function resolveWorkspacePath(config: ServerConfig, userPath: string): string {
  const resolved = path.isAbsolute(userPath)
    ? path.resolve(userPath)
    : path.resolve(config.workspaceRoot, userPath);
  assertInsideWorkspace(config, resolved);
  assertNotForbidden(config, resolved);
  return resolved;
}

export function resolveWorkspacePathAllowArtifacts(config: ServerConfig, userPath: string): string {
  const resolved = path.isAbsolute(userPath)
    ? path.resolve(userPath)
    : path.resolve(config.workspaceRoot, userPath);
  assertInsideWorkspace(config, resolved);
  return resolved;
}

export function assertInsideWorkspace(config: ServerConfig, resolvedPath: string): void {
  const relative = path.relative(config.workspaceRoot, resolvedPath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`Path escapes workspaceRoot: ${resolvedPath}`);
}

export function assertNotForbidden(config: ServerConfig, resolvedPath: string): void {
  const relative = toPosix(path.relative(config.workspaceRoot, resolvedPath));
  const basename = path.basename(resolvedPath);
  for (const pattern of config.forbiddenPathGlobs) {
    if (matchesGlob(relative, pattern) || (!pattern.includes("/") && matchesGlob(basename, pattern))) {
      throw new Error(`Path is blocked by forbiddenPathGlobs (${pattern}): ${relative}`);
    }
  }
}

export function toWorkspaceRelative(config: ServerConfig, resolvedPath: string): string {
  assertInsideWorkspace(config, resolvedPath);
  return toPosix(path.relative(config.workspaceRoot, resolvedPath));
}

export function matchesGlob(value: string, pattern: string): boolean {
  const normalizedValue = toPosix(value);
  const normalizedPattern = toPosix(pattern);
  const regex = globToRegex(normalizedPattern);
  return regex.test(normalizedValue);
}

function globToRegex(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];
    if (char === "*" && next === "*" && afterNext === "/") {
      source += "(?:.*/)?";
      index += 2;
    } else if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegex(char);
    }
  }
  source += "$";
  return new RegExp(source);
}

function escapeRegex(char: string): string {
  return /[\\^$+?.()|[\]{}]/.test(char) ? `\\${char}` : char;
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}
