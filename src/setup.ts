import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

const CLIENTS = ["codex", "claude", "cursor", "vscode", "generic"] as const;
type SetupClient = (typeof CLIENTS)[number];
interface SetupOptions {
  workspace: string;
  client: SetupClient;
  appiumUrl?: string;
  dryRun?: boolean;
  replace?: boolean;
}
interface PlannedFile {
  path: string;
  content: string;
  previous?: string;
}

export async function setupProject(options: SetupOptions) {
  if (!CLIENTS.includes(options.client)) throw new Error("Unsupported setup client");
  const root = await fs.realpath(path.resolve(options.workspace));
  if (!(await fs.stat(root)).isDirectory()) throw new Error("Workspace must be a directory");
  const endpoint = options.appiumUrl ?? "http://127.0.0.1:4723";
  const url = new URL(endpoint);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Setup requires an HTTP loopback Appium URL without credentials");

  const env: Record<string, string> = {
    MOBILOOP_WORKSPACE_ROOT: root,
    MOBILOOP_SECURITY_MODE: "secure",
    APPIUM_SERVER_URL: endpoint
  };
  for (const name of [
    "PATH",
    "JAVA_HOME",
    "ANDROID_HOME",
    "ANDROID_SDK_ROOT",
    "DEVELOPER_DIR",
    "APPIUM_HOME"
  ]) {
    if (process.env[name]) env[name] = process.env[name]!;
  }
  const server = {
    command: process.execPath,
    args: [fileURLToPath(new URL("./index.js", import.meta.url))],
    env,
    ...(options.client === "codex" ? { tool_timeout_sec: 1800 } : {})
  };
  const configRelative = {
    codex: ".codex/config.toml",
    claude: ".mcp.json",
    cursor: ".cursor/mcp.json",
    vscode: ".mcp.json",
    generic: ".mobiloop/mcp.json"
  }[options.client];
  const configPath = path.join(root, configRelative);
  const previous = await readSafeFile(root, configPath);
  const config = record(
    previous ? (options.client === "codex" ? parseToml(previous) : JSON.parse(previous)) : {}
  );
  const key = options.client === "codex" ? "mcp_servers" : "mcpServers";
  const servers = config[key] === undefined ? {} : record(config[key]);
  if (servers.mobiloop !== undefined && !same(servers.mobiloop, server) && !options.replace) {
    throw new Error(
      "MobiLoop configuration already differs; review it and use --replace to back up and update only this entry"
    );
  }
  let content = previous ?? "";
  if (!same(servers.mobiloop, server)) {
    config[key] = { ...servers, mobiloop: server };
    if (options.client === "codex") {
      content =
        servers.mobiloop === undefined
          ? `${previous ?? ""}\n${stringifyToml({ mcp_servers: { mobiloop: server } })}`
          : stringifyToml(config);
      if (!same(parseToml(content), config))
        throw new Error("TOML merge changed unrelated settings; no files changed");
    } else {
      content = `${JSON.stringify(config, null, 2)}\n`;
    }
  }
  const files: PlannedFile[] = [{ path: configPath, content, previous }];
  const skillRelative = options.client === "claude" ? ".claude/skills" : ".agents/skills";
  const skillDir = path.join(root, skillRelative, "mobiloop-mobile-qa");
  for (const name of ["SKILL.md", "LICENSE", "agents/openai.yaml"]) {
    const target = path.join(skillDir, name);
    const old = await readSafeFile(root, target);
    const bundled = await fs.readFile(
      new URL(`../../skills/mobiloop-mobile-qa/${name}`, import.meta.url),
      "utf8"
    );
    if (old !== undefined && old !== bundled && !options.replace) {
      throw new Error(`Existing skill differs: ${target}. Review it before using --replace`);
    }
    files.push({ path: target, content: bundled, previous: old });
  }
  const changed = files.filter((file) => file.content !== file.previous);
  const ignorePath = path.join(root, ".gitignore");
  const ignored = await readSafeFile(root, ignorePath);
  if (
    !(ignored ?? "")
      .split(/\r?\n/)
      .some((line) => [".mobiloop/", "/.mobiloop/"].includes(line.trim()))
  ) {
    changed.unshift({
      path: ignorePath,
      previous: ignored,
      content: `${ignored ?? ""}\n# Local MobiLoop evidence and setup backups\n.mobiloop/\n`
    });
  }
  const backups: string[] = [];
  const written: PlannedFile[] = [];
  if (!options.dryRun) {
    try {
      for (const file of changed) {
        await assertSafeDestination(root, file.path);
        if ((await readSafeFile(root, file.path)) !== file.previous) {
          throw new Error(`File changed during setup; retry after reviewing ${file.path}`);
        }
        await fs.mkdir(path.dirname(file.path), { recursive: true });
        if (file.previous !== undefined) {
          const backup = path.join(
            root,
            ".mobiloop",
            "setup-backups",
            randomUUID(),
            path.relative(root, file.path)
          );
          await assertSafeDestination(root, backup);
          await fs.mkdir(path.dirname(backup), { recursive: true });
          await fs.writeFile(backup, file.previous, { flag: "wx", mode: 0o600 });
          backups.push(backup);
        }
        await atomicWrite(file.path, file.content);
        written.push(file);
      }
    } catch (error) {
      for (const file of written.reverse()) {
        if (file.previous === undefined) await fs.unlink(file.path);
        else await atomicWrite(file.path, file.previous);
      }
      for (const backup of backups) await fs.rm(backup, { force: true });
      throw error;
    }
  }
  return {
    configured: !options.dryRun,
    dryRun: options.dryRun ?? false,
    client: options.client,
    workspace: root,
    configPath,
    skillDir,
    changedFiles: changed.map((file) => file.path),
    backups,
    readinessChecked: false,
    nextStep:
      "Restart or reload your agent, review its MCP trust prompt, then run mobiloop doctor for the target platform. SDKs and Appium are not installed by setup."
  };
}

