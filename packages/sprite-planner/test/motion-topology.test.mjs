import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SpritePlannerError,
  compileSpriteMotionTopology,
  spriteMotionTopologyProtocolSummary,
  spritePlanSha256,
} from "../dist/index.js";

const EIGHT_DIRECTIONS = ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"];
const SIXTEEN_DIRECTIONS = [
  "south", "south-south-west", "south-west", "west-south-west",
  "west", "west-north-west", "north-west", "north-north-west",
  "north", "north-north-east", "north-east", "east-north-east",
  "east", "east-south-east", "south-east", "south-south-east",
];

function clip(id, category, frameCount, loopMode = "none") {
  return {
    id,
    category,
    loopMode,
    framesPerDirection: frameCount,
    keyPoseFrames: [...new Set([0, Math.floor((frameCount - 1) / 2), frameCount - 1])],
    frameDurationsMs: Array.from({ length: frameCount }, (_entry, index) => 80 + index * 5),
    directionNames: [],
  };
}

function compiledPlan({ directionNames = EIGHT_DIRECTIONS, clips = [clip("walk", "locomotion", 8, "linear")], isometric = true } = {}) {
  const directions = directionNames.map((name, index) => ({ name, index, authored: true, masterId: `direction-master:${name}`, reason: "test" }));
  const plannedClips = clips.map((entry) => ({ ...entry, directionNames, authoredDirectionNames: directionNames, runtimeFrameCount: entry.framesPerDirection * directionNames.length, authoredFrameCount: entry.framesPerDirection * directionNames.length, asepriteTagNames: directionNames.map((direction) => `${entry.id}/${direction}`), required: true, reason: "test", directionMode: directionNames.length === 1 ? "none" : "all" }));
  const frames = [];
  let globalFrameIndex = 0;
  for (const entry of plannedClips) for (const direction of directionNames) for (let frameIndex = 0; frameIndex < entry.framesPerDirection; frameIndex += 1) {
    frames.push({
      id: `frame:${entry.id}:${direction}:${frameIndex}`,
      clipId: entry.id,
      direction,
      frameIndex,
      globalFrameIndex: globalFrameIndex++,
      durationMs: entry.frameDurationsMs[frameIndex],
      keyPose: entry.keyPoseFrames.includes(frameIndex),
      authored: true,
      sourceDirection: direction,
      compositePath: `art/test/${entry.id}/${direction}/frame-${frameIndex}.png`,
    });
  }
  const body = {
    schemaVersion: "1.0",
    protocolVersion: "2026-07-29.1",
    planId: "motion-topology-test",
    requestSha256: "1".repeat(64),
    artDirectionBinding: { contractId: "test", contractSha256: "2".repeat(64), protocolVersion: "test" },
    project: { projectId: "test", title: "Test", engine: "Godot", engineVersion: "4.6.2", gameGenre: "test", targetPlatform: "desktop" },
    asset: { assetId: "test", family: "character", purpose: "test", dimensions: { width: 64, height: 64 }, transparency: "required", animated: true, directionCount: directionNames.length, directionNames, asymmetric: true, hasHeldItems: false, runtimeEquipmentSwaps: false, runtimeCostumeVariants: false, independentEffects: false, independentShadow: false, needsCollision: true, needsNormalMap: false, needsEmissionMap: false, largeDeformations: false },
    role: "playable-character",
    gameplayProfile: "action-rpg",
    coverage: "complete",
    fidelity: "premium",
    features: [],
    directions,
    clips: plannedClips,
    frames,
    layers: [],
    variants: { runtimeCombinations: 1, flattenedFullFamilyCombinations: frames.length, authoredVariantUnits: 0, strategies: [] },
    sheets: [],
    atlas: { enabled: false, maximumWidth: 2048, maximumHeight: 2048, packing: "deterministic-maxrects-no-rotation", trim: "forbidden", paddingPixels: 0, extrusionPixels: 0, estimatedPages: 0, sourceFrameCount: frames.length, imagePathPattern: "", dataPathPattern: "" },
    aseprite: { enabled: true, sourcePath: "", tags: [], slices: isometric ? [{ name: "tile-footprint", purpose: "tile-footprint", x: 32, y: 60 }] : [], exportCommands: [], prohibitedOptions: [] },
    godot: { enabled: true, engineVersion: "4.6.2", primaryNode: "AnimatedSprite2D", resourcePath: "", atlasResourcePath: "", animationLibraryPath: "", layerNodes: [], animations: [], projectRequirements: [], ySortOrigin: { x: 32, y: 60 }, pivot: { x: 32, y: 60 } },
    workItems: [],
    qualityGates: [],
    totals: { clips: plannedClips.length, runtimeFrames: frames.length, authoredFrames: frames.length, layerSourceUnits: 0, runtimeLayerBindings: 0, sheets: 0, estimatedAtlasPages: 0 },
    sourceOfTruth: [],
    warnings: [],
  };
  return { ...body, planSha256: spritePlanSha256(body) };
}

