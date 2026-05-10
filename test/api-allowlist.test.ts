import test from "node:test";
import assert from "node:assert/strict";
import { assertApiAllowed } from "../src/utils/api-allowlist.js";

test("assertApiAllowed accepts localhost wildcard ports", () => {
  assert.doesNotThrow(() =>
    assertApiAllowed("http://127.0.0.1:3000/health", ["http://127.0.0.1:*"])
  );
  assert.doesNotThrow(() =>
    assertApiAllowed("http://localhost:8080/health", ["http://localhost:*"])
  );
});

test("assertApiAllowed rejects non-allowlisted origins", () => {
  assert.throws(
    () => assertApiAllowed("https://api.example.com/health", ["http://127.0.0.1:*"]),
    /not allowed/
  );
});

test("assertApiAllowed allows explicit staging host", () => {
  assert.doesNotThrow(() =>
    assertApiAllowed("https://staging.example.com/api/health", ["https://staging.example.com"])
  );
});
