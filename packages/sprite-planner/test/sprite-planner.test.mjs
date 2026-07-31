import assert from "node:assert/strict";
import test from "node:test";

import { artDirectionSha256 } from "@evavo/art-direction";
import {
  SpritePlannerError,
  compileSpritePlanJob,
  compileSpriteProductionPlan,
  spritePlannerProtocolSummary,
  validateSpritePlanCompileRequest,
} from "../dist/index.js";

function contract(overrides = {}) {
  const body = {
    schemaVersion: "1.0",
    protocolVersion: "2026-07-31.1",
    contractId: "hero-art-direction",
    requestSha256: "1".repeat(64),
    project: { projectId: "demo-rpg", title: "Demo Isometric RPG", engine: "Godot", engineVersion: "4.6.2", gameGenre: "action role-playing game", targetPlatform: "desktop" },
    style: {
      renderingMode: "isometric-pixel", projection: "isometric-2:1",
      pixelGrid: { enabled: true, antialias: "none", subpixelMotion: "forbidden" },
      camera: { mirroring: "symmetric-only" },
      motion: { timingFeel: "snappy", exactFrameDurations: true, maximumAnchorDriftPixels: 0 },
      palette: { mode: "indexed", maxColours: 64, preserveIndices: true },
    },
    asset: {
      assetId: "hero-captain", family: "character", purpose: "Playable eight-direction captain",
      dimensions: { width: 128, height: 128 }, transparency: "required", animated: true,
      directionCount: 8, directionNames: ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"],
      asymmetric: true, hasHeldItems: true, runtimeEquipmentSwaps: true, runtimeCostumeVariants: true,
      independentEffects: true, independentShadow: true, needsCollision: true, needsNormalMap: true,
      needsEmissionMap: false, largeDeformations: false,
    },
    production: {
      method: "hybrid",
      directionNames: ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"],
      pivot: { x: 64, y: 123 }, baseline: 123, ySortOrigin: { x: 64, y: 123 },
      layers: [
        { id: "identity-core", role: "identity-core", treatment: "separate-per-frame", required: true, contributesToColour: true, contributesToIdentity: true, interchangeable: false, timingIndependent: false, zOrder: 0, reason: "authored anatomy", exportPolicy: "source-and-runtime" },
        { id: "costume", role: "costume", treatment: "linked-cel", required: true, contributesToColour: true, contributesToIdentity: true, interchangeable: true, timingIndependent: false, zOrder: 10, reason: "runtime costumes", exportPolicy: "source-and-runtime" },
        { id: "weapon", role: "weapon", treatment: "linked-cel", required: true, contributesToColour: true, contributesToIdentity: true, interchangeable: true, timingIndependent: false, zOrder: 30, reason: "runtime weapons", exportPolicy: "source-and-runtime" },
        { id: "shadow", role: "shadow", treatment: "static-family", required: true, contributesToColour: true, contributesToIdentity: false, interchangeable: false, timingIndependent: true, zOrder: -20, reason: "world shadow", exportPolicy: "source-and-runtime" },
        { id: "normal", role: "normal", treatment: "engine-sidecar", required: true, contributesToColour: false, contributesToIdentity: false, interchangeable: false, timingIndependent: false, zOrder: 0, reason: "normal map", exportPolicy: "runtime-only" },
        { id: "collision", role: "collision", treatment: "engine-sidecar", required: true, contributesToColour: false, contributesToIdentity: false, interchangeable: false, timingIndependent: false, zOrder: 0, reason: "collision", exportPolicy: "runtime-only" },
        { id: "guide", role: "guide", treatment: "guide-only", required: false, contributesToColour: false, contributesToIdentity: false, interchangeable: false, timingIndependent: true, zOrder: 1000, reason: "guides", exportPolicy: "guide-only" },
      ],
      shot: { safePaddingPixels: 4, cropPolicy: "full-motion-bounds", backgroundPolicy: "transparent" },
    },
    outputs: [{
      id: "godot-4.6.2-isometric-character", target: "godot-4.6.2", textureFiltering: "nearest",
      atlas: { allowed: true, rotation: "forbidden", paddingPixels: 3, extrusionPixels: 1, trim: "alpha-aware" },
      sourceRetention: ["individual frames", "editable source", "exact timing"],
      engineMetadata: ["SpriteFrames", "Y-sort origin"], importRecommendations: ["nearest filtering", "Y-sort parent"],
    }],
    delivery: { godot: { engineVersion: "4.6.2", nodeRecommendations: ["AnimatedSprite2D"], projectSettings: ["Y-sort enabled"], resourceOutputs: ["SpriteFrames"] } },
    ...overrides,
  };
  return { ...body, contractSha256: artDirectionSha256(body) };
}

