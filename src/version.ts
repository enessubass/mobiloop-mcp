import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function readPackageVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url));

  while (true) {
    const packagePath = join(directory, "package.json");
    try {
      const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: unknown };
      if (typeof parsed.version === "string" && parsed.version.length > 0) {
        return parsed.version;
      }
    } catch {
      // Look in the next parent directory. Compiled code lives under dist/src.
    }

    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error("Unable to find a package.json with a version field.");
    }
    directory = parent;
  }
}

export const PACKAGE_VERSION = readPackageVersion();
