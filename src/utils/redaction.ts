const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /Bearer\s+[A-Za-z0-9._~+/=-]+/g, replacement: "Bearer [REDACTED_TOKEN]" },
  { pattern: /AIza[0-9A-Za-z_-]{35}/g, replacement: "[REDACTED_GOOGLE_API_KEY]" },
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: "[REDACTED_AWS_ACCESS_KEY]" },
  { pattern: /ghp_[A-Za-z0-9_]{20,}/g, replacement: "[REDACTED_GITHUB_TOKEN]" },
  { pattern: /github_pat_[A-Za-z0-9_]{20,}/g, replacement: "[REDACTED_GITHUB_TOKEN]" },
  { pattern: /sk-[A-Za-z0-9]{20,}/g, replacement: "[REDACTED_OPENAI_KEY]" },
  { pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g, replacement: "[REDACTED_SLACK_TOKEN]" },
  {
    pattern: /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    replacement: "[REDACTED_JWT]"
  },
  {
    pattern:
      /\b(password|passwd|pwd|secret|token|api[_-]?key|session[_-]?cookie)(["'\s:=]+)([^"',\s}]+)/gi,
    replacement: "$1$2[REDACTED_SECRET]"
  },
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]"
  },
  {
    pattern: /\b(?:\+?\d[\s.-]?){9,15}\b/g,
    replacement: "[REDACTED_PHONE]"
  }
];

export function redactText(value: string): string {
  let redacted = value;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

export function redactJsonValue<T>(value: T): T {
  if (typeof value === "string") {
    return redactText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactJsonValue(entry)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactJsonValue(entry)])
    ) as T;
  }
  return value;
}
