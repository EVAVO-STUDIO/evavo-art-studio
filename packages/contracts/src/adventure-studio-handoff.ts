export type AdventureStudioArtTaskKind = "background" | "foreground-plate" | "prop" | "ui-art";
export type AdventureStudioAlphaPolicy = "opaque" | "binary" | "soft" | "required";

export interface AdventureStudioArtWorkOrder {
  readonly contractVersion: 1;
  readonly workOrderId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly destinationStudio: "art-studio";
  readonly taskKind: AdventureStudioArtTaskKind;
  readonly briefRevision: number;
  readonly sourceRevisionDigest: string;
  readonly visualStandardDigest: string;
  readonly styleBankDigest?: string;
  readonly nativeSize: { readonly width: number; readonly height: number };
  readonly alphaPolicy: AdventureStudioAlphaPolicy;
  readonly checkerboardForbidden: true;
  readonly canvasEdgeMustBeTransparent: boolean;
  readonly preserveNativeCanvas: boolean;
  readonly requiredReferenceDigests: readonly string[];
  readonly artDirection: readonly string[];
  readonly rejectionRules: readonly string[];
}

export interface AdventureStudioArtProductionRequest {
  readonly requestVersion: 1;
  readonly workOrderId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly taskKind: AdventureStudioArtTaskKind;
  readonly nativeSize: { readonly width: number; readonly height: number };
  readonly sourceAuthority: {
    readonly sourceRevisionDigest: string;
    readonly visualStandardDigest: string;
    readonly styleBankDigest?: string;
    readonly referenceDigests: readonly string[];
  };
  readonly transparencyAdmission: {
    readonly required: boolean;
    readonly checkerboardForbidden: true;
    readonly requireDecodedAlpha: boolean;
    readonly requireTransparentCanvasEdge: boolean;
    readonly requireAlphaMaskReview: boolean;
    readonly hostileSolidPlates: readonly ["black", "white", "grey", "green", "magenta"];
    readonly rejectMatteResidue: true;
    readonly rejectHaloFringe: true;
  };
  readonly reviewPolicy: {
    readonly fullResolution: true;
    readonly runtimeScale: true;
    readonly immutableSourceEvidence: true;
    readonly generatorOutputIsUnapproved: true;
    readonly preserveNativeCanvas: boolean;
  };
  readonly artDirection: readonly string[];
  readonly rejectionRules: readonly string[];
}

export interface AdventureStudioArtWorkOrderIssue {
  readonly code:
    | "invalid-version"
    | "wrong-studio"
    | "invalid-task-kind"
    | "invalid-size"
    | "invalid-revision"
    | "missing-authority"
    | "checkerboard-policy-missing"
    | "transparent-edge-policy-missing";
  readonly message: string;
}

const artTaskKinds = new Set<AdventureStudioArtTaskKind>([
  "background",
  "foreground-plate",
  "prop",
  "ui-art",
]);

export const validateAdventureStudioArtWorkOrder = (
  input: AdventureStudioArtWorkOrder,
): readonly AdventureStudioArtWorkOrderIssue[] => {
  const issues: AdventureStudioArtWorkOrderIssue[] = [];
  if (input.contractVersion !== 1) issues.push({ code: "invalid-version", message: "Adventure creative contract version must be 1." });
  if (input.destinationStudio !== "art-studio") issues.push({ code: "wrong-studio", message: "Art Studio accepts only destinationStudio='art-studio'." });
  if (!artTaskKinds.has(input.taskKind)) issues.push({ code: "invalid-task-kind", message: `Art Studio does not accept adventure task '${input.taskKind}'.` });
  if (!Number.isSafeInteger(input.nativeSize.width) || !Number.isSafeInteger(input.nativeSize.height) || input.nativeSize.width <= 0 || input.nativeSize.height <= 0) issues.push({ code: "invalid-size", message: "Adventure art work order requires positive integer native dimensions." });
  if (!Number.isSafeInteger(input.briefRevision) || input.briefRevision <= 0) issues.push({ code: "invalid-revision", message: "Adventure art brief revision must be a positive integer." });
  if (!input.sourceRevisionDigest || !input.visualStandardDigest) issues.push({ code: "missing-authority", message: "Adventure art work order requires source-revision and visual-standard authority digests." });
  if (input.checkerboardForbidden !== true) issues.push({ code: "checkerboard-policy-missing", message: "Adventure art transparency must explicitly forbid baked checkerboards." });
  if (input.alphaPolicy !== "opaque" && !input.canvasEdgeMustBeTransparent) issues.push({ code: "transparent-edge-policy-missing", message: "Transparent adventure art must require a fully transparent canvas edge." });
  return issues;
};

export const compileAdventureStudioArtProductionRequest = (
  input: AdventureStudioArtWorkOrder,
): AdventureStudioArtProductionRequest => {
  const issues = validateAdventureStudioArtWorkOrder(input);
  if (issues.length > 0) throw new Error(`Adventure Studio art work order is invalid: ${issues.map((issue) => issue.message).join(" ")}`);
  const alphaRequired = input.alphaPolicy !== "opaque";
  return {
    requestVersion: 1,
    workOrderId: input.workOrderId,
    projectId: input.projectId,
    assetId: input.assetId,
    taskKind: input.taskKind,
    nativeSize: input.nativeSize,
    sourceAuthority: {
      sourceRevisionDigest: input.sourceRevisionDigest,
      visualStandardDigest: input.visualStandardDigest,
      ...(input.styleBankDigest ? { styleBankDigest: input.styleBankDigest } : {}),
      referenceDigests: [...new Set(input.requiredReferenceDigests)].sort((a, b) => a.localeCompare(b)),
    },
    transparencyAdmission: {
      required: alphaRequired,
      checkerboardForbidden: true,
      requireDecodedAlpha: alphaRequired,
      requireTransparentCanvasEdge: alphaRequired,
      requireAlphaMaskReview: alphaRequired,
      hostileSolidPlates: ["black", "white", "grey", "green", "magenta"],
      rejectMatteResidue: true,
      rejectHaloFringe: true,
    },
    reviewPolicy: {
      fullResolution: true,
      runtimeScale: true,
      immutableSourceEvidence: true,
      generatorOutputIsUnapproved: true,
      preserveNativeCanvas: input.preserveNativeCanvas,
    },
    artDirection: input.artDirection,
    rejectionRules: input.rejectionRules,
  };
};
