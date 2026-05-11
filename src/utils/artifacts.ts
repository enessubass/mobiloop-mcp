import fs from "node:fs/promises";
import path from "node:path";
import { ServerConfig } from "../types.js";
import { redactText } from "./redaction.js";

export async function ensureArtifactsDir(config: ServerConfig, group?: string): Promise<string> {
  const root = artifactRoot(config);
  const dir = group ? path.join(root, group) : root;
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeArtifactText(
  config: ServerConfig,
  group: string,
  prefix: string,
  extension: string,
  text: string
): Promise<string> {
  const filePath = artifactPath(config, group, prefix, extension);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, config.redactArtifacts ? redactText(text) : text, "utf8");
  return filePath;
}

export async function writeArtifactBuffer(
  config: ServerConfig,
  group: string,
  prefix: string,
  extension: string,
  bytes: Buffer
): Promise<string> {
  const filePath = artifactPath(config, group, prefix, extension);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
  return filePath;
}

export function artifactPath(
  config: ServerConfig,
  group: string,
  prefix: string,
  extension: string
): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9._-]/g, "_");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(artifactRoot(config), group, `${stamp}-${safePrefix}.${extension}`);
}

export function artifactRoot(config: ServerConfig): string {
  return config.runId
    ? path.join(config.artifactsDir, "runs", safeRunId(config.runId))
    : config.artifactsDir;
}

export function safeRunId(runId: string): string {
  return runId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "run";
}
