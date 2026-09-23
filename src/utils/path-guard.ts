import fs from "node:fs";
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
  if (relative !== "" && (relative.startsWith("..") || path.isAbsolute(relative))) {
    throw new Error(`Path escapes workspaceRoot: ${resolvedPath}`);
  }

  const canonicalRoot = resolveExistingPath(config.workspaceRoot);
  const canonicalPath = resolveExistingPath(resolvedPath);
  const canonicalRelative = path.relative(canonicalRoot, canonicalPath);
  if (
    canonicalRelative !== "" &&
    (canonicalRelative.startsWith("..") || path.isAbsolute(canonicalRelative))
  ) {
    throw new Error(`Path escapes workspaceRoot through a symbolic link: ${resolvedPath}`);
  }
}

export function assertNotForbidden(config: ServerConfig, resolvedPath: string): void {
  const canonicalRoot = resolveExistingPath(config.workspaceRoot);
  const candidates = [
    toPosix(path.relative(config.workspaceRoot, resolvedPath)),
    toPosix(path.relative(canonicalRoot, resolveExistingPath(resolvedPath)))
  ];
  for (const relative of new Set(candidates)) {
    const basename = path.posix.basename(relative);
    for (const pattern of config.forbiddenPathGlobs) {
      if (
        matchesGlob(relative, pattern) ||
        (!pattern.includes("/") && matchesGlob(basename, pattern))
      ) {
        throw new Error(`Path is blocked by forbiddenPathGlobs (${pattern}): ${relative}`);
      }
    }
  }
}

export function toWorkspaceRelative(config: ServerConfig, resolvedPath: string): string {
  assertInsideWorkspace(config, resolvedPath);
  return toPosix(
    path.relative(resolveExistingPath(config.workspaceRoot), resolveExistingPath(resolvedPath))
  );
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

function resolveExistingPath(candidate: string): string {
  let current = path.resolve(candidate);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return path.join(fs.realpathSync.native(current), ...missingSegments);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) return path.join(current, ...missingSegments);
      missingSegments.unshift(path.basename(current));
      current = parent;
    }
  }
}
