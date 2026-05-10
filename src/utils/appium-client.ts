import fs from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { ServerConfig } from "../types.js";
import { writeArtifactBuffer, writeArtifactText } from "./artifacts.js";

export type LocatorStrategy =
  | "accessibility id"
  | "id"
  | "xpath"
  | "text"
  | "class name"
  | "android uiautomator"
  | "ios predicate string";

export interface Locator {
  strategy: LocatorStrategy;
  value: string;
}

export interface AppiumRequestOptions {
  serverUrl: string;
}

export class AppiumClient {
  constructor(private readonly options: AppiumRequestOptions) {}

  async createSession(capabilities: Record<string, unknown>): Promise<{ sessionId: string; value: unknown }> {
    const body = capabilities.capabilities
      ? capabilities
      : { capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } };
    const response = await this.request("POST", "/session", body);
    const sessionId = readSessionId(response);
    return { sessionId, value: response };
  }

  async deleteSession(sessionId: string): Promise<unknown> {
    return this.request("DELETE", `/session/${sessionId}`);
  }

  async pageSource(sessionId: string): Promise<string> {
    const value = await this.request("GET", `/session/${sessionId}/source`);
    if (typeof value !== "string") {
      throw new Error("Appium source response was not a string");
    }
    return value;
  }

  async screenshotBase64(sessionId: string): Promise<string> {
    const value = await this.request("GET", `/session/${sessionId}/screenshot`);
    if (typeof value !== "string") {
      throw new Error("Appium screenshot response was not a string");
    }
    return value;
  }

  async saveScreenshot(config: ServerConfig, sessionId: string, prefix: string): Promise<string> {
    const base64 = await this.screenshotBase64(sessionId);
    return writeArtifactBuffer(config, "screenshots", prefix, "png", Buffer.from(base64, "base64"));
  }

  async savePageSource(config: ServerConfig, sessionId: string, prefix: string): Promise<string> {
    const source = await this.pageSource(sessionId);
    return writeArtifactText(config, "sources", prefix, "xml", source);
  }

  async findElement(sessionId: string, locator: Locator): Promise<string> {
    const using = locatorUsing(locator);
    const value = await this.request("POST", `/session/${sessionId}/element`, {
      using: using.using,
      value: using.value
    });
    return elementId(value);
  }

  async findElements(sessionId: string, locator: Locator): Promise<string[]> {
    const using = locatorUsing(locator);
    const value = await this.request("POST", `/session/${sessionId}/elements`, {
      using: using.using,
      value: using.value
    });
    if (!Array.isArray(value)) return [];
    return value.map(elementId);
  }

  async findTextTapTarget(sessionId: string, text: string): Promise<string> {
    const literal = xpathLiteral(text);
    const semanticMatch = `@text=${literal} or @label=${literal} or @name=${literal} or contains(@content-desc, ${literal})`;
    const clickableWithDescendant = `//*[@clickable='true' and (${semanticMatch} or .//*[${semanticMatch}])]`;
    try {
      return await this.findElement(sessionId, { strategy: "xpath", value: clickableWithDescendant });
    } catch {
      return this.findElement(sessionId, { strategy: "text", value: text });
    }
  }

  async clickElement(sessionId: string, element: string): Promise<unknown> {
    return this.request("POST", `/session/${sessionId}/element/${element}/click`, {});
  }

  async clearElement(sessionId: string, element: string): Promise<unknown> {
    return this.request("POST", `/session/${sessionId}/element/${element}/clear`, {});
  }

  async typeText(sessionId: string, element: string, text: string): Promise<unknown> {
    return this.request("POST", `/session/${sessionId}/element/${element}/value`, {
      text,
      value: [...text]
    });
  }

  async back(sessionId: string): Promise<unknown> {
    return this.request("POST", `/session/${sessionId}/back`, {});
  }

  async pointerTap(sessionId: string, x: number, y: number): Promise<unknown> {
    return this.pointerAction(sessionId, [
      { type: "pointerMove", duration: 0, x, y },
      { type: "pointerDown", button: 0 },
      { type: "pause", duration: 80 },
      { type: "pointerUp", button: 0 }
    ]);
  }

  async swipe(
    sessionId: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs: number
  ): Promise<unknown> {
    return this.pointerAction(sessionId, [
      { type: "pointerMove", duration: 0, x: startX, y: startY },
      { type: "pointerDown", button: 0 },
      { type: "pause", duration: 50 },
      { type: "pointerMove", duration: durationMs, x: endX, y: endY },
      { type: "pointerUp", button: 0 }
    ]);
  }

  async waitForVisible(sessionId: string, locator: Locator, timeoutMs: number): Promise<{ found: boolean; elementId?: string }> {
    const started = Date.now();
    let lastError: unknown;
    while (Date.now() - started < timeoutMs) {
      try {
        const found = await this.findElement(sessionId, locator);
        return { found: true, elementId: found };
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (lastError instanceof Error && !lastError.message.includes("no such element")) {
      return { found: false };
    }
    return { found: false };
  }

  async accessibilitySummary(sessionId: string): Promise<unknown> {
    const source = await this.pageSource(sessionId);
    const parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      textNodeName: "#text"
    }).parse(source);
    return summarizeXml(parsed);
  }

  private async pointerAction(sessionId: string, actions: Array<Record<string, unknown>>): Promise<unknown> {
    return this.request("POST", `/session/${sessionId}/actions`, {
      actions: [
        {
          type: "pointer",
          id: "finger1",
          parameters: { pointerType: "touch" },
          actions
        }
      ]
    });
  }

  private async request(method: string, route: string, body?: unknown): Promise<unknown> {
    const url = appiumUrl(this.options.serverUrl, route);
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`Appium ${method} ${route} failed (${response.status}): ${text}`);
    }
    if (payload && typeof payload === "object" && "value" in payload) {
      const value = (payload as { value: unknown }).value;
      if (isWebDriverError(value)) {
        throw new Error(`${value.error}: ${value.message}`);
      }
      return value;
    }
    return payload;
  }
}

