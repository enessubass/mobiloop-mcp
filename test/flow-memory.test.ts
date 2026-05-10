import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  analyzeCodeFlow,
  buildReplayPlan,
  createScreenSignature,
  emptyFlowMemory,
  screenSimilarity,
  FlowMemory
} from "../src/utils/flow-memory.js";
import { ServerConfig } from "../src/types.js";

test("screen signatures are stable and comparable across small runtime changes", () => {
  const first = createScreenSignature(`
    <hierarchy>
      <node class="android.widget.Button" text="İleri" clickable="true" resource-id="next_button" />
      <node class="android.widget.TextView" text="Binayı Kolayca Yönet" />
    </hierarchy>
  `);
  const second = createScreenSignature(`
    <hierarchy rotation="0">
      <node class="android.widget.Button" text="İleri" clickable="true" resource-id="next_button" bounds="[1,2][3,4]" />
      <node class="android.widget.TextView" text="Binayı Kolayca Yönet" focused="false" />
    </hierarchy>
  `);

  assert.equal(first.hash, second.hash);
  assert.equal(screenSimilarity(first, second), 1);
  assert.ok(first.clickableTexts.includes("İleri"));
});

test("replay plan starts from the matched historical checkpoint and stops at target", () => {
  const onboarding = createScreenSignature(`<hierarchy><node text="Binayı Kolayca Yönet" /><node text="İleri" clickable="true" /></hierarchy>`);
  const dues = createScreenSignature(`<hierarchy><node text="Şeffaf Aidat Takibi" /><node text="İleri" clickable="true" /></hierarchy>`);
  const login = createScreenSignature(`<hierarchy><node text="Giriş Yap" /><node text="Email" /></hierarchy>`);
  const memory: FlowMemory = {
    ...emptyFlowMemory(),
    checkpoints: [
      checkpoint("onboarding-1", "smoke", "Onboarding 1", 1, onboarding, "İleri"),
      checkpoint("onboarding-2", "smoke", "Onboarding 2", 2, dues, "İleri"),
      checkpoint("login", "smoke", "Login", 3, login)
    ],
    runs: [
      {
        id: "run-1",
        testName: "smoke",
        status: "passed",
        checkpointIds: ["onboarding-1", "onboarding-2", "login"],
        artifacts: [],
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:01:00.000Z"
      }
    ]
  };

  const plan = buildReplayPlan(memory, onboarding, { testName: "smoke", targetCheckpointId: "login" });

  assert.equal(plan.matched.checkpointId, "onboarding-1");
  assert.equal(plan.target.checkpointId, "login");
  assert.deepEqual(
    plan.actions.map((action) => action.args?.text),
    ["İleri", "İleri"]
  );
});

test("code-flow analysis detects common Flutter screens, routes, and visible texts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-flow-"));
  await fs.writeFile(path.join(root, "pubspec.yaml"), "name: sample\n", "utf8");
  await fs.mkdir(path.join(root, "lib"));
  await fs.writeFile(
    path.join(root, "lib", "main.dart"),
    `
      class LoginScreen extends StatelessWidget {
        Widget build(context) => Text('Giriş Yap');
      }
      final routes = {
        '/login': (context) => LoginScreen(),
      };
      void next(context) {
        Navigator.pushNamed(context, '/login');
      }
    `,
    "utf8"
  );

  const analysis = await analyzeCodeFlow(config(root), { maxFiles: 20 });

  assert.equal(analysis.framework, "flutter");
  assert.ok(analysis.screens.some((screen) => screen.name === "LoginScreen"));
  assert.ok(analysis.routes.some((route) => route.route === "/login" && route.target === "LoginScreen"));
  assert.ok(analysis.transitions.some((transition) => transition.to === "/login"));
  assert.ok(analysis.visibleTexts.some((entry) => entry.text === "Giriş Yap"));
});

function checkpoint(
  id: string,
  testName: string,
  name: string,
  order: number,
  signature: ReturnType<typeof createScreenSignature>,
  nextText?: string
) {
  return {
    id,
    testName,
    name,
    order,
    signature,
    actionToNext: nextText ? { tool: "appium.tap_by_text", args: { text: nextText } } : undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function config(root: string): ServerConfig {
  return {
    workspaceRoot: root,
    artifactsDir: path.join(root, ".mobiloop"),
    maxCommandMs: 120_000,
    maxOutputBytes: 1_048_576,
    maxFixAttempts: 3,
    maxTestIterations: 5,
    maxRuntimeMinutes: 30,
    allowedBranchPattern: "^feature/ai-[A-Za-z0-9._/-]+$",
    appiumServerUrl: "http://127.0.0.1:4723",
    adbPath: "adb",
    emulatorPath: "emulator",
    xcrunPath: "xcrun",
    xcodebuildPath: "xcodebuild",
    sqlitePath: "sqlite3",
    apiAllowlist: ["http://127.0.0.1:*", "http://localhost:*"],
    forbiddenPathGlobs: [".env", ".env.*"]
  };
}
