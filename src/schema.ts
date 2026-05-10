import { JsonObject } from "./types.js";

export function objectSchema(
  properties: JsonObject,
  required: string[] = [],
  additionalProperties = false
): JsonObject {
  return {
    type: "object",
    properties,
    required,
    additionalProperties
  };
}

export const stringSchema: JsonObject = { type: "string" };
export const booleanSchema: JsonObject = { type: "boolean" };
export const numberSchema: JsonObject = { type: "number" };

export function arraySchema(items: JsonObject): JsonObject {
  return { type: "array", items };
}

export function enumSchema(values: string[]): JsonObject {
  return { type: "string", enum: values };
}

export function locatorSchema(): JsonObject {
  return objectSchema(
    {
      strategy: enumSchema([
        "accessibility id",
        "id",
        "xpath",
        "text",
        "class name",
        "android uiautomator",
        "ios predicate string"
      ]),
      value: stringSchema
    },
    ["strategy", "value"]
  );
}
