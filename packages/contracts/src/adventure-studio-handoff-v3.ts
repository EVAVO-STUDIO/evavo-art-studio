export type AdventureCreativeTaskKindV3 =
  | "background-layout"
  | "background-paint"
  | "foreground-plate"
  | "prop"
  | "ui-art"
  | "portrait-closeup"
  | "character-model-sheet"
  | "character-key-pose"
  | "animation-sequence"
  | "cutscene-shot"
  | "effects-sequence";

export type AdventureCreativeIssueCodeV3 =
  | "identity-drift"
  | "proportion-drift"
  | "costume-drift"
  | "style-drift"
  | "palette-drift"
  | "perspective-drift"
  | "layout-drift"
  | "silhouette-drift"
  | "pose-drift"
  | "anchor-drift"
  | "ground-contact-drift"
  | "frame-count-mismatch"
  | "frame-order-mismatch"
  | "exposure-timing-mismatch"
  | "loop-closure-mismatch"
  | "neighbour-continuity-mismatch"
  | "crop-or-safe-bounds"
  | "occlusion-mismatch"
  | "fake-transparency-checkerboard"
  | "missing-real-alpha"
  | "matte-residue"
  | "alpha-halo"
  | "transparent-rgb-contamination"
  | "soft-alpha-when-binary-required"
  | "unexpected-text-or-symbol"
  | "reference-authority-mismatch"
  | "source-byte-mismatch";

export interface AdventureCreativeRepairScopeV3 {
  readonly issueId: string;
  readonly issueCode: AdventureCreativeIssueCodeV3;
  readonly targetFrameIds: readonly string[];
  readonly targetRegion?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly repairInstruction: string;
  readonly preserveFrameIds: readonly string[];
  readonly preserveRegions: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
  readonly allowRegenerateWholeAsset: boolean;
}

export interface AdventureCreativeWorkOrderV3 {
  readonly contractVersion: 3;
  readonly workOrderId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly destinationStudio: "art-studio" | "cel-animation-studio";
  readonly taskKind: AdventureCreativeTaskKindV3;
  readonly revision: number;
  readonly replacesRevision?: number;
  readonly sourceRevisionDigest: string;
  readonly nativeSize: { readonly width: number; readonly height: number };
  readonly alphaPolicy: "opaque" | "binary" | "soft" | "required";
  readonly preserveNativeCanvas: boolean;
  readonly authorities: {
    readonly profileId: string;
    readonly styleDigest: string;
    readonly paletteDigest?: string;
    readonly modelSheetDigest?: string;
    readonly environmentLayoutDigest?: string;
    readonly xSheetDigest?: string;
    readonly referenceDigests: readonly string[];
    readonly previousApprovedArtifactDigest?: string;
  };
  readonly invariants: readonly string[];
  readonly forbiddenDrift: readonly string[];
  readonly artDirection: readonly string[];
  readonly reviewChecklist: readonly string[];
  readonly rejectionRules: readonly string[];
  readonly framePlan?: readonly unknown[];
  readonly sequencePolicy?: unknown;
  readonly transparencyPolicy: {
    readonly checkerboardForbidden: true;
    readonly decodedAlphaRequired: boolean;
    readonly transparentCanvasEdgeRequired: boolean;
    readonly matteResidueForbidden: true;
    readonly haloFringeForbidden: true;
    readonly transparentRgbContaminationForbidden: true;
    readonly hostilePlateReviewRequired: boolean;
  };
  readonly iterationPolicy: {
    readonly maximumRevisionPasses: number;
    readonly compareAgainstPreviousApproved: boolean;
    readonly requireIssueClosureEvidence: true;
    readonly preferTargetedRepair: true;
    readonly fullRegenerationRequiresExplicitReason: true;
  };
  readonly requestedRepairs: readonly AdventureCreativeRepairScopeV3[];
}

export interface AdventureStudioArtProductionRequestV3 {
  readonly requestVersion: 3;
  readonly workOrderId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly taskKind: "background-layout" | "background-paint" | "foreground-plate" | "prop" | "ui-art" | "portrait-closeup";
  readonly revision: number;
  readonly nativeSize: { readonly width: number; readonly height: number };
  readonly authorities: AdventureCreativeWorkOrderV3["authorities"];
  readonly alphaAdmission: {
    readonly required: boolean;
    readonly checkerboardForbidden: true;
    readonly decodedAlphaRequired: boolean;
    readonly transparentCanvasEdgeRequired: boolean;
    readonly hostilePlateReviewRequired: boolean;
    readonly rejectMatteResidue: true;
    readonly rejectHaloFringe: true;
    readonly rejectTransparentRgbContamination: true;
  };
  readonly targetedRepairs: readonly AdventureCreativeRepairScopeV3[];
  readonly preserveNativeCanvas: boolean;
  readonly invariants: readonly string[];
  readonly forbiddenDrift: readonly string[];
  readonly artDirection: readonly string[];
  readonly reviewChecklist: readonly string[];
  readonly rejectionRules: readonly string[];
  readonly iterationPolicy: AdventureCreativeWorkOrderV3["iterationPolicy"];
}

