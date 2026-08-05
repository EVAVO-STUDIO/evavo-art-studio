import { createHash } from "node:crypto";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)])
  );
}

export function stableEvavoLegacyCraftJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sha256EvavoLegacyCraftText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function fingerprintEvavoLegacyCraftValue(value: unknown): string {
  return sha256EvavoLegacyCraftText(stableEvavoLegacyCraftJson(value));
}
