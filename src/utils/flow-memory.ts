import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { ServerConfig } from "../types.js";
import { artifactRoot, ensureArtifactsDir, writeArtifactText } from "./artifacts.js";

export interface FlowAction {
  tool: string;
  args?: Record<string, unknown>;
  description?: string;
}

export interface ScreenSignature {
  hash: string;
  tokens: string[];
  texts: string[];
  resourceIds: string[];
  contentDescriptions: string[];
  classes: string[];
  clickableTexts: string[];
}

export interface FlowCheckpoint {
  id: string;
  testName: string;
  name: string;
  order: number;
  signature: ScreenSignature;
  actionToNext?: FlowAction;
  sourcePath?: string;
  screenshotPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowRun {
  id: string;
  testName: string;
  status: string;
  checkpointIds: string[];
  artifacts: string[];
  startedAt: string;
  finishedAt?: string;
}

export interface CodeFlowAnalysis {
  generatedAt: string;
  framework: string;
  scannedFiles: number;
  screens: Array<{ name: string; file: string; line: number; confidence: number }>;
  routes: Array<{ route: string; target?: string; file: string; line: number; confidence: number }>;
  transitions: Array<{
    from?: string;
    to: string;
    trigger: string;
    file: string;
    line: number;
    confidence: number;
  }>;
  visibleTexts: Array<{ text: string; file: string; line: number }>;
  limitations: string[];
}

export interface FlowMemory {
  version: 1;
  updatedAt: string;
  checkpoints: FlowCheckpoint[];
  runs: FlowRun[];
  analyses: CodeFlowAnalysis[];
}

export interface ReplayPlan {
  matched: {
    checkpointId: string;
    checkpointName: string;
    order: number;
    score: number;
  };
  target: {
    checkpointId: string;
    checkpointName: string;
    order: number;
  };
  alreadyAtTarget: boolean;
  checkpointIds: string[];
  actions: Array<FlowAction & { fromCheckpointId: string; toCheckpointId?: string }>;
}

export function emptyFlowMemory(): FlowMemory {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    checkpoints: [],
    runs: [],
    analyses: []
  };
}

export async function readFlowMemory(config: ServerConfig): Promise<FlowMemory> {
  const raw = await fs.readFile(flowMemoryPath(config), "utf8").catch(() => undefined);
  if (!raw) return emptyFlowMemory();
  const parsed = JSON.parse(raw) as FlowMemory;
  return {
    version: 1,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    checkpoints: Array.isArray(parsed.checkpoints) ? parsed.checkpoints : [],
    runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    analyses: Array.isArray(parsed.analyses) ? parsed.analyses : []
  };
}

export async function writeFlowMemory(config: ServerConfig, memory: FlowMemory): Promise<string> {
  const dir = await ensureArtifactsDir(config, "flow");
  const filePath = path.join(dir, "memory.json");
  memory.updatedAt = new Date().toISOString();
  await fs.writeFile(filePath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
  return filePath;
}

export function flowMemoryPath(config: ServerConfig): string {
  return path.join(artifactRoot(config), "flow", "memory.json");
}

export function createScreenSignature(source: string): ScreenSignature {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "#text"
  });
  const parsed = parser.parse(source);
  const texts = new Set<string>();
  const resourceIds = new Set<string>();
  const contentDescriptions = new Set<string>();
  const classes = new Set<string>();
  const clickableTexts = new Set<string>();
  const tokens = new Set<string>();

  visit(parsed);

  const sortedTokens = [...tokens].sort();
  const hash = crypto.createHash("sha256").update(sortedTokens.join("\n")).digest("hex");
  return {
    hash,
    tokens: sortedTokens,
    texts: [...texts].sort(),
    resourceIds: [...resourceIds].sort(),
    contentDescriptions: [...contentDescriptions].sort(),
    classes: [...classes].sort(),
    clickableTexts: [...clickableTexts].sort()
  };

  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const text = firstString(record.text, record.label, record.name);
    const contentDesc = firstString(record["content-desc"], record.contentDescription);
    const resourceId = firstString(record["resource-id"], record.resourceId);
    const className = firstString(record.class, record.className);
    const clickable = String(record.clickable ?? "").toLowerCase() === "true";

    if (text) addValue(texts, tokens, "text", text);
    if (contentDesc) addValue(contentDescriptions, tokens, "content", contentDesc);
    if (resourceId) addValue(resourceIds, tokens, "id", resourceId);
    if (className) addValue(classes, tokens, "class", className);
    if (clickable && (text || contentDesc)) clickableTexts.add(text ?? contentDesc ?? "");

    for (const value of Object.values(record)) {
      if (value && typeof value === "object") visit(value);
    }
  }
}

