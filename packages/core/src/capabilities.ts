import type { CapabilityDefinition } from "@evavo/art-contracts";

export const CAPABILITY_CATALOG: readonly CapabilityDefinition[] = Object.freeze([
  { id: "brief.validate", label: "Brief validation", description: "Validate art direction, targets, assets and autonomy policy before any work begins.", deterministic: true, workerClass: "control" },
  { id: "repo.inspect", label: "Repository inspection", description: "Inventory a project repository and infer engine, art files, delivery constraints and likely asset gaps.", deterministic: true, workerClass: "control" },
  { id: "plan.compile", label: "Production planning", description: "Compile a deterministic work-order graph, quality gates, deliverables and dependency chain.", deterministic: true, workerClass: "control" },
  { id: "provider.generate", label: "Provider-neutral generation", description: "Generate candidates through a capability-matched model adapter without binding the core to one provider.", deterministic: false, workerClass: "provider" },
  { id: "media.raster", label: "Raster mastering", description: "Resize, composite, crop, colour-convert and encode raster masters and delivery variants.", deterministic: true, workerClass: "media" },
  { id: "media.animation", label: "Animation mastering", description: "Assemble, time, inspect and encode frame sequences, sprite animations and cinematics.", deterministic: true, workerClass: "media" },
  { id: "vision.alpha", label: "Transparency verification", description: "Verify real alpha, reject checkerboard or fake transparency, decontaminate edges and test multiple mattes.", deterministic: true, workerClass: "vision" },
  { id: "vision.consistency", label: "Visual consistency", description: "Compare silhouettes, palettes, anchors, frame motion and reference adherence across an asset family.", deterministic: true, workerClass: "vision" },
  { id: "atlas.pack", label: "Atlas packing", description: "Pack frames with governed padding, extrusion, rotation and engine-specific metadata.", deterministic: true, workerClass: "media" },
  { id: "godot.export", label: "Godot delivery", description: "Produce Godot 4.6.2 import profiles, SpriteFrames resources, atlases, manifests and folder layouts.", deterministic: true, workerClass: "engine" },
  { id: "evidence.bundle", label: "Evidence bundle", description: "Hash inputs and outputs and retain prompts, seeds, tool versions, QA readings and decisions.", deterministic: true, workerClass: "control" },
]);
