import { createHash } from "node:crypto";

import {
  ART_STUDIO_PROTOCOL_VERSION,
  assertArtBrief,
  type ArtBrief,
  type AssetRequest,
  type DeliverableSpec,
  type PipelineStageKind,
  type ProductionPlan,
  type QualityGateId,
  type QualityGateSpec,
  type TargetProfile,
  type WorkItem,
} from "@evavo/art-contracts";

const MASTER_STAGES: readonly PipelineStageKind[] = [
  "analyse",
  "art-direction",
  "concept",
  "select-candidate",
  "construct",
];

const FINISH_STAGES: readonly PipelineStageKind[] = [
  "cleanup",
  "consistency",
  "master",
  "export",
  "quality",
];

const deterministicStages = new Set<PipelineStageKind>([
  "analyse",
  "art-direction",
  "select-candidate",
  "frame-layout",
  "tile-topology",
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function slug(value: string): string {
  const result = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return result || "asset";
}

function targetIncludes(targets: readonly TargetProfile[], kind: TargetProfile["kind"]): boolean {
  return targets.some((target) => target.kind === kind);
}

function stagesFor(asset: AssetRequest, brief: ArtBrief): readonly PipelineStageKind[] {
  const middle: PipelineStageKind[] = [];

  if (asset.kind === "animation" || asset.kind === "sprite-sheet" || asset.kind === "particle") {
    middle.push("motion-design", "frame-generation", "frame-layout", "timing");
    if (asset.animation?.loop) middle.push("loop-validation");
  }
  if (asset.kind === "tileset") middle.push("tile-topology", "seam-validation");
  if (asset.kind === "cinematic") middle.push("shot-plan", "keyframes", "inbetweens", "timing", "encode");
  if (asset.kind === "sprite-sheet" || asset.kind === "tileset" || asset.kind === "particle") middle.push("atlas-pack", "manifest");
  if (asset.kind === "particle") middle.push("particle-profile");
  if (asset.kind === "print") middle.push("colour-proof", "bleed-safe-area");
  if (asset.transparency !== "opaque") middle.push("alpha-extraction", "edge-decontamination", "matte-validation");
  if (targetIncludes(brief.project.targets, "godot-4.6.2")) middle.push("godot-import-profile", "godot-resource");

  return [...MASTER_STAGES, ...middle, ...FINISH_STAGES].filter((stage, index, stages) => stages.indexOf(stage) === index);
}

const stageCapabilities: Readonly<Record<PipelineStageKind, readonly string[]>> = {
  analyse: ["brief.validate", "repo.inspect"],
  "art-direction": ["plan.compile"],
  concept: ["provider.generate"],
  "select-candidate": ["vision.consistency"],
  construct: ["provider.generate"],
  "motion-design": ["plan.compile"],
  "frame-generation": ["provider.generate", "media.animation"],
  "frame-layout": ["media.animation"],
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
  quality: ["vision.alpha", "vision.consistency", "evidence.bundle"],
};

function approvalFor(stage: PipelineStageKind, brief: ArtBrief): WorkItem["approval"] {
  if (brief.autonomy.mode === "manual" && (stage === "select-candidate" || stage === "quality")) return "human-required";
  if (brief.autonomy.mode === "review-gated" && (stage === "select-candidate" || stage === "quality")) return "policy-gated";
  return "automatic";
}

function workItemsFor(asset: AssetRequest, index: number, brief: ArtBrief): readonly WorkItem[] {
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
    };
    previous = id;
    return item;
  });
}

function gate(id: QualityGateId, severity: QualityGateSpec["severity"], description: string, evidence: readonly string[], threshold?: number): QualityGateSpec {
  return threshold === undefined ? { id, severity, description, evidence } : { id, severity, description, evidence, threshold };
}

