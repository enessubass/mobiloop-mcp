import { ApprovalPayload, McpTool, ServerConfig } from "../types.js";

const APPROVAL_KEYS = new Set(["approval", "__approval"]);

export function enforceToolApproval(tool: McpTool, input: unknown, config: ServerConfig): void {
  if (!config.requireApproval || !tool.policy?.requiresApproval) {
    return;
  }
  const approval = extractApproval(input);
  if (!approval) {
    throw new Error(
      `Approval required for ${tool.name}: ${tool.policy.approvalReason ?? "high-impact tool"}`
    );
  }
  validateApproval(tool.name, approval);
}

export function stripApproval(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(([key]) => !APPROVAL_KEYS.has(key))
  );
}

function extractApproval(input: unknown): ApprovalPayload | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const raw =
    (input as Record<string, unknown>).approval ?? (input as Record<string, unknown>).__approval;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  return raw as ApprovalPayload;
}

function validateApproval(toolName: string, approval: ApprovalPayload): void {
  if (approval.approved !== true) {
    throw new Error(`Approval for ${toolName} must set approval.approved=true`);
  }
  if (typeof approval.approvedBy !== "string" || approval.approvedBy.trim().length === 0) {
    throw new Error(`Approval for ${toolName} must include approval.approvedBy`);
  }
  if (typeof approval.reason !== "string" || approval.reason.trim().length === 0) {
    throw new Error(`Approval for ${toolName} must include approval.reason`);
  }
  if (approval.expiresAt !== undefined) {
    const expiresAt = Date.parse(approval.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      throw new Error(`Approval for ${toolName} has invalid approval.expiresAt`);
    }
    if (expiresAt < Date.now()) {
      throw new Error(`Approval for ${toolName} has expired`);
    }
  }
}