export async function runSetup(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      workspace: { type: "string" },
      client: { type: "string" },
      "appium-url": { type: "string" },
      "dry-run": { type: "boolean" },
      yes: { type: "boolean" },
      replace: { type: "boolean" }
    }
  });
  let workspace = values.workspace ?? process.env.MOBILOOP_WORKSPACE_ROOT;
  let client = values.client;
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  const prompt = interactive
    ? createInterface({ input: process.stdin, output: process.stdout })
    : undefined;
  try {
    if (!workspace && prompt)
      workspace = (await prompt.question("Mobile project directory: ")).trim();
    if (!client && prompt)
      client = (await prompt.question(`Agent (${CLIENTS.join("/")}): `)).trim();
    if (!workspace || !client || !CLIENTS.includes(client as SetupClient)) {
      throw new Error(
        "Usage: mobiloop setup --workspace <project> --client codex|claude|cursor|vscode|generic --yes [--dry-run] [--replace]"
      );
    }
    if (!values.yes && !values["dry-run"]) {
      const confirmed =
        prompt &&
        /^y(?:es)?$/i.test(
          (
            await prompt.question(
              "Add project-local MCP configuration and skill (no SDK install)? [y/N] "
            )
          ).trim()
        );
      if (!confirmed)
        throw new Error("No files changed. Use --dry-run to preview or --yes to authorize setup.");
    }
    const result = await setupProject({
      workspace,
      client: client as SetupClient,
      appiumUrl: values["appium-url"],
      dryRun: values["dry-run"],
      replace: values.replace
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    prompt?.close();
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Client configuration must contain objects; no files changed");
  return value as Record<string, unknown>;
}
function same(left: unknown, right: unknown): boolean {
  try {
    assert.deepEqual(structuredClone(left), structuredClone(right));
    return true;
  } catch {
    return false;
  }
}
async function readSafeFile(root: string, target: string): Promise<string | undefined> {
  await assertSafeDestination(root, target);
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > 1_048_576)
      throw new Error(`Not a small regular configuration file: ${target}`);
    return await fs.readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
async function assertSafeDestination(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Setup destination escapes workspace");
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (stat?.isSymbolicLink())
      throw new Error(`Setup refuses symbolic-link destinations: ${current}`);
  }
}
async function atomicWrite(target: string, content: string): Promise<void> {
  const temporary = `${target}.mobiloop-tmp-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
