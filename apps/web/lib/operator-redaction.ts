const REDACTED = "[REDACTED]" as const;
const MAXIMUM_DEPTH = 32;
const EXACT_SECRET_KEYS = new Set([
  "leaseToken",
  "accessToken",
  "writeToken",
  "apiKey",
  "authorization",
  "password",
  "credential",
  "secret",
]);
const SECRET_KEY = /(?:^|[_-])(?:api[_-]?key|authorization|bearer|credential|password|secret|token)(?:$|[_-])/i;

function shouldRedact(key: string): boolean {
  if (EXACT_SECRET_KEYS.has(key)) return true;
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return SECRET_KEY.test(normalized);
}

export function redactOperatorValue(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > MAXIMUM_DEPTH) return "[MAXIMUM DEPTH]";
  if (Array.isArray(value)) {
    return value.map((entry) => redactOperatorValue(entry, depth + 1));
  }
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = shouldRedact(key)
      ? REDACTED
      : redactOperatorValue(entry, depth + 1);
  }
  return output;
}

export function containsUnredactedSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsUnredactedSecretKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, entry]) =>
      (shouldRedact(key) && entry !== REDACTED) ||
      containsUnredactedSecretKey(entry),
  );
}
