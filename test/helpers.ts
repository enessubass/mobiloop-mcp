import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ServerConfig } from "../src/types.js";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export interface MockAppium {
  serverUrl: string;
  requests: Array<{ method: string; path: string; body: Record<string, unknown> }>;
  close(): void;
}

export async function createTestConfig(options: Partial<ServerConfig> = {}): Promise<ServerConfig> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mobiloop-test-"));
  return {
    workspaceRoot: root,
    artifactsDir: path.join(root, ".mobiloop"),
    runId: undefined,
    maxCommandMs: 5_000,
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
    forbiddenPathGlobs: [".env", ".env.*", "**/*secret*"],
    toolPolicies: {},
    requireApproval: false,
    redactArtifacts: true,
    ...options
  };
}

export async function startMockAppium(): Promise<MockAppium> {
  const requests: MockAppium["requests"] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const rawUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl);
    const route = url.pathname;
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string" && init.body.length > 0
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    requests.push({ method, path: route, body });

    if (method === "POST" && route === "/session") {
      return response({ value: { sessionId: "s1", capabilities: { platformName: "Android" } } });
    }
    if (method === "GET" && route === "/session/s1") {
      return response({ value: { sessionId: "s1" } });
    }
    if (method === "DELETE" && route === "/session/s1") {
      return response({ value: null });
    }
    if (method === "GET" && route === "/session/s1/source") {
      return response({ value: pageSource() });
    }
    if (method === "GET" && route === "/session/s1/screenshot") {
      return response({ value: ONE_PIXEL_PNG });
    }
    if (method === "POST" && route === "/session/s1/element") {
      return response({ value: elementFor(String(body.value ?? "")) });
    }
    if (method === "POST" && /^\/session\/s1\/element\/[^/]+\/(click|clear|value)$/.test(route)) {
      return response({ value: null });
    }
    if (method === "POST" && route === "/session/s1/actions") {
      return response({ value: null });
    }
    if (method === "POST" && route === "/session/s1/back") {
      return response({ value: null });
    }

    return response(
      { value: { error: "unknown command", message: `Unhandled ${method} ${route}` } },
      404
    );
  };

  return {
    serverUrl: "http://mock-appium.local",
    requests,
    close: () => {
      globalThis.fetch = originalFetch;
    }
  };
}

function pageSource(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy>
  <android.widget.EditText text="E-posta" resource-id="email" />
  <android.widget.EditText text="Şifre" resource-id="password" />
  <android.widget.Button text="Giriş Yap" content-desc="Giriş Yap" clickable="true" />
  <android.widget.TextView text="Ana Sayfa" />
</hierarchy>`;
}

function elementFor(selector: string): Record<string, string> {
  if (selector.includes("E-posta")) return element("email");
  if (selector.includes("Şifre")) return element("password");
  if (selector.includes("@content-desc='Giriş Yap'")) return element("login");
  if (selector.includes("Giriş Yap")) return element("login");
  if (selector.includes("Ana Sayfa")) return element("home");
  return element("generic");
}

function element(id: string): Record<string, string> {
  return { "element-6066-11e4-a52e-4f735466cecf": id };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