function qualityGatesFor(asset: AssetRequest, brief: ArtBrief): readonly QualityGateSpec[] {
  const gates: QualityGateSpec[] = [
    gate("dimensions", "blocking", "Exact pixel dimensions must match the work order.", ["decoded-width", "decoded-height"]),
    gate("file-format", "blocking", "The decoded format must match the declared output profile.", ["mime-type", "decoder-format"]),
    gate("colour-profile", "blocking", "Colour space and embedded profile must match the target profile.", ["icc-profile", "colour-space"]),
    gate("style-consistency", "blocking", "The asset must remain inside the approved art-direction envelope.", ["reference-comparison", "palette-distance", "silhouette-report"], brief.autonomy.autoApproveThreshold),
    gate("composition", "blocking", "Camera, staging, crop and silhouette rules must be satisfied.", ["composition-report"]),
    gate("artifact-scan", "blocking", "Visible generation, resampling, tiling, anatomy, text and edge artifacts must be absent.", ["artifact-report"], 0.98),
    gate("compression-delta", "blocking", "Runtime compression must remain inside the approved perceptual delta from the master.", ["master-hash", "runtime-hash", "perceptual-delta"], 0.99),
    gate("provenance", "blocking", "Every deliverable must retain source, tool, provider, prompt, seed and decision provenance.", ["provenance-json", "sha256-manifest"]),
  ];

  if (asset.transparency !== "opaque") {
    gates.push(
      gate("alpha-channel", "blocking", "The file must contain a real alpha channel with expected transparent coverage.", ["alpha-channel", "alpha-histogram"]),
      gate("fake-transparency", "blocking", "Checkerboards, flat matte colours and baked transparency grids must be rejected.", ["periodicity-scan", "matte-cluster-report"]),
      gate("edge-halo", "blocking", "Edges must remain clean against black, white, green and magenta test mattes.", ["matte-contact-sheet", "edge-colour-distance"], 0.98),
      gate("transparent-pixel-colour", "blocking", "RGB values under transparent pixels must be decontaminated for filtered rendering.", ["transparent-rgb-report"]),
    );
  }

  if (asset.animation || ["animation", "sprite-sheet", "particle", "cinematic"].includes(asset.kind)) {
    gates.push(
      gate("frame-canvas", "blocking", "Every frame must share the declared canvas dimensions.", ["frame-dimension-table"]),
      gate("frame-anchor", "blocking", "Pivots, feet, baselines and centre of action must remain stable unless intentionally animated.", ["anchor-drift-report"], 0.98),
      gate("frame-duplicates", "blocking", "Accidental duplicate or missing frames must be absent.", ["frame-hash-table"]),
    );
    if (asset.animation?.loop) gates.push(gate("loop-closure", "blocking", "Loop start and end motion must close without a visible hitch.", ["loop-delta", "motion-curve"], 0.98));
  }

  if (["sprite-sheet", "tileset", "particle"].includes(asset.kind)) {
    gates.push(
      gate("atlas-padding", "blocking", "Packed regions must respect target padding and rotation policy.", ["atlas-layout", "padding-report"]),
      gate("atlas-bleed", "blocking", "Extruded edge pixels must prevent sampling bleed.", ["atlas-edge-scan"]),
      gate("manifest-integrity", "blocking", "Every named region and frame must resolve to a valid atlas rectangle.", ["manifest-validation"]),
    );
  }

  if (asset.kind === "tileset") gates.push(gate("tile-seams", "blocking", "Required tile neighbours must join without visual seams.", ["neighbour-matrix", "seam-contact-sheet"], 0.99));
  if (asset.kind === "print" || brief.project.targets.some((target) => target.kind === "print")) {
    gates.push(
      gate("print-resolution", "blocking", "Physical size and effective DPI must meet the print profile.", ["physical-size", "density-dpi"]),
      gate("print-safe-area", "blocking", "Bleed, trim and safe-area geometry must be valid.", ["print-geometry-report"]),
    );
  }

  return gates;
}

function deliverablesFor(asset: AssetRequest, index: number, brief: ArtBrief): readonly DeliverableSpec[] {
  const instance = `${slug(asset.id)}-${String(index + 1).padStart(2, "0")}`;
  const prefix = slug(asset.namingPrefix ?? asset.id);
  const deliverables: DeliverableSpec[] = asset.outputs.map((output, outputIndex) => ({
    id: `${instance}-${output.purpose}-${String(outputIndex + 1).padStart(2, "0")}`,
    assetInstanceId: instance,
    relativePath: `deliverables/${slug(asset.kind)}/${instance}/${prefix}.${output.format}`,
    format: output.format,
    purpose: output.purpose,
    width: asset.dimensions.width,
    height: asset.dimensions.height,
    transparency: asset.transparency,
    metadataSidecar: `deliverables/${slug(asset.kind)}/${instance}/${prefix}.asset.json`,
  }));

  deliverables.push({
    id: `${instance}-evidence`,
    assetInstanceId: instance,
    relativePath: `deliverables/${slug(asset.kind)}/${instance}/${prefix}.evidence.json`,
    format: "json",
    purpose: "manifest",
    transparency: "opaque",
    metadataSidecar: `deliverables/${slug(asset.kind)}/${instance}/${prefix}.asset.json`,
  });

  if (targetIncludes(brief.project.targets, "godot-4.6.2")) {
    deliverables.push({
      id: `${instance}-godot-resource`,
      assetInstanceId: instance,
      relativePath: `deliverables/${slug(asset.kind)}/${instance}/${prefix}.tres`,
      format: "tres",
      purpose: "manifest",
      transparency: asset.transparency,
      metadataSidecar: `deliverables/${slug(asset.kind)}/${instance}/${prefix}.asset.json`,
    });
  }

  return deliverables;
}

export function createProductionPlan(input: unknown): ProductionPlan {
  const brief = assertArtBrief(input);
  const briefHash = hash(brief);
  const workItems: WorkItem[] = [];
  const deliverables: DeliverableSpec[] = [];
  const qualityGates: Record<string, readonly QualityGateSpec[]> = {};

  for (const asset of brief.assets) {
    for (let index = 0; index < asset.quantity; index += 1) {
      const instance = `${slug(asset.id)}-${String(index + 1).padStart(2, "0")}`;
      workItems.push(...workItemsFor(asset, index, brief));
      deliverables.push(...deliverablesFor(asset, index, brief));
      qualityGates[instance] = qualityGatesFor(asset, brief);
    }
  }

  const warnings: string[] = [];
  if (!brief.artDirection.references?.length) warnings.push("No reference assets were supplied; style consistency will rely only on written art-direction rules.");
  if (brief.autonomy.mode === "fully-automatic" && brief.autonomy.autoApproveThreshold < 0.9) warnings.push("Fully automatic approval below 0.90 is not recommended for final production assets.");
  if (brief.assets.some((asset) => asset.transparency !== "opaque") && !brief.autonomy.requireEvidenceBundle) warnings.push("Transparent outputs should retain evidence bundles so fake transparency and edge-matte checks remain auditable.");

  return {
    schemaVersion: "1.0",
    protocolVersion: ART_STUDIO_PROTOCOL_VERSION,
    id: `plan_${briefHash.slice(0, 16)}`,
    projectName: brief.project.projectName,
    createdFromBriefHash: briefHash,
    autonomy: brief.autonomy,
    workItems,
    qualityGates,
    deliverables,
    warnings,
  };
}
