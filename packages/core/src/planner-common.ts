import { createHash } from "node:crypto";
import type {
  ArtBrief,
  AssetRequest,
  PipelineStageKind,
  SpriteContinuityBlueprint,
  SpriteFrameBlueprint,
  TargetProfile,
  WorkItem,
} from "@evavo/art-contracts";

export const MASTER_STAGES: readonly PipelineStageKind[] = [
  "analyse",
  "art-direction",
  "concept",
  "select-candidate",
  "construct",
];

export const FINISH_STAGES: readonly PipelineStageKind[] = [
  "cleanup",
  "consistency",
  "master",
  "export",
  "quality",
];

export const deterministicStages = new Set<PipelineStageKind>([
  "analyse",
  "art-direction",
  "select-candidate",
  "motion-design",
  "frame-layout",
  "layer-registration",
  "composite-reconstruction",
  "continuity-validation",
  "source-package",
  "tile-topology",
  "shot-plan",
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
]);

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function slug(value: string): string {
  const result = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return result || "asset";
}

export function targetIncludes(
  targets: readonly TargetProfile[],
  kind: TargetProfile["kind"],
): boolean {
  return targets.some((target) => target.kind === kind);
}

export function stagesFor(asset: AssetRequest, brief: ArtBrief): readonly PipelineStageKind[] {
  const middle: PipelineStageKind[] = [];

  if (asset.kind === "animation" || asset.kind === "sprite-sheet" || asset.kind === "particle") {
    middle.push("motion-design", "frame-generation", "frame-layout", "timing");
    if (asset.animation?.loop) middle.push("loop-validation");
  }
  if (asset.kind === "tileset") middle.push("tile-topology", "seam-validation");
  if (asset.kind === "cinematic") {
    middle.push("shot-plan", "keyframes", "inbetweens", "timing", "encode");
  }
  if (asset.kind === "sprite-sheet" || asset.kind === "tileset" || asset.kind === "particle") {
    middle.push("atlas-pack", "manifest");
  }
  if (asset.kind === "particle") middle.push("particle-profile");
  if (asset.kind === "print") middle.push("colour-proof", "bleed-safe-area");
  if (asset.transparency !== "opaque") {
    middle.push("alpha-extraction", "edge-decontamination", "matte-validation");
  }
  if (targetIncludes(brief.project.targets, "godot-4.6.2")) {
    middle.push("godot-import-profile", "godot-resource");
  }

  return [...MASTER_STAGES, ...middle, ...FINISH_STAGES].filter(
    (stage, index, stages) => stages.indexOf(stage) === index,
  );
}

export const stageCapabilities: Readonly<Record<PipelineStageKind, readonly string[]>> = {
  analyse: ["brief.validate", "repo.inspect"],
  "art-direction": ["plan.compile"],
  concept: ["provider.generate"],
  "select-candidate": ["vision.consistency"],
  construct: ["provider.generate"],
  "motion-design": ["sprite.plan"],
  "identity-master": ["provider.generate", "vision.identity"],
  "direction-master": ["provider.generate", "vision.identity", "vision.consistency"],
  "key-pose": ["provider.generate", "vision.identity", "vision.consistency"],
  "inbetween-frame": ["provider.generate", "media.animation", "vision.consistency"],
  "frame-generation": ["provider.generate", "media.animation"],
  "frame-layout": ["media.animation"],
  "layer-registration": ["media.animation", "vision.consistency"],
  "composite-reconstruction": ["media.raster", "vision.consistency"],
  "continuity-validation": ["vision.identity", "vision.consistency", "evidence.bundle"],
  "source-package": ["source.package", "evidence.bundle"],
  "tile-topology": ["plan.compile"],
  "shot-plan": ["plan.compile"],
  keyframes: ["provider.generate"],
  inbetweens: ["provider.generate", "media.animation"],
  cleanup: ["media.raster", "vision.consistency"],
  "alpha-extraction": ["vision.alpha"],
  "edge-decontamination": ["vision.alpha", "media.raster"],
  consistency: ["vision.consistency"],
  timing: ["media.animation"],
  "loop-validation": ["vision.consistency", "media.animation"],
  "seam-validation": ["vision.consistency"],
  "colour-proof": ["media.raster"],
  "bleed-safe-area": ["media.raster"],
  master: ["media.raster"],
  "atlas-pack": ["atlas.pack"],
  manifest: ["atlas.pack", "evidence.bundle"],
  "particle-profile": ["godot.export"],
  "godot-import-profile": ["godot.export"],
  "godot-resource": ["godot.export"],
  encode: ["media.animation"],
  export: ["media.raster", "media.animation", "evidence.bundle"],
  "matte-validation": ["vision.alpha"],
  quality: ["vision.alpha", "vision.identity", "vision.consistency", "evidence.bundle"],
};

export function approvalFor(stage: PipelineStageKind, brief: ArtBrief): WorkItem["approval"] {
  const reviewStages = new Set<PipelineStageKind>([
    "select-candidate",
    "identity-master",
    "direction-master",
    "key-pose",
    "quality",
  ]);
  if (!reviewStages.has(stage)) return "automatic";
  if (brief.autonomy.mode === "manual") return "human-required";
  if (brief.autonomy.mode === "review-gated") return "policy-gated";
  return "automatic";
}

export function genericWorkItemsFor(
  asset: AssetRequest,
  index: number,
  brief: ArtBrief,
): readonly WorkItem[] {
  const instance = `${slug(asset.id)}-${String(index + 1).padStart(2, "0")}`;
  const stages = stagesFor(asset, brief);
  let previous: string | undefined;
  return stages.map((stage) => {
    const id = `${instance}-${stage}`;
    const item: WorkItem = {
      id,
      assetInstanceId: instance,
      stage,
      title: `${asset.name}: ${stage.replaceAll("-", " ")}`,
      dependsOn: previous ? [previous] : [],
      requiredCapabilities: stageCapabilities[stage],
      deterministic: deterministicStages.has(stage),
      maximumAttempts: deterministicStages.has(stage) ? 2 : brief.autonomy.maximumIterations,
      approval: approvalFor(stage, brief),
      produces: [`work/${instance}/${stage}.json`],
      repairScope: ["atlas-pack", "manifest", "encode", "export"].includes(stage)
        ? "derivative"
        : "asset",
    };
    previous = id;
    return item;
  });
}

export function frameWorkItemId(
  blueprint: SpriteContinuityBlueprint,
  frame: SpriteFrameBlueprint,
): string {
  if (frame.role === "identity-master") return `${blueprint.assetInstanceId}-identity-master`;
  if (frame.role === "direction-master") {
    return `${blueprint.assetInstanceId}-direction-master-${slug(frame.direction)}`;
  }
  return `${frame.id}-${frame.role === "key-pose" ? "key-pose" : "inbetween"}`;
}
