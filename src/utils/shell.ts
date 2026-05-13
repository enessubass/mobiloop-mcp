import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { ServerConfig } from "../types.js";
import { redactText } from "./redaction.js";

export interface CommandResult {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  stdoutBuffer: Buffer;
  durationMs: number;
}

export interface RunCommandOptions {
  cwd: string;
  config: ServerConfig;
  timeoutMs?: number;
  input?: string | Buffer;
  env?: NodeJS.ProcessEnv;
  allowFailure?: boolean;
  maxOutputBytes?: number;
}

export interface DetachedCommandResult {
  command: string;
  args: string[];
  cwd: string;
  pid: number | undefined;
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions
): Promise<CommandResult> {
  const started = Date.now();
  const maxOutputBytes = options.maxOutputBytes ?? options.config.maxOutputBytes;
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"]
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBytes = appendTail(stdoutChunks, stdoutBytes, chunk, maxOutputBytes);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrBytes = appendTail(stderrChunks, stderrBytes, chunk, maxOutputBytes);
  });

  if (options.input !== undefined) {
    child.stdin.end(options.input);
  } else {
    child.stdin.end();
  }

  const timeoutMs = options.timeoutMs ?? options.config.maxCommandMs;
  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
  }, timeoutMs);

  const result = await new Promise<CommandResult>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      const stdout = stripAnsi(stdoutBuffer.toString("utf8"));
      const stderr = stripAnsi(stderrBuffer.toString("utf8"));
      resolve({
        command,
        args,
        cwd: options.cwd,
        exitCode,
        signal,
        stdout: options.config.redactArtifacts ? redactText(stdout) : stdout,
        stderr: options.config.redactArtifacts ? redactText(stderr) : stderr,
        stdoutBuffer,
        durationMs: Date.now() - started
      });
    });
  });

  if (!options.allowFailure && result.exitCode !== 0) {
    throw new Error(formatCommandFailure(result));
  }
  return result;
}

export function startDetachedCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv }
): DetachedCommandResult {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    detached: true,
    stdio: "ignore"
  });
  child.on("error", () => {
    // Avoid crashing the MCP process after returning from a detached launch.
  });
  if (!child.pid) {
    throw new Error(`Could not start detached command: ${formatCommand({ command, args })}`);
  }
  child.unref();
  return { command, args, cwd: options.cwd, pid: child.pid };
}

export function formatCommand(result: Pick<CommandResult, "command" | "args">): string {
  return [result.command, ...result.args].map(shellQuote).join(" ");
}

export function formatCommandFailure(result: CommandResult): string {
  const stderr = result.stderr.trim();
  const stdout = result.stdout.trim();
  return [
    `Command failed (${result.exitCode ?? result.signal}): ${formatCommand(result)}`,
    stderr ? `stderr:\n${stderr}` : "",
    stdout ? `stdout:\n${stdout}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : JSON.stringify(value);
}

function stripAnsi(value: string): string {
  const escape = String.fromCharCode(27);
  return value.replace(new RegExp(`${escape}\\[[0-9;]*m`, "g"), "");
}

function appendTail(
  chunks: Buffer[],
  currentBytes: number,
  chunk: Buffer,
  maxBytes: number
): number {
  if (maxBytes <= 0) return 0;
  chunks.push(chunk);
  let bytes = currentBytes + chunk.length;
  while (bytes > maxBytes && chunks.length > 0) {
    const overflow = bytes - maxBytes;
    const first = chunks[0];
    if (first.length <= overflow) {
      chunks.shift();
      bytes -= first.length;
    } else {
      chunks[0] = first.subarray(overflow);
      bytes -= overflow;
    }
  }
  return bytes;
}
