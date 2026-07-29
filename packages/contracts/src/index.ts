export const ART_STUDIO_PROTOCOL_VERSION = "2026-07-29" as const;

export const ASSET_KINDS = [
  "character",
  "animation",
  "sprite-sheet",
  "tileset",
  "texture",
  "ui",
  "icon",
  "background",
  "cinematic",
  "particle",
  "print",
  "vector",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const TARGET_KINDS = [
  "godot-4.6.2",
  "web",
  "mobile",
  "desktop",
  "print",
  "source-master",
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export const TRANSPARENCY_MODES = [
  "opaque",
  "alpha-required",
  "alpha-preferred",
  "chroma-key-intermediate",
] as const;
export type TransparencyMode = (typeof TRANSPARENCY_MODES)[number];

export const AUTONOMY_MODES = [
  "manual",
  "review-gated",
  "fully-automatic",
] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

export const PIPELINE_STAGE_KINDS = [
  "analyse",
  "art-direction",
  "concept",
  "select-candidate",
  "construct",
  "motion-design",
  "frame-generation",
  "frame-layout",
  "tile-topology",
  "shot-plan",
  "keyframes",
  "inbetweens",
  "cleanup",
  "alpha-extraction",
  "edge-decontamination",
  "consistency",
  "timing",
  "loop-validation",
  "seam-validation",
  "colour-proof",
  "bleed-safe-area",
  "master",
  "atlas-pack",
  "manifest",
  "particle-profile",
  "godot-import-profile",
  "godot-resource",
  "encode",
  "export",
  "matte-validation",
  "quality",
] as const;
export type PipelineStageKind = (typeof PIPELINE_STAGE_KINDS)[number];

export const QUALITY_GATE_IDS = [
  "dimensions",
  "file-format",
  "alpha-channel",
  "fake-transparency",
  "edge-halo",
  "transparent-pixel-colour",
  "colour-profile",
  "palette",
  "style-consistency",
  "composition",
  "artifact-scan",
  "compression-delta",
  "frame-canvas",
  "frame-anchor",
  "frame-duplicates",
  "loop-closure",
  "atlas-padding",
  "atlas-bleed",
  "tile-seams",
  "print-resolution",
  "print-safe-area",
  "manifest-integrity",
  "provenance",
] as const;
export type QualityGateId = (typeof QUALITY_GATE_IDS)[number];

export interface Dimensions {
  readonly width: number;
  readonly height: number;
  readonly scale?: number;
}

export interface AnimationSpec {
  readonly name: string;
  readonly frameCount: number;
  readonly framesPerSecond: number;
  readonly loop: boolean;
  readonly directions?: number;
  readonly pivot?: Readonly<{ x: number; y: number }>;
  readonly baseline?: number;
}

export interface OutputFormatSpec {
  readonly format: "png" | "webp" | "avif" | "svg" | "tiff" | "gif" | "apng" | "json" | "tres";
  readonly purpose: "master" | "runtime" | "preview" | "print" | "manifest";
  readonly lossless: boolean;
  readonly colourSpace?: "srgb" | "display-p3" | "cmyk" | "lab";
  readonly densityDpi?: number;
}

export interface ReferenceAsset {
  readonly id: string;
  readonly uri: string;
  readonly role: "style" | "composition" | "character" | "palette" | "material" | "motion" | "historical";
  readonly weight: number;
  readonly notes?: string;
  readonly rights?: string;
}

export interface ArtDirection {
  readonly styleName: string;
  readonly intent: string;
  readonly mustHave: readonly string[];
  readonly mustAvoid: readonly string[];
  readonly palette?: Readonly<{
    colours: readonly string[];
    maxColours?: number;
    colourSpace?: "srgb" | "display-p3" | "cmyk" | "lab";
  }>;
  readonly era?: string;
  readonly cameraRules?: readonly string[];
  readonly lineTreatment?: string;
  readonly materialLanguage?: readonly string[];
  readonly references?: readonly ReferenceAsset[];
}

export interface TargetProfile {
  readonly kind: TargetKind;
  readonly platform?: string;
  readonly maximumTextureSize?: number;
  readonly powerOfTwo?: "required" | "preferred" | "not-required";
  readonly textureFiltering?: "nearest" | "linear" | "mixed";
  readonly compressionPolicy?: "lossless" | "visually-lossless" | "runtime-optimised";
  readonly notes?: readonly string[];
}

export interface ProjectContext {
  readonly projectName: string;
  readonly repositoryPath?: string;
  readonly gameGenre?: string;
  readonly engine?: string;
  readonly audience?: string;
  readonly targets: readonly TargetProfile[];
}

export interface AssetRequest {
  readonly id: string;
  readonly name: string;
  readonly kind: AssetKind;
  readonly purpose: string;
  readonly quantity: number;
  readonly dimensions: Dimensions;
  readonly transparency: TransparencyMode;
  readonly animation?: AnimationSpec;
  readonly outputs: readonly OutputFormatSpec[];
  readonly tags?: readonly string[];
  readonly namingPrefix?: string;
  readonly notes?: readonly string[];
}

export interface AutonomyPolicy {
  readonly mode: AutonomyMode;
  readonly candidateCount: number;
  readonly maximumIterations: number;
  readonly autoApproveThreshold: number;
  readonly allowProviderFallback: boolean;
  readonly requireEvidenceBundle: boolean;
}

export interface ArtBrief {
  readonly schemaVersion: "1.0";
  readonly project: ProjectContext;
  readonly artDirection: ArtDirection;
  readonly assets: readonly AssetRequest[];
  readonly autonomy: AutonomyPolicy;
  readonly outputRoot?: string;
}

export interface CapabilityDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly deterministic: boolean;
  readonly workerClass: "control" | "media" | "vision" | "provider" | "engine";
}

export interface QualityGateSpec {
  readonly id: QualityGateId;
  readonly severity: "blocking" | "warning";
  readonly description: string;
  readonly threshold?: number;
  readonly evidence: readonly string[];
}

export interface WorkItem {
  readonly id: string;
  readonly assetInstanceId: string;
  readonly stage: PipelineStageKind;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly deterministic: boolean;
  readonly maximumAttempts: number;
  readonly approval: "automatic" | "policy-gated" | "human-required";
  readonly produces: readonly string[];
}

export interface DeliverableSpec {
  readonly id: string;
  readonly assetInstanceId: string;
  readonly relativePath: string;
  readonly format: OutputFormatSpec["format"];
  readonly purpose: OutputFormatSpec["purpose"];
  readonly width?: number;
  readonly height?: number;
  readonly transparency: TransparencyMode;
  readonly metadataSidecar: string;
}

export interface ProductionPlan {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof ART_STUDIO_PROTOCOL_VERSION;
  readonly id: string;
  readonly projectName: string;
  readonly createdFromBriefHash: string;
  readonly autonomy: AutonomyPolicy;
  readonly workItems: readonly WorkItem[];
  readonly qualityGates: Readonly<Record<string, readonly QualityGateSpec[]>>;
  readonly deliverables: readonly DeliverableSpec[];
  readonly warnings: readonly string[];
}

export interface RepositoryArtFile {
  readonly path: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly category: "image" | "animation" | "font" | "engine-resource" | "source-art" | "metadata" | "other";
}

export interface RepositoryArtSnapshot {
  readonly schemaVersion: "1.0";
  readonly root: string;
  readonly projectName: string;
  readonly engine: "godot" | "unity" | "web" | "unknown";
  readonly engineVersionHint?: string;
  readonly viewport?: Readonly<{ width: number; height: number }>;
  readonly filesScanned: number;
  readonly artFiles: readonly RepositoryArtFile[];
  readonly extensionCounts: Readonly<Record<string, number>>;
  readonly categoryCounts: Readonly<Record<RepositoryArtFile["category"], number>>;
  readonly signals: readonly string[];
  readonly gaps: readonly string[];
  readonly truncated: boolean;
}

export type ValidationIssue = Readonly<{
  path: string;
  message: string;
}>;

export type ValidationResult<T> =
  | Readonly<{ success: true; value: T }>
  | Readonly<{ success: false; issues: readonly ValidationIssue[] }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isFinitePositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isNonEmptyString);