function request(overrides = {}) {
  return {
    schemaVersion: "1.0", planId: "hero-complete-sprite-plan", artDirectionContract: contract(),
    role: "playable-character", gameplayProfile: "action-rpg", coverage: "complete", fidelity: "premium",
    includeFeatures: ["ranged", "aim", "reload", "talk", "gesture", "spawn", "despawn"], allowDerivedMirrors: true,
    variants: { costumeVariants: 3, equipmentVariants: 2, weaponVariants: 4, teamColourVariants: 4, damageVariants: 2 },
    output: { sheetStrategy: "per-clip-layer-grid", maximumSheetSize: 2048, includeAsepriteExport: true, includePerClipSheets: true, includeFamilyAtlas: true, includeGodotResources: true },
    ...overrides,
  };
}

test("compiles all eight authored isometric directions and a complete role-aware clip matrix", () => {
  const plan = compileSpriteProductionPlan(request());
  assert.equal(plan.directions.length, 8);
  assert.equal(plan.directions.every((entry) => entry.authored), true);
  for (const id of ["walk", "attack-light", "attack-ranged", "reload", "talk"]) assert.ok(plan.clips.some((clip) => clip.id === id));
  assert.ok(plan.totals.runtimeFrames > 500);
});

test("builds exact ordered frames, key poses, durations and Godot animations", () => {
  const plan = compileSpriteProductionPlan(request());
  assert.equal(plan.frames.length, plan.clips.reduce((sum, clip) => sum + clip.runtimeFrameCount, 0));
  assert.equal(plan.frames.every((frame, index) => frame.durationMs > 0 && frame.globalFrameIndex === index), true);
  assert.ok(plan.frames.some((frame) => frame.keyPose));
  assert.equal(plan.godot.animations.length, plan.clips.reduce((sum, clip) => sum + clip.directionNames.length, 0));
  assert.equal(plan.godot.animations.every((animation) => animation.durationMultipliers.length === animation.framePaths.length), true);
});

test("keeps variants as layers or palette maps instead of flattening the Cartesian product", () => {
  const plan = compileSpriteProductionPlan(request());
  assert.equal(plan.variants.runtimeCombinations, 192);
  assert.equal(plan.variants.strategies.find((entry) => entry.kind === "costume")?.strategy, "separate-layer");
  assert.equal(plan.variants.strategies.find((entry) => entry.kind === "weapon")?.strategy, "separate-layer");
  assert.equal(plan.variants.strategies.find((entry) => entry.kind === "team-colour")?.strategy, "palette-map");
  assert.ok(plan.variants.authoredVariantUnits < plan.variants.flattenedFullFamilyCombinations);
});

test("emits paged no-rotation sheets, an atlas plan and Aseprite tags and slices", () => {
  const plan = compileSpriteProductionPlan(request());
  assert.ok(plan.sheets.length > plan.clips.length);
  assert.equal(plan.sheets.every((sheet) => sheet.rotation === "forbidden" && sheet.rows * sheet.cellHeight <= 2048 && sheet.columns * sheet.cellWidth <= 2048), true);
  assert.equal(plan.atlas.packing, "deterministic-maxrects-no-rotation");
  assert.ok(plan.aseprite.tags.some((tag) => tag.name === "walk/south"));
  assert.ok(plan.aseprite.slices.some((slice) => slice.purpose === "tile-footprint"));
  assert.ok(plan.aseprite.prohibitedOptions.some((entry) => entry.includes("merge-duplicates")));
});

