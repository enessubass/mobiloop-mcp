import assert from "node:assert/strict";
import test from "node:test";
import { enforceToolApproval, stripApproval } from "../src/utils/approval.js";
import { McpTool } from "../src/types.js";
import { createTestConfig } from "./helpers.js";

const riskyTool: McpTool = {
  name: "device.clear_app_data",
  description: "test tool",
  inputSchema: { type: "object" },
  policy: {
    riskLevel: "dangerous",
    requiresApproval: true,
    allowedInCi: false,
    allowedInInteractive: true,
    writesWorkspace: false,
    writesDevice: true,
    networkAccess: false,
    producesArtifacts: true,
    approvalReason: "Mutates device state."
  },
  async handler() {
    return { content: [{ type: "text", text: "{}" }] };
  }
};

test("approval enforcement blocks high-impact tools when enabled", async () => {
  const config = await createTestConfig({ requireApproval: true });
  assert.throws(() => enforceToolApproval(riskyTool, {}, config), /Approval required/);
});

test("approval enforcement accepts valid approval payloads and strips them before handlers", async () => {
  const config = await createTestConfig({ requireApproval: true });
  const input = {
    packageName: "com.example",
    approval: {
      approved: true,
      approvedBy: "test",
      reason: "Clear fixture app data",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }
  };
  assert.doesNotThrow(() => enforceToolApproval(riskyTool, input, config));
  assert.deepEqual(stripApproval(input), { packageName: "com.example" });
});

test("approval enforcement rejects expired approvals", async () => {
  const config = await createTestConfig({ requireApproval: true });
  assert.throws(
    () =>
      enforceToolApproval(
        riskyTool,
        {
          approval: {
            approved: true,
            approvedBy: "test",
            reason: "expired",
            expiresAt: new Date(Date.now() - 60_000).toISOString()
          }
        },
        config
      ),
    /expired/
  );
});
