import { createHash } from "node:crypto";

import { ArtDirectionError } from "./types.js";

const ID_PATTERN = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const HEX_PATTERN = /^#[a-fA-F0-9]{6}$/u;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

export function visualContinuityFail(
  code: string,
  message: string,
  details?: unknown,
): never {
  throw new ArtDirectionError(code, message, details);
}

export function visualContinuityRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

export function visualContinuityExactKeys(
  value: Record<string, unknown>,
  label: string,
  allowed: readonly string[],
): void {
  const accepted = new Set(allowed);
  const unknownKeys = Object.keys(value).filter((key) => !accepted.has(key));
  if (unknownKeys.length > 0) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} contains unsupported fields: ${unknownKeys.join(", ")}.`,
    );
  }
}

export function visualContinuityText(
  value: unknown,
  label: string,
  maximum = 4096,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be a non-empty string.`,
    );
  }
  const output = value.trim();
  if (output.length > maximum) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must not exceed ${maximum} characters.`,
    );
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(output)) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} contains unsupported control characters.`,
    );
  }
  return output;
}

export function visualContinuityOptionalText(
  value: unknown,
  label: string,
  maximum = 4096,
): string | undefined {
  return value === undefined
    ? undefined
    : visualContinuityText(value, label, maximum);
}

export function visualContinuityIdentifier(
  value: unknown,
  label: string,
): string {
  const output = visualContinuityText(value, label, 160);
  if (!ID_PATTERN.test(output) || output.includes("..")) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be a canonical lowercase identifier.`,
    );
  }
  return output;
}

export function visualContinuitySha256(
  value: unknown,
  label: string,
): string {
  const output = visualContinuityText(value, label, 64).toLowerCase();
  if (!SHA256_PATTERN.test(output)) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be a SHA-256 hex digest.`,
    );
  }
  return output;
}

export function visualContinuityHex(
  value: unknown,
  label: string,
): string {
  const output = visualContinuityText(value, label, 7);
  if (!HEX_PATTERN.test(output)) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be a six-digit hex colour.`,
    );
  }
  return output.toLowerCase();
}

export function visualContinuitySemver(
  value: unknown,
  label: string,
): string {
  const output = visualContinuityText(value, label, 80);
  if (!SEMVER_PATTERN.test(output)) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be a semantic version.`,
    );
  }
  return output;
}

export function visualContinuityNumber(
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
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

export function visualContinuityInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const output = visualContinuityNumber(value, label, minimum, maximum);
  if (!Number.isInteger(output)) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be an integer.`,
    );
  }
  return output;
}

export function visualContinuityBoolean(
  value: unknown,
  label: string,
): boolean {
  if (typeof value !== "boolean") {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be boolean.`,
    );
  }
  return value;
}

export function visualContinuityEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T {
  const output = visualContinuityText(value, label, 100);
  if (!allowed.includes(output as T)) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be one of: ${allowed.join(", ")}.`,
    );
  }
  return output as T;
}

export function visualContinuityArray(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = 1024,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must contain between ${minimum} and ${maximum} items.`,
    );
  }
  return value;
}

export function visualContinuityTextArray(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = 256,
  maximumText = 1000,
): readonly string[] {
  const output = visualContinuityArray(value, label, minimum, maximum).map(
    (item, index) =>
      visualContinuityText(item, `${label}[${index}]`, maximumText),
  );
  visualContinuityAssertUnique(output, label, (item) => item);
  return output;
}

export function visualContinuityIdentifierArray(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = 256,
): readonly string[] {
  const output = visualContinuityArray(value, label, minimum, maximum).map(
    (item, index) => visualContinuityIdentifier(item, `${label}[${index}]`),
  );
  visualContinuityAssertUnique(output, label, (item) => item);
  return output;
}

export function visualContinuityAssertUnique<T>(
  values: readonly T[],
  label: string,
  key: (value: T) => string,
): void {
  const found = new Set<string>();
  for (const value of values) {
    const itemKey = key(value);
    if (found.has(itemKey)) {
      visualContinuityFail(
        "VISUAL_CONTINUITY_DUPLICATE_ID",
        `${label} contains duplicate value ${itemKey}.`,
      );
    }
    found.add(itemKey);
  }
}

export function visualContinuityAssertKnownIds(
  ids: readonly string[],
  known: ReadonlySet<string>,
  label: string,
): void {
  const unknownIds = ids.filter((id) => !known.has(id));
  if (unknownIds.length > 0) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_REFERENCE_INVALID",
      `${label} contains unknown IDs: ${unknownIds.join(", ")}.`,
    );
  }
}

export function visualContinuityIsoDateTime(
  value: unknown,
  label: string,
): string {
  const output = visualContinuityText(value, label, 80);
  if (!output.includes("T") || Number.isNaN(Date.parse(output))) {
    visualContinuityFail(
      "VISUAL_CONTINUITY_INPUT_INVALID",
      `${label} must be an ISO date-time.`,
    );
  }
  return output;
}

export function visualContinuityCanonicalSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(visualContinuityCanonicalSort);
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(input)
      .sort()
      .map((key) => [key, visualContinuityCanonicalSort(input[key])]),
  );
}

export function visualContinuityHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(visualContinuityCanonicalSort(value)))
    .digest("hex");
}

export function visualContinuityFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((item) => visualContinuityFreeze(item));
    return Object.freeze(value) as T;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      visualContinuityFreeze(item),
    );
    return Object.freeze(value);
  }
  return value;
}
