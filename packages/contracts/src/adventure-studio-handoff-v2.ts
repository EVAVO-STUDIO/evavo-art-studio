export type AdventureCreativeTaskKindV2 =
  | "background"
  | "foreground-plate"
  | "prop"
  | "ui-art"
  | "character-model-sheet"
  | "character-key-pose"
  | "animation-sequence"
  | "cutscene-shot";

export interface AdventureCreativeWorkOrderV2 {
  readonly contractVersion: 2;
  readonly workOrderId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly destinationStudio: "art-studio" | "cel-animation-studio";
  readonly taskKind: AdventureCreativeTaskKindV2;
  readonly revision: number;
  readonly replacesRevision?: number;
  readonly sourceRevisionDigest: string;
  readonly nativeSize: { readonly width: number; readonly height: number };
  readonly alphaPolicy: "opaque" | "binary" | "soft" | "required";
  readonly preserveNativeCanvas: boolean;
  readonly style: {
    readonly profileId: string;
    readonly styleDigest: string;
    readonly paletteDigest?: string;
    readonly modelSheetDigest?: string;
    readonly environmentLayoutDigest?: string;
    readonly referenceDigests: readonly string[];
    readonly invariants: readonly string[];
    readonly forbiddenDrift: readonly string[];
  };
  readonly artDirection: readonly string[];
  readonly reviewChecklist: readonly string[];
  readonly rejectionRules: readonly string[];
  readonly iterationPolicy: {
    readonly maximumRevisionPasses: number;
    readonly compareAgainstPreviousApproved: boolean;
    readonly requireIssueClosureEvidence: boolean;
  };
  readonly transparencyPolicy: {
    readonly checkerboardForbidden: true;
    readonly decodedAlphaRequired: boolean;
    readonly transparentCanvasEdgeRequired: boolean;
    readonly matteResidueForbidden: true;
    readonly haloFringeForbidden: true;
    readonly hostilePlateReviewRequired: boolean;
  };
  readonly framePlan?: readonly unknown[];
  readonly sequencePolicy?: unknown;
}

export interface AdventureStudioArtProductionRequestV2 {
  readonly requestVersion: 2;
  readonly workOrderId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly taskKind: "background" | "foreground-plate" | "prop" | "ui-art";
  readonly revision: number;
  readonly nativeSize: { readonly width: number; readonly height: number };
  readonly sourceAuthority: {
    readonly sourceRevisionDigest: string;
    readonly styleDigest: string;
    readonly paletteDigest?: string;
    readonly environmentLayoutDigest?: string;
    readonly referenceDigests: readonly string[];
  };
  readonly transparencyAdmission: {
    readonly required: boolean;
    readonly checkerboardForbidden: true;
    readonly requireDecodedAlpha: boolean;
    readonly requireTransparentCanvasEdge: boolean;
    readonly requireAlphaMaskReview: boolean;
    readonly rejectMatteResidue: true;
    readonly rejectHaloFringe: true;
    readonly hostileSolidPlates: readonly ["black", "white", "grey", "green", "magenta"];
  };
  readonly iterationPolicy: AdventureCreativeWorkOrderV2["iterationPolicy"];
  readonly styleInvariants: readonly string[];
  readonly forbiddenDrift: readonly string[];
  readonly artDirection: readonly string[];
  readonly reviewChecklist: readonly string[];
  readonly rejectionRules: readonly string[];
}

export interface AdventureStudioArtV2Issue {
  readonly code:
    | "wrong-version"
    | "wrong-destination"
    | "unsupported-task"
    | "invalid-revision"
    | "invalid-size"
    | "missing-authority"
    | "invalid-alpha-policy"
    | "missing-iteration-governance";
  readonly message: string;
}

const staticKinds = new Set(["background", "foreground-plate", "prop", "ui-art"]);
const nonEmpty = (value: string | undefined): boolean => Boolean(value?.trim());