test("compiles strict 2:1 isometric geometry, semantic phases and frame continuity", () => {
  const plan = compiledPlan({
    clips: [
      clip("idle", "foundation", 4, "linear"),
      clip("walk", "locomotion", 8, "linear"),
      clip("attack-light", "combat", 6),
      clip("hit-react", "state", 5),
      clip("death", "state", 7),
      clip("jump-start", "locomotion", 6),
    ],
  });
  const first = compileSpriteMotionTopology(plan);
  const second = compileSpriteMotionTopology(plan);
  assert.equal(first.topologySha256, second.topologySha256);
  assert.equal(first.options.projection, "isometric-2:1");
  assert.equal(first.directions.length, 8);
  const south = first.directions.find((entry) => entry.name === "south");
  assert.equal(south?.worldAngleDegrees, 180);
  assert.equal(south?.oppositeDirection, "north");
  assert.deepEqual(south?.adjacentDirections, ["south-east", "south-west"]);
  assert.ok((south?.screenVector.x ?? 0) < 0 && (south?.screenVector.y ?? 0) > 0);
  assert.deepEqual(first.clips.find((entry) => entry.clipId === "walk")?.phases.map((entry) => entry.id), ["contact-a", "passing-a", "contact-b", "passing-b"]);
  assert.ok(first.clips.find((entry) => entry.clipId === "attack-light")?.phases.some((entry) => entry.id === "impact"));
  assert.ok(first.clips.find((entry) => entry.clipId === "death")?.phases.some((entry) => entry.id === "collapse"));
  assert.ok(first.clips.find((entry) => entry.clipId === "jump-start")?.phases.some((entry) => entry.groundContact === "airborne"));
  assert.equal(first.frameBindings.length, plan.frames.length);
  const loopStart = first.frameBindings.find((entry) => entry.clipId === "walk" && entry.direction === "south" && entry.frameIndex === 0);
  assert.equal(loopStart?.previousFrameId, "frame:walk:south:7");
  assert.equal(loopStart?.nextFrameId, "frame:walk:south:1");
  assert.equal(loopStart?.clockwiseDirectionFrameId, "frame:walk:south-west:0");
  assert.equal(loopStart?.counterClockwiseDirectionFrameId, "frame:walk:south-east:0");
  assert.equal(first.qualityGates.every((entry) => entry.passed), true);
  assert.deepEqual(first.authority, { compileOnly: true, providerCalled: false, artworkMutated: false, candidateSelected: false, candidatePromoted: false, targetRepositoryMutated: false, publicationPerformed: false });
});

test("supports sixteen directions and caller-supplied fixed-camera 2.5D bases", () => {
  const plan = compiledPlan({ directionNames: SIXTEEN_DIRECTIONS, isometric: false });
  const topology = compileSpriteMotionTopology(plan, {
    projection: "pre-rendered-2.5d",
    screenBasis: { east: { x: 0.92, y: 0.38 }, south: { x: -0.72, y: 0.62 } },
  });
  assert.equal(topology.directions.length, 16);
  assert.equal(topology.options.screenBasisSource, "caller-supplied");
  const south = topology.directions.find((entry) => entry.name === "south");
  assert.equal(south?.clockwiseDirection, "south-south-west");
  assert.equal(south?.counterClockwiseDirection, "south-south-east");
  assert.equal(south?.oppositeDirection, "north");
  assert.equal(topology.warnings.some((entry) => entry.includes("neutral screen basis")), false);
});

