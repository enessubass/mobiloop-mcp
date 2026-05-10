import fs from "node:fs/promises";
import path from "node:path";
import { ServerConfig } from "../types.js";

export async function ensureArtifactsDir(config: ServerConfig, group?: string): Promise<string> {
  const dir = group ? path.join(config.artifactsDir, group) : config.artifactsDir;
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
  await fs.writeFile(filePath, text, "utf8");
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
  return path.join(config.artifactsDir, group, `${stamp}-${safePrefix}.${extension}`);
}