export function locatorFromInput(input: Record<string, unknown>): Locator {
  const locator = input.locator;
  if (!locator || typeof locator !== "object" || Array.isArray(locator)) {
    throw new Error("locator must be an object");
  }
  const raw = locator as Record<string, unknown>;
  if (typeof raw.strategy !== "string" || typeof raw.value !== "string") {
    throw new Error("locator.strategy and locator.value are required strings");
  }
  return { strategy: raw.strategy as LocatorStrategy, value: raw.value };
}

export async function readFileIfExists(filePath: string): Promise<string | undefined> {
  return fs.readFile(filePath, "utf8").catch(() => undefined);
}

function appiumUrl(serverUrl: string, route: string): string {
  const base = new URL(serverUrl);
  const basePath = base.pathname.endsWith("/") ? base.pathname.slice(0, -1) : base.pathname;
  base.pathname = `${basePath}${route}`;
  return base.toString();
}

function readSessionId(response: unknown): string {
  if (response && typeof response === "object" && "sessionId" in response) {
    const sessionId = (response as { sessionId: unknown }).sessionId;
    if (typeof sessionId === "string") return sessionId;
  }
  if (response && typeof response === "object" && "capabilities" in response && "sessionId" in response) {
    const sessionId = (response as { sessionId: unknown }).sessionId;
    if (typeof sessionId === "string") return sessionId;
  }
  throw new Error("Could not read Appium sessionId");
}

function elementId(value: unknown): string {
  if (!value || typeof value !== "object") {
    throw new Error("Element response was empty");
  }
  const record = value as Record<string, unknown>;
  const id = record["element-6066-11e4-a52e-4f735466cecf"] ?? record.ELEMENT;
  if (typeof id !== "string") {
    throw new Error("Element id was missing from Appium response");
  }
  return id;
}

function locatorUsing(locator: Locator): { using: string; value: string } {
  if (locator.strategy === "text") {
    const value = xpathLiteral(locator.value);
    return {
      using: "xpath",
      value: `//*[@text=${value} or @label=${value} or @name=${value} or contains(@content-desc, ${value})]`
    };
  }
  return { using: locator.strategy, value: locator.value };
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return `concat(${value.split("'").map((part) => `'${part}'`).join(', "\"\'\"", ')})`;
}

function isWebDriverError(value: unknown): value is { error: string; message: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { error?: unknown }).error === "string" &&
      typeof (value as { message?: unknown }).message === "string"
  );
}

function summarizeXml(node: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (Array.isArray(node)) {
    return node.slice(0, 50).map((entry) => summarizeXml(entry, depth));
  }
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const key of ["class", "resource-id", "content-desc", "text", "label", "name", "enabled", "visible", "clickable"]) {
    if (record[key] !== undefined && record[key] !== "") summary[key] = record[key];
  }
  const childEntries = Object.entries(record)
    .filter(([key]) => !key.startsWith("@") && !["#text"].includes(key))
    .flatMap(([key, value]) => (typeof value === "object" ? [{ [key]: summarizeXml(value, depth + 1) }] : []));
  if (childEntries.length > 0) summary.children = childEntries.slice(0, 50);
  return summary;
}