export function screenSimilarity(left: ScreenSignature, right: ScreenSignature): number {
  if (left.hash === right.hash) return 1;
  const leftTokens = new Set(left.tokens);
  const rightTokens = new Set(right.tokens);
  if (leftTokens.size === 0 && rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

export async function readScreenSource(
  config: ServerConfig,
  input: { source?: string; sourcePath?: string }
): Promise<string> {
  if (input.source) return input.source;
  if (!input.sourcePath) throw new Error("source or sourcePath is required");
  const filePath = resolveReadableWorkspacePath(config, input.sourcePath);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error("sourcePath must point to a file");
  if (stat.size > 5_000_000) throw new Error("sourcePath is too large");
  return fs.readFile(filePath, "utf8");
}

export async function upsertCheckpoint(
  config: ServerConfig,
  input: {
    id?: string;
    testName: string;
    name: string;
    order?: number;
    signature: ScreenSignature;
    actionToNext?: FlowAction;
    sourcePath?: string;
    screenshotPath?: string;
  }
): Promise<{ memoryPath: string; checkpoint: FlowCheckpoint }> {
  const memory = await readFlowMemory(config);
  const now = new Date().toISOString();
  const id =
    input.id ??
    stableCheckpointId(
      input.testName,
      input.name,
      input.order ?? nextOrder(memory, input.testName)
    );
  const existing = memory.checkpoints.find((checkpoint) => checkpoint.id === id);
  const checkpoint: FlowCheckpoint = {
    id,
    testName: input.testName,
    name: input.name,
    order: input.order ?? existing?.order ?? nextOrder(memory, input.testName),
    signature: input.signature,
    actionToNext: input.actionToNext,
    sourcePath: input.sourcePath,
    screenshotPath: input.screenshotPath,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  memory.checkpoints = existing
    ? memory.checkpoints.map((entry) => (entry.id === id ? checkpoint : entry))
    : [...memory.checkpoints, checkpoint];
  const memoryPath = await writeFlowMemory(config, memory);
  return { memoryPath, checkpoint };
}

export async function recordFlowRun(
  config: ServerConfig,
  input: {
    id?: string;
    testName: string;
    status: string;
    checkpointIds: string[];
    artifacts?: string[];
    startedAt?: string;
    finishedAt?: string;
  }
): Promise<{ memoryPath: string; run: FlowRun }> {
  const memory = await readFlowMemory(config);
  const now = new Date().toISOString();
  const run: FlowRun = {
    id: input.id ?? `${slug(input.testName)}-${now.replace(/[:.]/g, "-")}`,
    testName: input.testName,
    status: input.status,
    checkpointIds: input.checkpointIds,
    artifacts: input.artifacts ?? [],
    startedAt: input.startedAt ?? now,
    finishedAt: input.finishedAt ?? now
  };
  memory.runs.push(run);
  const memoryPath = await writeFlowMemory(config, memory);
  return { memoryPath, run };
}

export function buildReplayPlan(
  memory: FlowMemory,
  current: ScreenSignature,
  input: {
    testName?: string;
    targetCheckpointId?: string;
    minimumScore?: number;
  } = {}
): ReplayPlan {
  const checkpoints = input.testName
    ? memory.checkpoints.filter((checkpoint) => checkpoint.testName === input.testName)
    : memory.checkpoints;
  if (checkpoints.length === 0) throw new Error("No flow checkpoints are recorded yet");

  const minimumScore = input.minimumScore ?? 0.55;
  const best = checkpoints
    .map((checkpoint) => ({ checkpoint, score: screenSimilarity(current, checkpoint.signature) }))
    .sort((left, right) => right.score - left.score)[0];
  if (!best || best.score < minimumScore) {
    throw new Error(`Current screen did not match a recorded checkpoint above ${minimumScore}`);
  }

  const pathIds = resolveReplayPath(memory, best.checkpoint.testName, input.targetCheckpointId);
  const matchedIndex = pathIds.indexOf(best.checkpoint.id);
  if (matchedIndex < 0) {
    throw new Error(`Matched checkpoint ${best.checkpoint.id} is not in the selected replay path`);
  }
  const targetId = input.targetCheckpointId ?? pathIds[pathIds.length - 1];
  const target = memory.checkpoints.find((checkpoint) => checkpoint.id === targetId);
  if (!target) throw new Error(`Target checkpoint was not found: ${targetId}`);
  const targetIndex = pathIds.indexOf(target.id);
  if (targetIndex < 0)
    throw new Error(`Target checkpoint ${target.id} is not in the selected replay path`);

  const actionCheckpoints = pathIds
    .slice(matchedIndex, Math.max(matchedIndex, targetIndex))
    .map((id) => memory.checkpoints.find((checkpoint) => checkpoint.id === id))
    .filter((entry): entry is FlowCheckpoint => Boolean(entry));
  const actions = actionCheckpoints.flatMap((checkpoint, index) => {
    if (!checkpoint.actionToNext) return [];
    return [
      {
        ...checkpoint.actionToNext,
        fromCheckpointId: checkpoint.id,
        toCheckpointId: actionCheckpoints[index + 1]?.id ?? pathIds[matchedIndex + index + 1]
      }
    ];
  });

  return {
    matched: {
      checkpointId: best.checkpoint.id,
      checkpointName: best.checkpoint.name,
      order: best.checkpoint.order,
      score: Number(best.score.toFixed(4))
    },
    target: {
      checkpointId: target.id,
      checkpointName: target.name,
      order: target.order
    },
    alreadyAtTarget: targetIndex <= matchedIndex,
    checkpointIds: pathIds.slice(matchedIndex, targetIndex + 1),
    actions: targetIndex <= matchedIndex ? [] : actions
  };
}

export async function analyzeCodeFlow(
  config: ServerConfig,
  input: { maxFiles?: number; includeTests?: boolean } = {}
): Promise<CodeFlowAnalysis> {
  const framework = await detectFramework(config.workspaceRoot);
  const maxFiles = Math.max(1, Math.min(input.maxFiles ?? 500, 5000));
  const includeTests = input.includeTests ?? false;
  const files: string[] = [];
  await collectSourceFiles(config.workspaceRoot, files, { includeTests, maxFiles });

  const analysis: CodeFlowAnalysis = {
    generatedAt: new Date().toISOString(),
    framework,
    scannedFiles: files.length,
    screens: [],
    routes: [],
    transitions: [],
    visibleTexts: [],
    limitations: [
      "Static analysis is heuristic. Dynamic feature flags, server-driven UI, reflection, and generated navigation code may need runtime checkpoints.",
      "Use Appium checkpoint recording to turn these candidates into deterministic replay paths."
    ]
  };

  for (const filePath of files) {
    const relative = path.relative(config.workspaceRoot, filePath);
    const content = await fs.readFile(filePath, "utf8").catch(() => "");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      detectScreens(line, relative, index + 1, analysis);
      detectRoutes(line, relative, index + 1, analysis);
      detectTransitions(line, relative, index + 1, analysis);
      detectVisibleTexts(line, relative, index + 1, analysis);
    }
  }

  analysis.screens = uniqueBy(
    analysis.screens,
    (entry) => `${entry.file}:${entry.line}:${entry.name}`
  ).slice(0, 300);
  analysis.routes = uniqueBy(
    analysis.routes,
    (entry) => `${entry.file}:${entry.line}:${entry.route}:${entry.target ?? ""}`
  ).slice(0, 300);
  analysis.transitions = uniqueBy(
    analysis.transitions,
    (entry) => `${entry.file}:${entry.line}:${entry.to}:${entry.trigger}`
  ).slice(0, 500);
  analysis.visibleTexts = uniqueBy(
    analysis.visibleTexts,
    (entry) => `${entry.file}:${entry.line}:${entry.text}`
  ).slice(0, 500);
  return analysis;
}

export async function persistCodeFlowAnalysis(
  config: ServerConfig,
  analysis: CodeFlowAnalysis
): Promise<{ jsonPath: string; markdownPath: string; memoryPath: string }> {
  const jsonPath = await writeArtifactText(
    config,
    "flow",
    "code-flow-analysis",
    "json",
    JSON.stringify(analysis, null, 2)
  );
  const markdownPath = await writeArtifactText(
    config,
    "flow",
    "code-flow-analysis",
    "md",
    renderCodeFlowAnalysis(analysis)
  );
  const memory = await readFlowMemory(config);
  memory.analyses.push(analysis);
  memory.analyses = memory.analyses.slice(-20);
  const memoryPath = await writeFlowMemory(config, memory);
  return { jsonPath, markdownPath, memoryPath };
}

export function renderCodeFlowAnalysis(analysis: CodeFlowAnalysis): string {
  const lines = [
    "# Code Flow Analysis",
    "",
    `Generated: ${analysis.generatedAt}`,
    `Framework: ${analysis.framework}`,
    `Scanned files: ${analysis.scannedFiles}`,
    "",
    "## Screens",
    ""
  ];
  for (const screen of analysis.screens.slice(0, 100)) {
    lines.push(`- ${screen.name} (${screen.file}:${screen.line}, confidence ${screen.confidence})`);
  }
  lines.push("", "## Routes", "");
  for (const route of analysis.routes.slice(0, 100)) {
    lines.push(
      `- ${route.route}${route.target ? ` -> ${route.target}` : ""} (${route.file}:${route.line})`
    );
  }
  lines.push("", "## Transitions", "");
  for (const transition of analysis.transitions.slice(0, 150)) {
    lines.push(
      `- ${transition.trigger} -> ${transition.to} (${transition.file}:${transition.line})`
    );
  }
  lines.push("", "## Visible Text Candidates", "");
  for (const visibleText of analysis.visibleTexts.slice(0, 150)) {
    lines.push(`- "${visibleText.text}" (${visibleText.file}:${visibleText.line})`);
  }
  lines.push("", "## Limitations", "");
  for (const limitation of analysis.limitations) {
    lines.push(`- ${limitation}`);
  }
  lines.push("");
  return lines.join("\n");
}

function resolveReplayPath(
  memory: FlowMemory,
  testName: string,
  targetCheckpointId?: string
): string[] {
  const successfulRuns = memory.runs
    .filter(
      (run) =>
        run.testName === testName &&
        run.checkpointIds.length > 0 &&
        ["passed", "success"].includes(run.status)
    )
    .slice()
    .reverse();
  const latestRun =
    successfulRuns[0] ??
    memory.runs
      .filter((run) => run.testName === testName && run.checkpointIds.length > 0)
      .slice()
      .reverse()[0];
  if (latestRun) {
    if (targetCheckpointId && !latestRun.checkpointIds.includes(targetCheckpointId)) {
      throw new Error(
        `Target checkpoint ${targetCheckpointId} is not in latest run ${latestRun.id}`
      );
    }
    return latestRun.checkpointIds;
  }
  const ordered = memory.checkpoints
    .filter((checkpoint) => checkpoint.testName === testName)
    .sort((left, right) => left.order - right.order)
    .map((checkpoint) => checkpoint.id);
  if (targetCheckpointId && !ordered.includes(targetCheckpointId)) {
    throw new Error(`Target checkpoint ${targetCheckpointId} is not in recorded checkpoint order`);
  }
  return ordered;
}

function addValue(target: Set<string>, tokens: Set<string>, prefix: string, value: string): void {
  const normalized = normalizeValue(value);
  if (!normalized) return;
  target.add(value.trim());
  tokens.add(`${prefix}:${normalized}`);
  for (const part of normalized.split(/\s+/).filter(Boolean)) {
    if (part.length >= 2) tokens.add(`${prefix}:word:${part}`);
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function normalizeValue(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function nextOrder(memory: FlowMemory, testName: string): number {
  const orders = memory.checkpoints
    .filter((checkpoint) => checkpoint.testName === testName)
    .map((checkpoint) => checkpoint.order);
  return orders.length === 0 ? 1 : Math.max(...orders) + 1;
}

function stableCheckpointId(testName: string, name: string, order: number): string {
  return `${slug(testName)}-${String(order).padStart(3, "0")}-${slug(name)}`;
}

function slug(value: string): string {
  return (
    value
      .toLocaleLowerCase("en-US")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "flow"
  );
}

function resolveReadableWorkspacePath(config: ServerConfig, candidate: string): string {
  const filePath = path.isAbsolute(candidate)
    ? candidate
    : path.resolve(config.workspaceRoot, candidate);
  const relative = path.relative(config.workspaceRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path must stay inside workspaceRoot: ${candidate}`);
  }
  return filePath;
}

async function detectFramework(root: string): Promise<string> {
  const hasPubspec = await exists(path.join(root, "pubspec.yaml"));
  if (hasPubspec) return "flutter";
  const packageJson = await fs.readFile(path.join(root, "package.json"), "utf8").catch(() => "");
  if (/react-native/.test(packageJson)) return "react-native";
  if (await isAndroidProject(root)) return "android";
  if (await exists(path.join(root, "ios"))) return "ios";
  return "unknown";
}

async function isAndroidProject(root: string): Promise<boolean> {
  if (await exists(path.join(root, "android"))) return true;
  const androidMarkers = [
    "settings.gradle",
    "settings.gradle.kts",
    "build.gradle",
    "build.gradle.kts",
    path.join("app", "src", "main", "AndroidManifest.xml")
  ];
  for (const marker of androidMarkers) {
    if (await exists(path.join(root, marker))) return true;
  }
  return false;
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(
    () => true,
    () => false
  );
}

async function collectSourceFiles(
  dir: string,
  output: string[],
  options: { includeTests: boolean; maxFiles: number }
): Promise<void> {
  if (output.length >= options.maxFiles) return;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (output.length >= options.maxFiles) return;
    if (entry.name.startsWith(".") && ![".storybook"].includes(entry.name)) continue;
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        ["node_modules", "dist", "build", ".dart_tool", ".gradle", "Pods", ".mobiloop"].includes(
          entry.name
        )
      )
        continue;
      if (!options.includeTests && ["test", "tests", "__tests__"].includes(entry.name)) continue;
      await collectSourceFiles(filePath, output, options);
    } else if (entry.isFile() && /\.(dart|kt|java|swift|m|mm|js|jsx|ts|tsx)$/.test(entry.name)) {
      output.push(filePath);
    }
  }
}

function detectScreens(
  line: string,
  file: string,
  lineNumber: number,
  analysis: CodeFlowAnalysis
): void {
  const patterns = [
    /class\s+([A-Z][A-Za-z0-9_]*(?:Screen|Page|View|Route|Flow)?)\s+extends\s+(?:StatelessWidget|StatefulWidget|ConsumerWidget|HookWidget)/,
    /(?:fun|class)\s+([A-Z][A-Za-z0-9_]*(?:Screen|Activity|Fragment|View))/,
    /struct\s+([A-Z][A-Za-z0-9_]*(?:View|Screen))\s*:\s*View/,
    /const\s+([A-Z][A-Za-z0-9_]*(?:Screen|Page|View))\s*[:=]/
  ];
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match?.[1]) {
      analysis.screens.push({ name: match[1], file, line: lineNumber, confidence: 0.75 });
    }
  }
}

function detectRoutes(
  line: string,
  file: string,
  lineNumber: number,
  analysis: CodeFlowAnalysis
): void {
  const routeMap = line.match(
    /['"]([^'"]+)['"]\s*:\s*(?:\([^)]*\)\s*=>\s*)?([A-Z][A-Za-z0-9_]*)\s*\(/
  );
  if (routeMap?.[1] && routeMap[2] && isLikelyRouteTarget(routeMap[1], routeMap[2], file)) {
    analysis.routes.push({
      route: routeMap[1],
      target: routeMap[2],
      file,
      line: lineNumber,
      confidence: 0.72
    });
  }
  const goRoute = line.match(
    /GoRoute\s*\([^)]*path\s*:\s*['"]([^'"]+)['"][^)]*(?:name\s*:\s*['"]([^'"]+)['"])?/
  );
  if (goRoute?.[1]) {
    analysis.routes.push({
      route: goRoute[1],
      target: goRoute[2],
      file,
      line: lineNumber,
      confidence: 0.72
    });
  }
  const rnScreen = line.match(
    /<Stack\.Screen[^>]*name=['"]([^'"]+)['"][^>]*(?:component=\{([A-Z][A-Za-z0-9_]*)\})?/
  );
  if (rnScreen?.[1]) {
    analysis.routes.push({
      route: rnScreen[1],
      target: rnScreen[2],
      file,
      line: lineNumber,
      confidence: 0.7
    });
  }
}

function isLikelyRouteTarget(route: string, target: string, file: string): boolean {
  if (["Color", "TextStyle", "Icon", "EdgeInsets", "BorderRadius"].includes(target)) return false;
  if (/(Screen|Page|View|Route|Activity|Fragment)$/.test(target)) return true;
  if (route.startsWith("/") && /(?:router|route|navigation|nav)/i.test(file)) return true;
  return false;
}

function detectTransitions(
  line: string,
  file: string,
  lineNumber: number,
  analysis: CodeFlowAnalysis
): void {
  const patterns: Array<[RegExp, string]> = [
    [
      /Navigator\.(?:pushNamed|restorablePushNamed)\s*\([^,]+,\s*['"]([^'"]+)['"]/,
      "navigator.pushNamed"
    ],
    [
      /Navigator\.push\s*\([^)]*MaterialPageRoute[^)]*builder\s*:\s*\([^)]*\)\s*=>\s*([A-Z][A-Za-z0-9_]*)\s*\(/,
      "navigator.push"
    ],
    [/context\.(?:go|push|replace)\s*\(\s*['"]([^'"]+)['"]/, "go_router"],
    [/navigation\.navigate\s*\(\s*['"]([^'"]+)['"]/, "react-navigation"],
    [/startActivity\s*\([^)]*([A-Z][A-Za-z0-9_]*Activity)::class\.java/, "android.startActivity"]
  ];
  for (const [pattern, trigger] of patterns) {
    const match = line.match(pattern);
    if (match?.[1]) {
      analysis.transitions.push({
        to: match[1],
        trigger,
        file,
        line: lineNumber,
        confidence: 0.68
      });
    }
  }
}

function detectVisibleTexts(
  line: string,
  file: string,
  lineNumber: number,
  analysis: CodeFlowAnalysis
): void {
  const patterns = [
    /Text\s*\(\s*['"]([^'"]{2,80})['"]/g,
    /(?:title|label|hintText|semanticLabel|contentDescription)\s*[:=]\s*['"]([^'"]{2,80})['"]/g,
    /<Text[^>]*>\s*([^<>{}]{2,80})\s*<\/Text>/g
  ];
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      const text = match[1]?.trim();
      if (text && !/[{};]/.test(text)) {
        analysis.visibleTexts.push({ text, file, line: lineNumber });
      }
    }
  }
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(item);
  }
  return output;
}
