export const ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION =
  "2026-08-14.4" as const;
export const ART_PRODUCTION_PROFILE_KIND =
  "evavo.art-production.profile" as const;
export const ART_PRODUCTION_LOOP_KIND =
  "evavo.art-production.loop" as const;
export const ART_PRODUCTION_ATTEMPT_KIND =
  "evavo.art-production.attempt" as const;
export const ART_PRODUCTION_BATCH_KIND =
  "evavo.art-production.batch" as const;
export const ART_PRODUCTION_CANDIDATE_ADMISSION_REQUEST_KIND =
  "evavo.art-production.candidate-admission.request" as const;
export const ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_KIND =
  "evavo.art-production.candidate-admission.receipt" as const;
export const ART_PRODUCTION_HUMAN_APPROVAL_REQUEST_KIND =
  "evavo.art-production.human-approval.request" as const;
export const ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_KIND =
  "evavo.art-production.human-approval.receipt" as const;
export const ART_PRODUCTION_PACKAGING_PLAN_KIND =
  "evavo.art-production.packaging-plan" as const;
export const ART_PRODUCTION_RUNTIME_ASSEMBLY_HANDOFF_KIND =
  "evavo.art-production.runtime-assembly-handoff" as const;

export const ART_PRODUCTION_CAMERA_FAMILIES = [
  "isometric-life-sim-90s",
  "top-down-sports-90s",
  "side-on-arcade-90s",
  "interior-point-click-90s",
  "world-map-strategy-90s",
  "custom-fixed-90s",
] as const;
export type ArtProductionCameraFamily =
  (typeof ART_PRODUCTION_CAMERA_FAMILIES)[number];

export const ART_PRODUCTION_METRIC_IDS = [
  "alpha-quality",
  "layer-purity",
  "native-readability",
  "palette-discipline",
  "pixel-cluster-quality",
  "camera-accuracy",
  "era-authenticity",
  "non-generic-quality",
  "runtime-usability",
  "identity-consistency",
  "pivot-stability",
  "ground-contact-stability",
  "pose-progression",
] as const;
export type ArtProductionMetricId =
  (typeof ART_PRODUCTION_METRIC_IDS)[number];

export const ART_PRODUCTION_BLOCKING_DETECTIONS = [
  "multiple-assets",
  "layer-contamination",
  "antialiasing",
  "gradient-shading",
  "bloom-or-soft-lighting",
  "procedural-pixel-noise",
  "generic-ai-styling",
  "vector-like-rendering",
  "generated-readable-text",
  "matte-halo",
  "unsafe-transparent-rgb",
  "camera-drift",
  "identity-drift",
  "pivot-drift",
  "ground-contact-drift",
  "crop-risk",
  "copyrighted-imitation",
] as const;
export type ArtProductionBlockingDetection =
  (typeof ART_PRODUCTION_BLOCKING_DETECTIONS)[number];

export type ArtProductionUnitStatus =
  | "gated"
  | "queued"
  | "repair-required"
  | "review-passed"
  | "blocked";

export type ArtProductionAttemptDecision =
  | "review-passed"
  | "repair-required"
  | "blocked";

export type ArtProductionPackagingOutput =
  | "individual-png"
  | "animation-strip"
  | "animation-grid"
  | "atlas";
