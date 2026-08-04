export const REVIEW_CRAFT_SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,199}$/;
export const REVIEW_CRAFT_SHA256 = /^sha256:[a-f0-9]{64}$/;
export const REVIEW_CRAFT_SHA1 = /^[a-f0-9]{40}$/;
export const REVIEW_CRAFT_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function canonicalReviewCraftJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export async function sha256ReviewCraftText(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("")}`;
}

export function reviewCraftRecord(value: unknown, label: string, blockers: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push(`${label} must be an object.`);
    return {};
  }
  return value as Record<string, unknown>;
}

export function rejectReviewCraftUnknown(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string, blockers: string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) blockers.push(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
}

export function reviewCraftId(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !REVIEW_CRAFT_SAFE_ID.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) {
    blockers.push(`${label} is invalid.`);
    return "invalid-id";
  }
  return value;
}

export function reviewCraftOptionalId(value: unknown, label: string, blockers: string[]): string | undefined {
  return value === undefined || value === null || value === "" ? undefined : reviewCraftId(value, label, blockers);
}

export function reviewCraftDigest(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !REVIEW_CRAFT_SHA256.test(value)) {
    blockers.push(`${label} must be an exact sha256 digest.`);
    return `sha256:${"0".repeat(64)}`;
  }
  return value;
}

export function reviewCraftOptionalDigest(value: unknown, label: string, blockers: string[]): string | undefined {
  return value === undefined || value === null || value === "" ? undefined : reviewCraftDigest(value, label, blockers);
}

export function reviewCraftText(value: unknown, label: string, blockers: string[], maximum: number, allowEmpty = false): string {
  if (typeof value !== "string" || value !== value.trim() || value.length > maximum || (!allowEmpty && value.length === 0) || /[\u0000-\u001f\u007f]/.test(value)) {
    blockers.push(`${label} is invalid.`);
    return allowEmpty ? "" : "invalid";
  }
  return value;
}

export function reviewCraftInteger(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    blockers.push(`${label} is invalid.`);
    return minimum;
  }
  return Number(value);
}

export function reviewCraftFinite(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    blockers.push(`${label} is invalid.`);
    return minimum;
  }
  return value;
}

export function reviewCraftBool(value: unknown, label: string, blockers: string[]): boolean {
  if (value !== true && value !== false) {
    blockers.push(`${label} must be boolean.`);
    return false;
  }
  return value;
}

export function reviewCraftTimestamp(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !REVIEW_CRAFT_ISO.test(value) || Number.isNaN(Date.parse(value))) {
    blockers.push(`${label} must be canonical UTC ISO-8601.`);
    return "1970-01-01T00:00:00.000Z";
  }
  return value;
}

export function reviewCraftIds(value: unknown, label: string, blockers: string[], maximum: number, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > maximum || (required && value.length === 0)) {
    blockers.push(`${label} is invalid or unbounded.`);
    return [];
  }
  const result = value.map((item) => reviewCraftId(item, label, blockers));
  const duplicates = duplicateReviewCraftValues(result);
  if (duplicates.length) blockers.push(`${label} contains duplicates: ${duplicates.join(", ")}.`);
  return uniqueReviewCraft(result).sort();
}

export function reviewCraftArray(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    blockers.push(`${label} must contain ${minimum}-${maximum} records.`);
    return [];
  }
  return value;
}

export function reviewCraftEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string, blockers: string[], fallback: T): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    blockers.push(`${label} is unsupported.`);
    return fallback;
  }
  return value as T;
}

export function uniqueReviewCraft<T>(values: T[]): T[] { return [...new Set(values)]; }
export function duplicateReviewCraftValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) seen.has(value) ? duplicates.add(value) : seen.add(value);
  return [...duplicates].sort();
}
export function roundReviewCraft(value: number, precision = 6): number { const scale = 10 ** precision; return Math.round(value * scale) / scale; }
export function intersectsReviewCraft(first: string[], second: string[]): string[] { const set = new Set(second); return first.filter((item) => set.has(item)); }
export function sameReviewCraftSet(first: string[], second: string[]): boolean { const left = new Set(first); const right = new Set(second); return left.size === right.size && [...left].every((item) => right.has(item)); }