export const validateAdventureStudioArtWorkOrderV2 = (
  order: AdventureCreativeWorkOrderV2,
): readonly AdventureStudioArtV2Issue[] => {
  const issues: AdventureStudioArtV2Issue[] = [];
  if (order.contractVersion !== 2) issues.push({ code: "wrong-version", message: "Art Studio creative handoff requires contractVersion=2." });
  if (order.destinationStudio !== "art-studio") issues.push({ code: "wrong-destination", message: "Art Studio accepts only destinationStudio='art-studio'." });
  if (!staticKinds.has(order.taskKind)) issues.push({ code: "unsupported-task", message: `Art Studio does not own '${order.taskKind}' work.` });
  if (!Number.isSafeInteger(order.revision) || order.revision <= 0 || (order.replacesRevision !== undefined && order.replacesRevision >= order.revision)) {
    issues.push({ code: "invalid-revision", message: "Creative revision must be positive and newer than the revision it replaces." });
  }
  if (!Number.isSafeInteger(order.nativeSize.width) || !Number.isSafeInteger(order.nativeSize.height) || order.nativeSize.width <= 0 || order.nativeSize.height <= 0) {
    issues.push({ code: "invalid-size", message: "Adventure Art Studio work requires positive integer native dimensions." });
  }
  if (!nonEmpty(order.sourceRevisionDigest) || !nonEmpty(order.style.styleDigest) || !nonEmpty(order.style.profileId)) {
    issues.push({ code: "missing-authority", message: "Source revision, style profile and immutable style digest are required." });
  }
  const alphaRequired = order.alphaPolicy !== "opaque";
  if (
    order.transparencyPolicy.checkerboardForbidden !== true ||
    order.transparencyPolicy.matteResidueForbidden !== true ||
    order.transparencyPolicy.haloFringeForbidden !== true ||
    (alphaRequired && (!order.transparencyPolicy.decodedAlphaRequired || !order.transparencyPolicy.transparentCanvasEdgeRequired))
  ) {
    issues.push({ code: "invalid-alpha-policy", message: "Transparent adventure art must require decoded alpha, transparent canvas edge, no checkerboard, no matte residue and no halo fringe." });
  }
  if (!Number.isSafeInteger(order.iterationPolicy.maximumRevisionPasses) || order.iterationPolicy.maximumRevisionPasses <= 0 || !order.iterationPolicy.requireIssueClosureEvidence) {
    issues.push({ code: "missing-iteration-governance", message: "Revision policy must be bounded and require issue-closure evidence." });
  }
  return issues;
};

export const compileAdventureStudioArtProductionRequestV2 = (
  input: AdventureCreativeWorkOrderV2,
): AdventureStudioArtProductionRequestV2 => {
  const issues = validateAdventureStudioArtWorkOrderV2(input);
  if (issues.length > 0) throw new Error(`Adventure Studio v2 art handoff is invalid: ${issues.map((issue) => issue.message).join(" ")}`);
  const alphaRequired = input.alphaPolicy !== "opaque";
  return {
    requestVersion: 2,
    workOrderId: input.workOrderId,
    projectId: input.projectId,
    assetId: input.assetId,
    taskKind: input.taskKind as AdventureStudioArtProductionRequestV2["taskKind"],
    revision: input.revision,
    nativeSize: input.nativeSize,
    sourceAuthority: {
      sourceRevisionDigest: input.sourceRevisionDigest,
      styleDigest: input.style.styleDigest,
      ...(input.style.paletteDigest ? { paletteDigest: input.style.paletteDigest } : {}),
      ...(input.style.environmentLayoutDigest ? { environmentLayoutDigest: input.style.environmentLayoutDigest } : {}),
      referenceDigests: [...new Set(input.style.referenceDigests)].sort((left, right) => left.localeCompare(right)),
    },
    transparencyAdmission: {
      required: alphaRequired,
      checkerboardForbidden: true,
      requireDecodedAlpha: alphaRequired,
      requireTransparentCanvasEdge: alphaRequired,
      requireAlphaMaskReview: alphaRequired,
      rejectMatteResidue: true,
      rejectHaloFringe: true,
      hostileSolidPlates: ["black", "white", "grey", "green", "magenta"],
    },
    iterationPolicy: input.iterationPolicy,
    styleInvariants: input.style.invariants,
    forbiddenDrift: input.style.forbiddenDrift,
    artDirection: input.artDirection,
    reviewChecklist: input.reviewChecklist,
    rejectionRules: input.rejectionRules,
  };
};
