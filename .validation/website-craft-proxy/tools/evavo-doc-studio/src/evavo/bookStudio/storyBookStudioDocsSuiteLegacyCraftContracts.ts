import type {
  EvavoLegacyCraftOperation,
  EvavoLegacyCraftPublicRequest
} from "./storyBookStudioDocsSuiteLegacyCraftTypes";

export const EVAVO_LEGACY_CRAFT_OPERATIONS = Object.freeze([
  "compile_profile",
  "create_provider_packet",
  "validate_provider_response",
  "scan_phrase_overlap"
] as const satisfies readonly EvavoLegacyCraftOperation[]);

const OPERATION_SET = new Set<string>(EVAVO_LEGACY_CRAFT_OPERATIONS);

export function isEvavoLegacyCraftRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const target = [...expected].sort();
  return actual.length === target.length && actual.every((key, index) => key === target[index]);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isEvavoLegacyCraftRecord(value)) {
    throw new Error("BOOK_CRAFT_REQUEST_INVALID");
  }
  return value;
}

export function validateEvavoLegacyCraftPublicRequest(value: unknown): EvavoLegacyCraftPublicRequest {
  const source = requireRecord(value);
  if (typeof source.operation !== "string" || !OPERATION_SET.has(source.operation)) {
    throw new Error("BOOK_CRAFT_OPERATION_UNSUPPORTED");
  }

  switch (source.operation) {
    case "compile_profile":
      if (!exactKeys(source, ["operation", "compileInput"])) throw new Error("BOOK_CRAFT_REQUEST_INVALID");
      return { operation: source.operation, compileInput: requireRecord(source.compileInput) };

    case "create_provider_packet":
      if (!exactKeys(source, ["operation", "compileInput", "packetInput"])) throw new Error("BOOK_CRAFT_REQUEST_INVALID");
      return {
        operation: source.operation,
        compileInput: requireRecord(source.compileInput),
        packetInput: requireRecord(source.packetInput)
      };

    case "validate_provider_response":
      if (!exactKeys(source, ["operation", "compileInput", "packetInput", "providerResponse"])) throw new Error("BOOK_CRAFT_REQUEST_INVALID");
      return {
        operation: source.operation,
        compileInput: requireRecord(source.compileInput),
        packetInput: requireRecord(source.packetInput),
        providerResponse: requireRecord(source.providerResponse)
      };

    case "scan_phrase_overlap":
      if (!exactKeys(source, ["operation", "scanInput"])) throw new Error("BOOK_CRAFT_REQUEST_INVALID");
      return { operation: source.operation, scanInput: requireRecord(source.scanInput) };
  }
}
