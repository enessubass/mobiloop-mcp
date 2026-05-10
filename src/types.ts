import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type ToolResponse = CallToolResult;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: JsonObject;
  policy?: ToolPolicy;
  handler(input: unknown, context: ToolContext): Promise<ToolResponse>;
}

export type ToolRiskLevel = "read" | "write" | "device" | "network" | "git" | "dangerous";

export interface ToolPolicy {
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  allowedInCi: boolean;
  allowedInInteractive: boolean;
  writesWorkspace: boolean;
  writesDevice: boolean;
  networkAccess: boolean;
  producesArtifacts: boolean;
  approvalReason?: string;
}

export interface ToolContext {
  config: ServerConfig;
}

export interface ServerConfig {
  workspaceRoot: string;
  artifactsDir: string;
  maxCommandMs: number;
  maxOutputBytes: number;
  maxFixAttempts: number;
  maxTestIterations: number;
  maxRuntimeMinutes: number;
  allowedBranchPattern: string;
  appiumServerUrl: string;
  adbPath: string;
  emulatorPath: string;
  xcrunPath: string;
  xcodebuildPath: string;
  sqlitePath: string;
  apiAllowlist: string[];
  forbiddenPathGlobs: string[];
  toolPolicies: Record<string, Partial<ToolPolicy>>;
}

export function textResponse(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

export function jsonResponse(value: unknown): ToolResponse {
  return textResponse(JSON.stringify(value, null, 2));
}

export function errorResponse(error: unknown): ToolResponse {
  const message = error instanceof Error ? error.message : String(error);
  return { ...textResponse(message), isError: true };
}
