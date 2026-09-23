import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PACKAGE_VERSION } from "../src/version.js";

test("server package version matches the release package metadata", () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    version: string;
  };
  assert.equal(PACKAGE_VERSION, packageJson.version);
});