test("keeps split platformer jump lifecycle phases physically distinct", () => {
  const plan = compiledPlan({
    directionNames: ["left", "right"],
    isometric: false,
    clips: [
      clip("jump-start", "locomotion", 4),
      clip("jump-loop", "locomotion", 2, "linear"),
      clip("fall", "locomotion", 4, "linear"),
      clip("land", "locomotion", 3),
    ],
  });
  const topology = compileSpriteMotionTopology(plan, { projection: "side" });
  const jumpStart = topology.clips.find((entry) => entry.clipId === "jump-start");
  const jumpLoop = topology.clips.find((entry) => entry.clipId === "jump-loop");
  const fall = topology.clips.find((entry) => entry.clipId === "fall");
  const land = topology.clips.find((entry) => entry.clipId === "land");

  assert.deepEqual(
    jumpStart?.phases.map((entry) => [entry.id, entry.groundContact]),
    [
      ["anticipation", "grounded"],
      ["takeoff", "transition"],
      ["ascent", "airborne"],
    ],
  );
  assert.deepEqual(
    jumpLoop?.phases.map((entry) => [entry.id, entry.groundContact]),
    [["airborne-hold", "airborne"]],
  );
  assert.deepEqual(
    fall?.phases.map((entry) => [entry.id, entry.groundContact]),
    [["descent", "airborne"]],
  );
  assert.deepEqual(
    land?.phases.map((entry) => [entry.id, entry.groundContact]),
    [
      ["landing", "grounded"],
      ["recovery", "grounded"],
    ],
  );
  assert.equal(
    topology.frameBindings
      .filter((entry) => entry.clipId === "jump-loop")
      .every((entry) => entry.phaseId === "airborne-hold"),
    true,
  );
  assert.deepEqual(
    topology.directions.find((entry) => entry.name === "left")?.adjacentDirections,
    ["right"],
  );
});

test("records dynamic direction fallback but fails closed when strict labels are required", () => {
  const plan = compiledPlan({ directionNames: ["facing-0", "facing-1", "facing-2", "facing-3"], isometric: false });
  assert.throws(() => compileSpriteMotionTopology(plan, { projection: "top-down", strictDirectionLabels: true }), (error) => error instanceof SpritePlannerError && error.code === "SPRITE_MOTION_DIRECTION_LABEL_UNKNOWN");
  const topology = compileSpriteMotionTopology(plan, { projection: "top-down", strictDirectionLabels: false });
  assert.equal(topology.directions.every((entry) => entry.angleSource === "evenly-spaced-fallback"), true);
  assert.ok(topology.warnings.some((entry) => entry.includes("stable direction order")));
});

test("covers every bounded frame count and rejects a source mutation", () => {
  for (let frameCount = 1; frameCount <= 20; frameCount += 1) {
    const plan = compiledPlan({ directionNames: ["default"], isometric: false, clips: [clip("custom-action", "cinematic", frameCount)] });
    const topology = compileSpriteMotionTopology(plan);
    assert.equal(topology.clips[0]?.phases.reduce((sum, phase) => sum + phase.frameCount, 0), frameCount);
    assert.equal(topology.frameBindings.length, frameCount);
  }
  const plan = compiledPlan();
  plan.frames[0].direction = "north";
  assert.throws(() => compileSpriteMotionTopology(plan), (error) => error instanceof SpritePlannerError && error.code === "SPRITE_MOTION_SOURCE_PLAN_HASH_MISMATCH");
});

test("publishes an explicit compile-only protocol contract", () => {
  const summary = spriteMotionTopologyProtocolSummary();
  assert.equal(summary.protocolVersion, "2026-08-07.2");
  assert.ok(summary.directionRules.some((entry) => entry.includes("sixteen-direction")));
  assert.ok(summary.animationRules.some((entry) => entry.includes("semantic phases")));
  assert.ok(summary.authorityRules.some((entry) => entry.includes("provider-free")));
});

test("keeps the motion-topology source, documentation and permanent workflow wired", () => {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repositoryRoot = path.resolve(packageRoot, "../..");
  const indexSource = fs.readFileSync(path.join(packageRoot, "src/index.ts"), "utf8");
  const topologySource = fs.readFileSync(path.join(packageRoot, "src/motion-topology.ts"), "utf8");
  const workflow = fs.readFileSync(path.join(repositoryRoot, ".github/workflows/sprite-motion-topology.yml"), "utf8");
  const documentation = fs.readFileSync(path.join(repositoryRoot, "docs/SPRITE_MOTION_TOPOLOGY.md"), "utf8");
  assert.match(indexSource, /export \* from "\.\/motion-topology\.js";/);
  for (const token of ["SPRITE_MOTION_SOURCE_PLAN_HASH_MISMATCH", "SPRITE_MOTION_ISOMETRIC_DIRECTION_COUNT_INVALID", "providerCalled: false", "targetRepositoryMutated: false", "publicationPerformed: false"]) assert.ok(topologySource.includes(token), token);
  assert.ok(workflow.includes("pnpm --filter @evavo/art-sprite-planner test"));
  assert.ok(workflow.includes("git diff --exit-code"));
  assert.ok(documentation.includes("A required animation frame should never be generated as an unrelated prompt-only image."));
});