test("derives safe mirrors only when explicit and forces authored sides for held items", () => {
  const safe = contract({
    style: { ...contract().style, projection: "side", camera: { mirroring: "symmetric-only" } },
    asset: { ...contract().asset, directionCount: 2, directionNames: ["left", "right"], asymmetric: false, hasHeldItems: false, runtimeEquipmentSwaps: false },
    production: { ...contract().production, directionNames: ["left", "right"] },
  });
  const mirrored = compileSpriteProductionPlan(request({ artDirectionContract: safe, variants: { costumeVariants: 1, equipmentVariants: 1, weaponVariants: 1, teamColourVariants: 1, damageVariants: 1 } }));
  assert.equal(mirrored.directions.filter((entry) => entry.authored).length, 1);
  assert.equal(mirrored.directions.find((entry) => entry.name === "left")?.mirrorOf, "right");
  const held = contract({
    style: { ...contract().style, projection: "side", camera: { mirroring: "allowed" } },
    asset: { ...contract().asset, directionCount: 2, directionNames: ["left", "right"], asymmetric: false, hasHeldItems: true, runtimeEquipmentSwaps: false },
    production: { ...contract().production, directionNames: ["left", "right"] },
  });
  assert.equal(compileSpriteProductionPlan(request({ artDirectionContract: held })).directions.every((entry) => entry.authored), true);
});

test("compiles prop and particle inventories without inventing isometric facings", () => {
  const propContract = contract({
    asset: { ...contract().asset, assetId: "door", family: "prop", purpose: "Animated door", directionCount: 1, directionNames: ["default"], asymmetric: false, hasHeldItems: false, runtimeEquipmentSwaps: false },
    production: { ...contract().production, directionNames: ["default"] },
  });
  const prop = compileSpriteProductionPlan(request({ artDirectionContract: propContract, role: "animated-prop", gameplayProfile: "simulation", includeFeatures: ["open-close", "damage-states"] }));
  assert.ok(prop.clips.some((clip) => clip.id === "open"));
  assert.ok(prop.clips.some((clip) => clip.id === "broken"));
  const particleContract = contract({
    asset: { ...contract().asset, assetId: "impact-fire", family: "particle", purpose: "Impact fire", directionCount: 1, directionNames: ["default"], asymmetric: false, hasHeldItems: false, runtimeEquipmentSwaps: false },
    production: { ...contract().production, directionNames: ["default"], layers: [{ id: "effect", role: "effect", treatment: "separate-per-frame", required: true, contributesToColour: true, contributesToIdentity: false, interchangeable: false, timingIndependent: true, zOrder: 0, reason: "effect", exportPolicy: "source-and-runtime" }] },
  });
  const particle = compileSpriteProductionPlan(request({ artDirectionContract: particleContract, role: "particle-effect", gameplayProfile: "custom", includeFeatures: ["particle-impact", "particle-trail"] }));
  assert.equal(particle.clips.every((clip) => clip.directionNames.length === 1), true);
  assert.ok(particle.qualityGates.some((gate) => gate.id === "particle-fixed-cell-coverage"));
});

test("supports bounded custom clips and rejects tampered art-direction contracts", () => {
  const plan = compileSpriteProductionPlan(request({ gameplayProfile: "custom", clipOverrides: [{ id: "ship-rigging-swing", include: true, framesPerDirection: 9, framesPerSecond: 9, loopMode: "linear", reason: "Project-specific rope swing." }] }));
  assert.equal(plan.clips.find((clip) => clip.id === "ship-rigging-swing")?.framesPerDirection, 9);
  const broken = contract();
  broken.asset.assetId = "tampered";
  assert.throws(() => validateSpritePlanCompileRequest(request({ artDirectionContract: broken })), (error) => error instanceof SpritePlannerError && error.code === "SPRITE_PLAN_ART_DIRECTION_HASH_MISMATCH");
});

test("compilation, jobs and protocol are deterministic and complete", () => {
  const first = compileSpriteProductionPlan(request());
  const second = compileSpriteProductionPlan(request());
  assert.equal(first.requestSha256, second.requestSha256);
  assert.equal(first.planSha256, second.planSha256);
  const job = compileSpritePlanJob(request());
  assert.equal(job.runtimeJob.kind, "art.sprite-plan.compile");
  assert.deepEqual(job.runtimeJob.requiredCapabilities, ["sprite.inventory.compile", "sprite.animation-matrix.compile", "sprite.sheet-plan.compile", "godot.spriteframes-plan", "evidence.bundle"]);
  const protocol = spritePlannerProtocolSummary();
  assert.ok(protocol.directionRules.some((entry) => entry.includes("eight")));
  assert.ok(protocol.sourceRules.some((entry) => entry.includes("sole source")));
  assert.ok(protocol.godotRules.some((entry) => entry.includes("SpriteFrames")));
});
