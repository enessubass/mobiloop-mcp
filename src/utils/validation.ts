export function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Input must be an object");
  }
  return input as Record<string, unknown>;
}

export function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required string: ${key}`);
  }
  return value;
}

export function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }
  return value;
}

export function optionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

export function optionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number`);
  }
  return value;
}

export function optionalStringArray(
  input: Record<string, unknown>,
  key: string
): string[] | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value;
}

export function optionalObject(
  input: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function asOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

export function asOptionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asOptionalBoolean(
  input: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = input[key];
  return typeof value === "boolean" ? value : undefined;
}

export function asOptionalStringArray(
  input: Record<string, unknown>,
  key: string
): string[] | undefined {
  const value = input[key];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
}

export function stringEnum<T extends string>(
  input: Record<string, unknown>,
  key: string,
  values: readonly T[],
  fallback?: T
): T {
  const value = input[key];
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required enum: ${key}`);
  }
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`${key} must be one of: ${values.join(", ")}`);
  }
  return value as T;
}

export function unknownJsonObject(
  input: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const value = input[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must be an object`);
  }
  return value as Record<string, unknown>;
}
