import type { AdventureCreativeWorkOrderV3 } from "./adventure-studio-handoff-v3.js";
import { adventureStudioHandoffV3ProtocolFingerprint } from "./adventure-studio-protocol-v3.js";

const walkFrames = () =>
  Array.from({ length: 8 }, (_, index) => {
    const number = index + 1;
    const previous = index === 0 ? 8 : index;
    const next = number === 8 ? 1 : number + 1;
    const prefix = "frame.mara.walk-east";
    return {
      frameId: `${prefix}.${String(number).padStart(2, "0")}`,
      role: number === 1 || number === 5 ? "contact" : number === 3 || number === 7 ? "passing" : "inbetween",
      exposureTicks: 2,
      pivot: { x: 24, y: 92 },
      footPoint: { x: 24, y: 92 },
      handAnchors: {
        left: { x: 14, y: 56 },
        right: { x: 34, y: 56 },
      },
      shadowAnchor: { x: 24, y: 92 },
      requiredNeighbourFrameIds: [
        `${prefix}.${String(previous).padStart(2, "0")}`,
        `${prefix}.${String(next).padStart(2, "0")}`,
      ],
    };
  });

export const adventureStudioConformanceStaticOrderV3: AdventureCreativeWorkOrderV3 = {
  contractVersion: 3,
  workOrderId: "work.conformance.ninth-reliquary.foreground",
  projectId: "project.ninth-reliquary",
  assetId: "asset.ninth-reliquary.cafe.foreground",
  destinationStudio: "art-studio",
  taskKind: "foreground-plate",
  revision: 1,
  sourceRevisionDigest: "sha256:source-revision-conformance",
  nativeSize: { width: 640, height: 360 },
  alphaPolicy: "required",
  preserveNativeCanvas: true,
  authorities: {
    profileId: "cinematic-handdrawn-conspiracy",
    styleDigest: "sha256:style-conformance",
    paletteDigest: "sha256:palette-conformance",
    environmentLayoutDigest: "sha256:layout-conformance",
    referenceDigests: ["sha256:reference-a", "sha256:reference-b"],
  },
  invariants: [
    "pixel-registered to approved background",
    "occlusion silhouette matches approved layout",
  ],
  forbiddenDrift: [
    "fake checkerboard transparency",
    "matte halo",
    "layout registration drift",
  ],
  artDirection: [
    "Transparent cafe foreground plate with clean authored silhouettes and exact registration.",
  ],
  reviewChecklist: ["decoded alpha", "hostile matte", "registration", "occlusion silhouette"],
  rejectionRules: [
    "checkerboard pixels present",
    "matte fringe remains",
    "background pixels baked into transparent plate",
  ],
  transparencyPolicy: {
    checkerboardForbidden: true,
    decodedAlphaRequired: true,
    transparentCanvasEdgeRequired: true,
    matteResidueForbidden: true,
    haloFringeForbidden: true,
    transparentRgbContaminationForbidden: true,
    hostilePlateReviewRequired: true,
  },
  iterationPolicy: {
    maximumRevisionPasses: 5,
    compareAgainstPreviousApproved: true,
    requireIssueClosureEvidence: true,
    preferTargetedRepair: true,
    fullRegenerationRequiresExplicitReason: true,
  },
  requestedRepairs: [],
};

export const adventureStudioConformanceAnimationOrderV3: AdventureCreativeWorkOrderV3 = {
  contractVersion: 3,
  workOrderId: "work.conformance.ninth-reliquary.mara-walk",
  projectId: "project.ninth-reliquary",
  assetId: "asset.ninth-reliquary.mara.walk-east",
  destinationStudio: "cel-animation-studio",
  taskKind: "animation-sequence",
  revision: 1,
  sourceRevisionDigest: "sha256:source-revision-conformance",
  nativeSize: { width: 384, height: 96 },
  alphaPolicy: "required",
  preserveNativeCanvas: true,
  authorities: {
    profileId: "cinematic-handdrawn-conspiracy",
    styleDigest: "sha256:style-conformance",
    paletteDigest: "sha256:palette-conformance",
    modelSheetDigest: "sha256:model-sheet-conformance",
    xSheetDigest: "sha256:x-sheet-conformance",
    referenceDigests: ["sha256:reference-a", "sha256:reference-b"],
  },
  invariants: [
    "foot baseline y=92",
    "model-sheet identity remains locked",
    "coat and bag construction remain stable",
  ],
  forbiddenDrift: [
    "independent regenerated frames",
    "sliding foot",
    "anchor wobble",
    "line weight flicker",
  ],
  artDirection: [
    "Eight-drawing restrained walk with authored contacts, passes and neighbour continuity.",
  ],
  reviewChecklist: [
    "frame count",
    "x-sheet exposure",
    "neighbour continuity",
    "foot contacts",
    "model sheet",
    "decoded alpha",
  ],
  rejectionRules: [
    "frame order drift",
    "fake checkerboard transparency",
    "loop pop",
    "identity drift",
  ],
  framePlan: walkFrames(),
  sequencePolicy: {
    independentFrameGenerationForbidden: true,
    exactExposureTimingRequired: true,
    modelSheetConformanceRequired: true,
    xSheetConformanceRequired: true,
    immediateNeighbourReviewRequired: true,
    loopClosureReviewRequired: true,
  },
  transparencyPolicy: {
    checkerboardForbidden: true,
    decodedAlphaRequired: true,
    transparentCanvasEdgeRequired: true,
    matteResidueForbidden: true,
    haloFringeForbidden: true,
    transparentRgbContaminationForbidden: true,
    hostilePlateReviewRequired: true,
  },
  iterationPolicy: {
    maximumRevisionPasses: 5,
    compareAgainstPreviousApproved: true,
    requireIssueClosureEvidence: true,
    preferTargetedRepair: true,
    fullRegenerationRequiresExplicitReason: true,
  },
  requestedRepairs: [],
};

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
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

export const adventureStudioConformanceFingerprintV3 = (): string =>
  `fnv1a64:${fnv1a64(canonical({
    protocolFingerprint: adventureStudioHandoffV3ProtocolFingerprint(),
    staticOrder: adventureStudioConformanceStaticOrderV3,
    animationOrder: adventureStudioConformanceAnimationOrderV3,
  }))}`;

export const ADVENTURE_STUDIO_CONFORMANCE_V3_FINGERPRINT = "fnv1a64:05f1152e0c6d16c8" as const;