function issue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

export function validateArtBrief(value: unknown): ValidationResult<ArtBrief> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { success: false, issues: [{ path: "$", message: "Brief must be a JSON object." }] };

  if (value.schemaVersion !== "1.0") issue(issues, "$.schemaVersion", "schemaVersion must be \"1.0\".");

  const project = value.project;
  if (!isRecord(project)) {
    issue(issues, "$.project", "project must be an object.");
  } else {
    if (!isNonEmptyString(project.projectName)) issue(issues, "$.project.projectName", "projectName is required.");
    if (!Array.isArray(project.targets) || project.targets.length === 0) {
      issue(issues, "$.project.targets", "At least one target profile is required.");
    } else {
      project.targets.forEach((target, index) => {
        if (!isRecord(target) || !TARGET_KINDS.includes(target.kind as TargetKind)) {
          issue(issues, `$.project.targets[${index}].kind`, "Unsupported target kind.");
        }
      });
    }
  }

  const direction = value.artDirection;
  if (!isRecord(direction)) {
    issue(issues, "$.artDirection", "artDirection must be an object.");
  } else {
    if (!isNonEmptyString(direction.styleName)) issue(issues, "$.artDirection.styleName", "styleName is required.");
    if (!isNonEmptyString(direction.intent)) issue(issues, "$.artDirection.intent", "intent is required.");
    if (!isStringArray(direction.mustHave)) issue(issues, "$.artDirection.mustHave", "mustHave must be a string array.");
    if (!isStringArray(direction.mustAvoid)) issue(issues, "$.artDirection.mustAvoid", "mustAvoid must be a string array.");
  }

  const assets = value.assets;
  if (!Array.isArray(assets) || assets.length === 0) {
    issue(issues, "$.assets", "At least one asset request is required.");
  } else {
    const ids = new Set<string>();
    assets.forEach((asset, index) => {
      const base = `$.assets[${index}]`;
      if (!isRecord(asset)) {
        issue(issues, base, "Asset request must be an object.");
        return;
      }
      if (!isNonEmptyString(asset.id)) issue(issues, `${base}.id`, "Asset id is required.");
      else if (ids.has(asset.id)) issue(issues, `${base}.id`, "Asset ids must be unique.");
      else ids.add(asset.id);
      if (!isNonEmptyString(asset.name)) issue(issues, `${base}.name`, "Asset name is required.");
      if (!ASSET_KINDS.includes(asset.kind as AssetKind)) issue(issues, `${base}.kind`, "Unsupported asset kind.");
      if (!isNonEmptyString(asset.purpose)) issue(issues, `${base}.purpose`, "Asset purpose is required.");
      if (!isFinitePositiveInteger(asset.quantity)) issue(issues, `${base}.quantity`, "quantity must be a positive integer.");
      if (!isRecord(asset.dimensions) || !isFinitePositiveInteger(asset.dimensions.width) || !isFinitePositiveInteger(asset.dimensions.height)) {
        issue(issues, `${base}.dimensions`, "dimensions must contain positive integer width and height.");
      }
      if (!TRANSPARENCY_MODES.includes(asset.transparency as TransparencyMode)) issue(issues, `${base}.transparency`, "Unsupported transparency mode.");
      if (!Array.isArray(asset.outputs) || asset.outputs.length === 0) issue(issues, `${base}.outputs`, "At least one output is required.");
      if (asset.animation !== undefined) {
        if (!isRecord(asset.animation)) issue(issues, `${base}.animation`, "animation must be an object.");
        else {
          if (!isFinitePositiveInteger(asset.animation.frameCount)) issue(issues, `${base}.animation.frameCount`, "frameCount must be a positive integer.");
          if (typeof asset.animation.framesPerSecond !== "number" || asset.animation.framesPerSecond <= 0) issue(issues, `${base}.animation.framesPerSecond`, "framesPerSecond must be greater than zero.");
          if (typeof asset.animation.loop !== "boolean") issue(issues, `${base}.animation.loop`, "loop must be boolean.");
        }
      }
    });
  }

  const autonomy = value.autonomy;
  if (!isRecord(autonomy)) {
    issue(issues, "$.autonomy", "autonomy must be an object.");
  } else {
    if (!AUTONOMY_MODES.includes(autonomy.mode as AutonomyMode)) issue(issues, "$.autonomy.mode", "Unsupported autonomy mode.");
    if (!isFinitePositiveInteger(autonomy.candidateCount)) issue(issues, "$.autonomy.candidateCount", "candidateCount must be a positive integer.");
    if (!isFinitePositiveInteger(autonomy.maximumIterations)) issue(issues, "$.autonomy.maximumIterations", "maximumIterations must be a positive integer.");
    if (typeof autonomy.autoApproveThreshold !== "number" || autonomy.autoApproveThreshold < 0 || autonomy.autoApproveThreshold > 1) {
      issue(issues, "$.autonomy.autoApproveThreshold", "autoApproveThreshold must be between 0 and 1.");
    }
    if (typeof autonomy.allowProviderFallback !== "boolean") issue(issues, "$.autonomy.allowProviderFallback", "allowProviderFallback must be boolean.");
    if (typeof autonomy.requireEvidenceBundle !== "boolean") issue(issues, "$.autonomy.requireEvidenceBundle", "requireEvidenceBundle must be boolean.");
  }

  if (issues.length > 0) return { success: false, issues };
  return { success: true, value: value as unknown as ArtBrief };
}

export function assertArtBrief(value: unknown): ArtBrief {
  const result = validateArtBrief(value);
  if (result.success) return result.value;
  const detail = result.issues.map((entry) => `${entry.path}: ${entry.message}`).join("\n");
  throw new Error(`Invalid EVAVO Art Studio brief:\n${detail}`);
}
