import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { writeArtifactText } from "../src/utils/artifacts.js";
import { redactText } from "../src/utils/redaction.js";
import { createTestConfig } from "./helpers.js";

test("redactText removes common tokens and PII", () => {
  const googleLikeKey = `AIza${"12345678901234567890123456789012345"}`;
  const input = `Authorization: Bearer abc.def.ghi email root@example.com password=supersecret ${googleLikeKey}`;
  const output = redactText(input);
  assert.match(output, /Bearer \[REDACTED_TOKEN\]/);
  assert.match(output, /\[REDACTED_EMAIL\]/);
  assert.match(output, /password=\[REDACTED_SECRET\]/);
  assert.match(output, /\[REDACTED_GOOGLE_API_KEY\]/);
  assert.doesNotMatch(output, /root@example.com/);
  assert.doesNotMatch(output, /supersecret/);
});

test("writeArtifactText redacts text artifacts by default", async () => {
  const config = await createTestConfig();
  const artifactPath = await writeArtifactText(
    config,
    "logs",
    "redaction",
    "log",
    "token: abc123\nuser: root@example.com"
  );
  const content = await fs.readFile(artifactPath, "utf8");
  assert.match(content, /token: \[REDACTED_SECRET\]/);
  assert.match(content, /\[REDACTED_EMAIL\]/);
});