export interface AdventureStudioArtV3Issue {
  readonly code:
    | "wrong-version"
    | "wrong-destination"
    | "unsupported-task"
    | "invalid-revision"
    | "invalid-size"
    | "missing-authority"
    | "invalid-alpha-policy"
    | "invalid-repair-scope"
    | "missing-iteration-governance";
  readonly message: string;
}

const staticKinds = new Set<AdventureCreativeTaskKindV3>([
  "background-layout",
  "background-paint",
  "foreground-plate",
  "prop",
  "ui-art",
  "portrait-closeup",
]);
const nonEmpty = (value: string | undefined): boolean => Boolean(value?.trim());

export const validateAdventureStudioArtWorkOrderV3 = (
  order: AdventureCreativeWorkOrderV3,
): readonly AdventureStudioArtV3Issue[] => {
  const issues: AdventureStudioArtV3Issue[] = [];
  if (order.contractVersion !== 3) issues.push({ code: "wrong-version", message: "Art Studio handoff requires contractVersion=3." });
  if (order.destinationStudio !== "art-studio") issues.push({ code: "wrong-destination", message: "Art Studio accepts only destinationStudio='art-studio'." });
  if (!staticKinds.has(order.taskKind)) issues.push({ code: "unsupported-task", message: `Art Studio does not own '${order.taskKind}' in v3.` });
  if (!Number.isSafeInteger(order.revision) || order.revision <= 0 || (order.replacesRevision !== undefined && order.replacesRevision >= order.revision)) issues.push({ code: "invalid-revision", message: "Creative revision must be positive and newer than the revision it replaces." });
  if (!Number.isSafeInteger(order.nativeSize.width) || !Number.isSafeInteger(order.nativeSize.height) || order.nativeSize.width <= 0 || order.nativeSize.height <= 0) issues.push({ code: "invalid-size", message: "Art work requires positive integer native dimensions." });
  if (!nonEmpty(order.sourceRevisionDigest) || !nonEmpty(order.authorities.styleDigest) || !nonEmpty(order.authorities.profileId)) issues.push({ code: "missing-authority", message: "Source revision, profile and style digest are required." });
  const alphaRequired = order.alphaPolicy !== "opaque";
  if (order.transparencyPolicy.checkerboardForbidden !== true || order.transparencyPolicy.matteResidueForbidden !== true || order.transparencyPolicy.haloFringeForbidden !== true || order.transparencyPolicy.transparentRgbContaminationForbidden !== true || (alphaRequired && (!order.transparencyPolicy.decodedAlphaRequired || !order.transparencyPolicy.transparentCanvasEdgeRequired || !order.transparencyPolicy.hostilePlateReviewRequired))) issues.push({ code: "invalid-alpha-policy", message: "Transparent art must prove decoded alpha and reject checkerboard, matte residue, halos and contaminated hidden RGB." });
  if (!Number.isSafeInteger(order.iterationPolicy.maximumRevisionPasses) || order.iterationPolicy.maximumRevisionPasses <= 0 || !order.iterationPolicy.requireIssueClosureEvidence || !order.iterationPolicy.preferTargetedRepair || !order.iterationPolicy.fullRegenerationRequiresExplicitReason) issues.push({ code: "missing-iteration-governance", message: "Iteration must be bounded, issue-closure-backed and targeted-repair-first." });
  for (const repair of order.requestedRepairs) {
    if (!nonEmpty(repair.issueId) || !nonEmpty(repair.repairInstruction)) issues.push({ code: "invalid-repair-scope", message: "Every repair requires issue identity and a concrete repair instruction." });
  }
  return issues;
};

export const compileAdventureStudioArtProductionRequestV3 = (
  input: AdventureCreativeWorkOrderV3,
): AdventureStudioArtProductionRequestV3 => {
  const issues = validateAdventureStudioArtWorkOrderV3(input);
  if (issues.length > 0) throw new Error(`Adventure Studio v3 art handoff is invalid: ${issues.map((issue) => issue.message).join(" ")}`);
  const alphaRequired = input.alphaPolicy !== "opaque";
  return {
    requestVersion: 3,
    workOrderId: input.workOrderId,
    projectId: input.projectId,
    assetId: input.assetId,
    taskKind: input.taskKind as AdventureStudioArtProductionRequestV3["taskKind"],
    revision: input.revision,
    nativeSize: input.nativeSize,
    authorities: {
      ...input.authorities,
      referenceDigests: [...new Set(input.authorities.referenceDigests)].sort((left, right) => left.localeCompare(right)),
    },
    alphaAdmission: {
      required: alphaRequired,
      checkerboardForbidden: true,
      decodedAlphaRequired: alphaRequired,
      transparentCanvasEdgeRequired: alphaRequired,
      hostilePlateReviewRequired: alphaRequired,
      rejectMatteResidue: true,
      rejectHaloFringe: true,
      rejectTransparentRgbContamination: true,
    },
    targetedRepairs: input.requestedRepairs,
    preserveNativeCanvas: input.preserveNativeCanvas,
    invariants: input.invariants,
    forbiddenDrift: input.forbiddenDrift,
    artDirection: input.artDirection,
    reviewChecklist: input.reviewChecklist,
    rejectionRules: input.rejectionRules,
    iterationPolicy: input.iterationPolicy,
  };
};
