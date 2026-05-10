import test from "node:test";
import assert from "node:assert/strict";
import { extractPatchPaths, validateNewBranchName } from "../src/utils/git.js";
import { ServerConfig } from "../src/types.js";

test("extractPatchPaths finds diff paths", () => {
  const paths = extractPatchPaths(`diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-a
+b
`);
  assert.deepEqual(paths, ["src/a.ts"]);
});

test("extractPatchPaths includes renamed paths", () => {
  const paths = extractPatchPaths(`diff --git a/old.ts b/new.ts
similarity index 99%
rename from old.ts
rename to new.ts
`);
  assert.deepEqual([...new Set(paths)].sort(), ["new.ts", "old.ts"]);
});

test("validateNewBranchName enforces feature ai branch", () => {
  const config = {
    allowedBranchPattern: "^feature/ai-[A-Za-z0-9._/-]+$"
  } as ServerConfig;
  assert.doesNotThrow(() => validateNewBranchName(config, "feature/ai-login-flow"));
  assert.throws(() => validateNewBranchName(config, "main"), /allowedBranchPattern/);
});
