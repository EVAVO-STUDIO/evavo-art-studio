export const adventureStudioHandoffV3Protocol = {
  protocolId: "evavo.adventure-creative-handoff",
  version: 3,
  reviewDispositions: ["candidate", "repair-required", "review-required", "accepted", "rejected"],
  hardInvariants: [
    "checkerboard-forbidden",
    "decoded-alpha-required-for-transparent-work",
    "transparent-canvas-edge-required",
    "matte-residue-forbidden",
    "alpha-halo-forbidden",
    "transparent-rgb-contamination-forbidden",
    "targeted-repair-first",
    "issue-closure-evidence-required",
    "full-regeneration-requires-explicit-reason",
    "animation-independent-frame-generation-forbidden",
    "animation-exact-exposure-timing-required",
    "animation-model-sheet-conformance-required",
    "animation-x-sheet-conformance-required",
    "animation-immediate-neighbour-review-required",
    "delivery-artifact-digest-must-equal-accepted-candidate",
    "delivery-review-evidence-must-equal-accepted-review",
  ],
} as const;

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort((a, b) => a.localeCompare(b)).map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const fnv1a64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
};

export const adventureStudioHandoffV3ProtocolFingerprint = (): string =>
  `fnv1a64:${fnv1a64(canonical(adventureStudioHandoffV3Protocol))}`;

export const ADVENTURE_STUDIO_HANDOFF_V3_PROTOCOL_FINGERPRINT = "fnv1a64:7685192c8eee9542" as const;
