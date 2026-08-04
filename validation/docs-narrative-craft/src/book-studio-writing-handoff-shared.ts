import type { BookProviderId } from "./book-studio-project-contracts";
import type {
  BookWritingHandoffRequestV1,
  BookWritingHandoffResponseV1,
  BookWritingHandoffValidationResultV1,
} from "./book-studio-writing-handoff-types";

export const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,199}$/;
export const SHA256 = /^sha256:[a-f0-9]{64}$/;
export const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
export const PROVIDERS = new Set<BookProviderId>(["chatgpt", "claude", "other_compatible_model"]);
export type RecordValue = Record<string, unknown>;

export function validation(
  status: BookWritingHandoffValidationResultV1["status"],
  request: BookWritingHandoffRequestV1 | undefined,
  response: BookWritingHandoffResponseV1 | undefined,
  blockers: string[],
  requiredActions: string[],
): BookWritingHandoffValidationResultV1 {
  return {
    outputKind: "evavo_docs_writing_handoff_validation",
    schemaVersion: 1,
    status,
    ...(request === undefined ? {} : { request, requestFingerprint: request.requestFingerprint }),
    ...(response === undefined ? {} : { response, responseFingerprint: response.responseFingerprint }),
    blockers: unique(blockers),
    requiredActions: unique(requiredActions),
    manuscriptMutationPerformed: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}
export function object(value: unknown, label: string, blockers: string[]): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push(`${label} must be an object.`);
    return {};
  }
  return value as RecordValue;
}
export function rejectUnknown(value: RecordValue, allowed: Set<string>, label: string, blockers: string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) blockers.push(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
}
export function checkLiteral(value: unknown, expected: unknown, label: string, blockers: string[]): void {
  if (value !== expected) blockers.push(`${label} is invalid.`);
}
export function id(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SAFE_ID.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) {
    blockers.push(`${label} is invalid.`);
    return "invalid-id";
  }
  return value;
}
export function ids(value: unknown, label: string, blockers: string[], maximum: number, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > maximum || (required && value.length < 1)) {
    blockers.push(`${label} is invalid or unbounded.`);
    return [];
  }
  const result = value.map((item) => id(item, label, blockers));
  if (new Set(result).size !== result.length) blockers.push(`${label} contains duplicates.`);
  return unique(result).sort();
}
export function enumIds(value: unknown, label: string, blockers: string[]): BookProviderId[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    blockers.push(`${label} is invalid.`);
    return [];
  }
  const result = value.map((item) => enumValue(item, PROVIDERS, label, blockers, "other_compatible_model"));
  if (new Set(result).size !== result.length) blockers.push(`${label} contains duplicates.`);
  return unique(result).sort();
}
export function enumValue<T extends string>(value: unknown, allowed: Set<T>, label: string, blockers: string[], fallback: T): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    blockers.push(`${label} is unsupported.`);
    return fallback;
  }
  return value as T;
}
export function digest(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    blockers.push(`${label} must be an exact sha256 digest.`);
    return `sha256:${"0".repeat(64)}`;
  }
  return value;
}
export function digests(value: unknown, label: string, blockers: string[], maximum: number, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > maximum || (required && value.length < 1)) {
    blockers.push(`${label} is invalid or unbounded.`);
    return [];
  }
  const result = value.map((item) => digest(item, label, blockers));
  if (new Set(result).size !== result.length) blockers.push(`${label} contains duplicates.`);
  return unique(result);
}
export function timestamp(value: unknown, label: string, blockers: string[]): string {
  if (
    typeof value !== "string"
    || !ISO_TIMESTAMP.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) {
    blockers.push(`${label} must be canonical UTC ISO-8601.`);
    return "1970-01-01T00:00:00.000Z";
  }
  return value;
}
export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
