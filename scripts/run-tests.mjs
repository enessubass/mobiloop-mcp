import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function tests(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await tests(target)));
    else if (entry.name.endsWith(".test.js")) files.push(target);
  }
  return files.sort();
}
const files = await tests("dist/test");
if (!files.length) throw new Error("No compiled tests found");
for (const file of files) {
  console.log(`Testing ${file}`);
  // Each file has its own process; direct execution also streams teardown diagnostics.
  const result = spawnSync(process.execPath, [file], { stdio: "inherit", timeout: 60_000 });
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exitCode = 1;
}
