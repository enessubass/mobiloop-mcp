import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docs = path.join(root, "docs");
const canonical = "https://enessubass.github.io/mobiloop-mcp/";
const html = read(path.join(docs, "index.html"));
const robots = read(path.join(docs, "robots.txt"));
const sitemap = read(path.join(docs, "sitemap.xml"));
const errors = [];

for (const snippet of [
  `<link rel="canonical" href="${canonical}" />`,
  '<meta name="robots" content="index,follow" />',
  "application/ld+json",
  'property="og:image"',
  'name="twitter:card"'
]) {
  if (!html.includes(snippet)) errors.push(`docs/index.html is missing ${snippet}`);
}

const jsonLd = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
if (!jsonLd) {
  errors.push("docs/index.html is missing JSON-LD");
} else {
  try {
    JSON.parse(jsonLd[1]);
  } catch (error) {
    errors.push(`docs/index.html contains invalid JSON-LD: ${String(error)}`);
  }
}

if (!sitemap.includes(`<loc>${canonical}</loc>`)) {
  errors.push("docs/sitemap.xml is missing the canonical URL");
}
if (!robots.includes(`Sitemap: ${canonical}sitemap.xml`)) {
  errors.push("docs/robots.txt does not reference the sitemap");
}
if (!fs.existsSync(path.join(docs, "assets", "mobiloop-appium-evidence.png"))) {
  errors.push("docs/assets/mobiloop-appium-evidence.png is missing");
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Static documentation site metadata is valid.\n");
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}
