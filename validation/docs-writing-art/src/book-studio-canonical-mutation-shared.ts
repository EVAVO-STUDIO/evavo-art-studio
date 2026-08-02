export const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,199}$/;
export const OBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:+@/-]{1,299}$/;
export const SHA256 = /^sha256:[a-f0-9]{64}$/;
export const SHA1 = /^[a-f0-9]{40}$/;
export const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
export async function sha256Text(value: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, '0')).join('')}`;
}
export function record(value: unknown, label: string, blockers: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    blockers.push(`${label} must be an object.`);
    return {};
  }
  return value as Record<string, unknown>;
}
export function rejectUnknown(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string, blockers: string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) blockers.push(`${label} contains unsupported fields: ${unknown.join(', ')}.`);
}
export function id(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value) || ['__proto__','constructor','prototype'].includes(value)) {
    blockers.push(`${label} is invalid.`);
    return 'invalid-id';
  }
  return value;
}
export function optionalId(value: unknown, label: string, blockers: string[]): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : id(value, label, blockers);
}
export function objectId(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== 'string' || !OBJECT_ID.test(value) || value.includes('..')) {
    blockers.push(`${label} is invalid.`);
    return 'invalid-object';
  }
  return value;
}
export function digest(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    blockers.push(`${label} must be an exact sha256 digest.`);
    return `sha256:${'0'.repeat(64)}`;
  }
  return value;
}
export function gitSha(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== 'string' || !SHA1.test(value)) {
    blockers.push(`${label} must be an exact 40-character Git SHA-1.`);
    return '';
  }
  return value;
}
export function integer(value: unknown, label: string, blockers: string[], min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    blockers.push(`${label} is invalid.`);
    return min;
  }
  return Number(value);
}
export function text(value: unknown, label: string, blockers: string[], max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length > max || (!allowEmpty && !value.length) || /[\u0000-\u001f\u007f]/.test(value)) {
    blockers.push(`${label} is invalid.`);
    return allowEmpty ? '' : 'invalid';
  }
  return value;
}
export function timestamp(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    blockers.push(`${label} must be canonical UTC ISO-8601.`);
    return '1970-01-01T00:00:00.000Z';
  }
  return value;
}
export function bool(value: unknown, label: string, blockers: string[]): boolean {
  if (value !== true && value !== false) {
    blockers.push(`${label} must be boolean.`);
    return false;
  }
  return value;
}
export function ids(value: unknown, label: string, blockers: string[], max: number, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > max || (required && !value.length)) {
    blockers.push(`${label} is invalid or unbounded.`);
    return [];
  }
  const result = value.map((item) => id(item, label, blockers));
  const duplicates = duplicateValues(result);
  if (duplicates.length) blockers.push(`${label} contains duplicates: ${duplicates.join(', ')}.`);
  return unique(result).sort();
}
export function array(value: unknown, label: string, blockers: string[], min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    blockers.push(`${label} must contain ${min}-${max} records.`);
    return [];
  }
  return value;
}
export function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string, blockers: string[], fallback: T): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    blockers.push(`${label} is unsupported.`);
    return fallback;
  }
  return value as T;
}
export function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
export function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>(); const duplicated = new Set<string>();
  for (const value of values) seen.has(value) ? duplicated.add(value) : seen.add(value);
  return [...duplicated].sort();
}
export function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
