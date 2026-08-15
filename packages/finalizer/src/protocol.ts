import { SPRITE_FINALIZER_PROTOCOL_VERSION } from "./types.js";

export function spriteFinalizerProtocolSummary() {
  return {
    schemaVersion: "1.0" as const,
    protocolVersion: SPRITE_FINALIZER_PROTOCOL_VERSION,
    purpose:
      "Run bounded deterministic pixel cleanup after extraction, resizing and delivery optimization, then emit exact proof and repair evidence without weakening any quality gate.",
    automaticRepairs: [
      "Normalize unrelated RGB beneath fully transparent pixels while retaining bounded edge bleed.",
      "Replace matte-like partially transparent fringe colour with nearby foreground colour while preserving alpha and silhouette.",
      "Repeat decoded-pixel QA after every repair pass and stop after a bounded maximum.",
    ],
    failClosedEscalation: [
      "Missing alpha, painted checkerboards and baked mattes route back through smart background recovery; ambiguous classification and crop failures require provider repair or named review.",
      "Dimension or output-format drift is an implementation-contract failure and blocks release.",
      "A deterministic repair that makes no further safe changes is escalated rather than looped indefinitely.",
      "No threshold is relaxed and no visible opaque pixel, alpha value, pivot, canvas or timing metadata is changed by the pixel repair kernel.",
    ],
    dispositions: [
      "ready",
      "deterministic-repair",
      "provider-repair",
      "manual-review",
      "blocked",
    ],
  };
}
