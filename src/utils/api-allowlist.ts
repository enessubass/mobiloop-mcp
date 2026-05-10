import { matchesGlob } from "./path-guard.js";

export function assertApiAllowed(urlText: string, allowlist: string[]): void {
  const url = new URL(urlText);
  if (allowlist.length === 0) return;
  const candidates = [
    `${url.protocol}//${url.hostname}`,
    `${url.protocol}//${url.hostname}:${url.port || defaultPort(url.protocol)}`,
    `${url.protocol}//${url.host}`,
    url.origin
  ];
  for (const allowed of allowlist) {
    if (candidates.some((candidate) => matchesGlob(candidate, allowed))) {
      return;
    }
  }
  throw new Error(`API URL is not allowed by apiAllowlist: ${url.origin}`);
}

function defaultPort(protocol: string): string {
  if (protocol === "https:") return "443";
  if (protocol === "http:") return "80";
  return "";
}
