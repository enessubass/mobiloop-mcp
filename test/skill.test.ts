import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { allTools } from "../src/tools/index.js";

test("the mobile QA skill references callable MobiLoop tools", async () => {
  const skill = await fs.readFile(
    path.join(process.cwd(), "skills", "mobiloop-mobile-qa", "SKILL.md"),
    "utf8"
  );
  const referenced = [...skill.matchAll(/`([a-z_]+\.[a-z_]+)`/g)].map((match) => match[1]);
  const registered = new Set(allTools().map((tool) => tool.name));
  assert.ok(referenced.length > 0);
  for (const name of new Set(referenced)) {
    assert.ok(registered.has(name), `Skill refers to an unavailable tool: ${name}`);
  }
});
