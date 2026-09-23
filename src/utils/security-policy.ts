import { assertApiAllowed } from "./api-allowlist.js";
import { McpTool, ServerConfig } from "../types.js";

const SECURE_ENSURE_APPIUM_OVERRIDES = new Set([
  "serverUrl",
  "address",
  "port",
  "appiumCommand",
  "useNpx",
  "appiumHome"
]);

export function enforceToolSecurityPolicy(
  tool: McpTool,
  input: unknown,
  config: ServerConfig
): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const serverUrls = collectNamedValues(input, "serverUrl");
  if (config.securityMode === "secure" && serverUrls.length > 0) {
    throw new Error(
      "serverUrl overrides are disabled in secure mode; configure APPIUM_SERVER_URL in the host environment"
    );
  }
  for (const serverUrl of serverUrls) {
    if (typeof serverUrl !== "string") throw new Error("serverUrl must be a string");
    assertApiAllowed(serverUrl, config.appiumAllowlist);
  }

  if (tool.name !== "env.ensure_appium") return;
  const args = input as Record<string, unknown>;
  if (config.securityMode === "secure") {
    for (const key of SECURE_ENSURE_APPIUM_OVERRIDES) {
      if (args[key] !== undefined) {
        throw new Error(`${key} cannot be overridden in secure mode`);
      }
    }
    if (
      args.driverName !== undefined &&
      args.driverName !== "uiautomator2" &&
      args.driverName !== "xcuitest"
    ) {
      throw new Error("secure mode only permits the uiautomator2 or xcuitest Appium drivers");
    }
  }
}

function collectNamedValues(input: unknown, property: string): unknown[] {
  if (Array.isArray(input)) return input.flatMap((entry) => collectNamedValues(entry, property));
  if (!input || typeof input !== "object") return [];
  const record = input as Record<string, unknown>;
  const direct = Object.prototype.hasOwnProperty.call(record, property) ? [record[property]] : [];
  return [
    ...direct,
    ...Object.values(record).flatMap((entry) => collectNamedValues(entry, property))
  ];
}
