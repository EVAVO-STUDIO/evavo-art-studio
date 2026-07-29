export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

export function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(Math.trunc(left));
  let b = Math.abs(Math.trunc(right));
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function greatestCommonDivisorOf(values: readonly number[]): number {
  if (values.length === 0) return 1;
  return values.reduce((result, value) => greatestCommonDivisor(result, value));
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
