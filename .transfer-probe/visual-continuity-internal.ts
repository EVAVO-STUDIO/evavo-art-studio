import { createHash } from "node:crypto";

import { ArtDirectionError } from "./types.js";

const ID_PATTERN = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/u;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const HEX_PATTERN = /^#[a-fA-F0-9]{6}$/u;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

export function fail(code: string, message: string, details?: unknown): never {
  throw new ArtDirectionError(code, message, details);
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("VISUAL_CONTINUITY_INPUT_INVALID", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function exactKeys(
  value: Record<string, unknown>,
  label: string,
  allowed: readonly string[],
): void {
  const accepted = new Set(allowed);
  const unknownKeys = Object.keys(value).filter((key) => !accepted.has(key));
  if (unknownKeys.length > 0) {
    fail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} contains unsupported fields: ${unknownKeys.join(", ")}.`,
    );
  }
}

export function text(
  value: unknown,
  label: string,
  maximum = 4096,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("VISUAL_CONTINUITY_INPUT_INVALID", `${label} must be a non-empty string.`);
  }
  const output = value.trim();
  if (output.length > maximum) {
    fail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must not exceed ${maximum} characters.`,
    );
  }
  for (const character of output) {
    const code = character.charCodeAt(0);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      fail(
        "VISUAL_CONTINUITY_INPUT_INVALID",
        `${label} contains unsupported control characters.`,
      );
    }
  }
  return output;
}

export function optionalText(
  value: unknown,
  label: string,
  maximum = 4096,
): string | undefined {
  return value === undefined ? undefined : text(value, label, maximum);
}

export function identifier(value: unknown, label: string): string {
  const output = text(value, label, 160);
  if (!ID_PATTERN.test(output) || output.includes("..")) {
    fail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be a canonical lowercase identifier.`,
    );
  }
  return output;
}

export function sha256Value(value: unknown, label: string): string {
  const output = text(value, label, 64).toLowerCase();
  if (!SHA256_PATTERN.test(output)) {
    fail("VISUAL_CONTINUITY_INPUT_INVALID", `${label} must be a SHA-256 hex digest.`);
  }
  return output;
}

export function hexValue(value: unknown, label: string): string {
  const output = text(value, label, 7);
  if (!HEX_PATTERN.test(output)) {
    fail("VISUAL_CONTINUITY_INPUT_INVALID", `${label} must be a six-digit hex colour.`);
  }
  return output.toLowerCase();
}

export function semverValue(value: unknown, label: string): string {
  const output = text(value, label, 80);
  if (!SEMVER_PATTERN.test(output)) {
    fail("VISUAL_CONTINUITY_INPUT_INVALID", `${label} must be a semantic version.`);
  }
  return output;
}

export function finiteNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

export function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const output = finiteNumber(value, label, minimum, maximum);
  if (!Number.isInteger(output)) {
    fail("VISUAL_CONTINUITY_INPUT_INVALID", `${label} must be an integer.`);
  }
  return output;
}

export function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    fail("VISUAL_CONTINUITY_INPUT_INVALID", `${label} must be boolean.`);
  }
  return value;
}

export function literalTrue(value: unknown, label: string): true {
  if (value !== true) {
    fail("VISUAL_CONTINUITY_POLICY_INVALID", `${label} must remain true.`);
  }
  return true;
}

export function literalFalse(value: unknown, label: string): false {
  if (value !== false) {
    fail("VISUAL_CONTINUITY_POLICY_INVALID", `${label} must remain false.`);
  }
  return false;
}

export function enumValue<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T {
  const output = text(value, label, 100);
  if (!allowed.includes(output as T)) {
    fail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be one of: ${allowed.join(", ")}.`,
    );
  }
  return output as T;
}

export function arrayValue(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = 1024,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must contain between ${minimum} and ${maximum} items.`,
    );
  }
  return value;
}

export function textArray(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = 256,
  maximumText = 1000,
): readonly string[] {
  const output = arrayValue(value, label, minimum, maximum).map((item, index) =>
    text(item, `${label}[${index}]`, maximumText),
  );
  assertUnique(output, label, (item) => item);
  return output;
}

export function optionalTextArray(
  value: unknown,
  label: string,
): readonly string[] {
  return value === undefined ? [] : textArray(value, label);
}

export function identifierArray(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = 256,
): readonly string[] {
  const output = arrayValue(value, label, minimum, maximum).map((item, index) =>
    identifier(item, `${label}[${index}]`),
  );
  assertUnique(output, label, (item) => item);
  return output;
}

export function optionalIdentifierArray(
  value: unknown,
  label: string,
): readonly string[] {
  return value === undefined ? [] : identifierArray(value, label);
}

export function assertUnique<T>(
  values: readonly T[],
  label: string,
  key: (value: T) => string,
): void {
  const found = new Set<string>();
  for (const value of values) {
    const itemKey = key(value);
    if (found.has(itemKey)) {
      fail(
        "VISUAL_CONTINUITY_DUPLICATE_ID",
        `${label} contains duplicate value ${itemKey}.`,
      );
    }
    found.add(itemKey);
  }
}

export function assertKnownIds(
  ids: readonly string[],
  known: ReadonlySet<string>,
  label: string,
): void {
  const unknownIds = ids.filter((id) => !known.has(id));
  if (unknownIds.length > 0) {
    fail(
      "VISUAL_CONTINUITY_REFERENCE_INVALID",
      `${label} contains unknown IDs: ${unknownIds.join(", ")}.`,
    );
  }
}

export function dimensions(
  value: unknown,
  label: string,
  maximum = 32768,
): Readonly<{ width: number; height: number }> {
  const input = record(value, label);
  exactKeys(input, label, ["width", "height"]);
  return {
    width: integer(input.width, `${label}.width`, 1, maximum),
    height: integer(input.height, `${label}.height`, 1, maximum),
  };
}

export function point(
  value: unknown,
  label: string,
  maximumX: number,
  maximumY: number,
): Readonly<{ x: number; y: number }> {
  const input = record(value, label);
  exactKeys(input, label, ["x", "y"]);
  return {
    x: finiteNumber(input.x, `${label}.x`, -maximumX, maximumX),
    y: finiteNumber(input.y, `${label}.y`, -maximumY, maximumY),
  };
}

export function isoDateTime(value: unknown, label: string): string {
  const output = text(value, label, 80);
  if (!output.includes("T") || Number.isNaN(Date.parse(output))) {
    fail("VISUAL_CONTINUITY_INPUT_INVALID", `${label} must be an ISO date-time.`);
  }
  return output;
}

export function canonicalSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSort);
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(input)
      .sort()
      .map((key) => [key, canonicalSort(input[key])]),
  );
}

export function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalSort(value)))
    .digest("hex");
}

export function freeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((item) => freeze(item));
    return Object.freeze(value) as T;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => freeze(item));
    return Object.freeze(value);
  }
  return value;
}

export function sortById<T extends Readonly<{ id: string }>>(values: readonly T[]): readonly T[] {
  return [...values].sort((left, right) => left.id.localeCompare(right.id));
}
