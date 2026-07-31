import type { ArtRenderingMode } from "@evavo/art-direction";

import {
  SPRITE_CLIP_CATALOGUE,
  gameplayDefaultClipIds,
  roleDefaultClipIds,
  type SpriteClipTemplate,
} from "./catalogue.js";
import {
  SpritePlannerError,
  type NormalizedSpritePlanCompileRequest,
  type SpriteDirectionMode,
  type SpritePlanClipOverrideInput,
  type SpritePlannedClip,
  type SpritePlannedDirection,
  type SpritePlannedFrame,
} from "./types.js";

const FEATURE_CLIPS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  walk: ["walk"], run: ["run"], turn: ["turn"], crouch: ["crouch-idle", "crouch-walk"],
  jump: ["jump-start", "jump-loop", "fall", "land"], climb: ["climb"], swim: ["swim"], fly: ["fly"],
  melee: ["combat-idle", "attack-light"], "heavy-melee": ["attack-heavy"], ranged: ["combat-idle", "attack-ranged"],
  aim: ["aim"], reload: ["reload"], block: ["block"], parry: ["parry"], dodge: ["dodge"], cast: ["cast"],
  interact: ["interact"], "use-item": ["use-item"], pickup: ["pickup"], "push-pull": ["push", "pull"],
  talk: ["talk"], gesture: ["gesture"], "work-loop": ["work-loop"], alert: ["alert"],
  "hit-react": ["hit-react"], stun: ["stun"], knockdown: ["knockdown", "get-up"], death: ["death"],
  spawn: ["spawn"], despawn: ["despawn"], "phase-transition": ["phase-transition"], special: ["special"],
  "open-close": ["open", "close"], activate: ["activate", "active-loop", "deactivate"],
  "damage-states": ["damaged", "broken", "damage", "destroyed"], "hover-press": ["hover", "pressed", "disabled", "selected", "focused"],
  "portrait-emotes": ["emote-positive", "emote-negative", "portrait-hurt"],
  "particle-loop": ["particle-loop"], "particle-impact": ["particle-impact"], "particle-trail": ["particle-trail"],
});

const CORE_CLIPS: Readonly<Record<NormalizedSpritePlanCompileRequest["role"], readonly string[]>> = Object.freeze({
  "playable-character": ["idle", "walk", "hit-react", "death"],
  npc: ["idle", "walk", "talk"],
  enemy: ["idle", "walk", "attack-light", "hit-react", "death"],
  boss: ["idle", "walk", "attack-light", "attack-heavy", "hit-react", "death"],
  companion: ["idle", "walk", "hit-react", "death"],
  vehicle: ["vehicle-idle", "move", "damage", "destroyed"],
  "animated-prop": ["prop-idle", "activate", "active-loop"],
  "destructible-prop": ["prop-idle", "damaged", "broken"],
  "particle-effect": ["particle-spawn", "particle-loop", "particle-dissipate"],
  "ui-sprite": ["normal", "hover", "pressed", "disabled"],
  "portrait-character": ["portrait-idle", "blink", "portrait-talk"],
});

const CHARACTER_CATEGORIES = new Set(["foundation", "locomotion", "combat", "interaction", "state", "cinematic"]);
const ROLE_CATEGORIES: Readonly<Record<NormalizedSpritePlanCompileRequest["role"], ReadonlySet<string>>> = {
  "playable-character": CHARACTER_CATEGORIES,
  npc: CHARACTER_CATEGORIES,
  enemy: CHARACTER_CATEGORIES,
  boss: CHARACTER_CATEGORIES,
  companion: CHARACTER_CATEGORIES,
  vehicle: new Set(["foundation", "locomotion", "combat", "state"]),
  "animated-prop": new Set(["prop", "state"]),
  "destructible-prop": new Set(["prop", "state"]),
  "particle-effect": new Set(["particle"]),
  "ui-sprite": new Set(["ui"]),
  "portrait-character": new Set(["portrait"]),
};

export function requiresEightIsometricDirections(request: NormalizedSpritePlanCompileRequest): boolean {
  return request.artDirectionContract.style.projection === "isometric-2:1" &&
    new Set(["playable-character", "npc", "enemy", "boss", "companion", "vehicle"]).has(request.role);
}

function renderingClass(mode: ArtRenderingMode): "pixel" | "raster" | "prerendered" {
  if (mode === "pre-rendered-2.5d") return "prerendered";
  if (mode === "pixel-art" || mode === "isometric-pixel" || mode === "engraved-monochrome") return "pixel";
  return "raster";
}
function fidelityMultiplier(fidelity: NormalizedSpritePlanCompileRequest["fidelity"]): number { return fidelity === "economical" ? 0.75 : fidelity === "premium" ? 1.25 : 1; }
function timingMultiplier(feel: string): number { if (feel === "snappy") return 1.15; if (feel === "weighty") return 0.88; if (feel === "floaty") return 0.82; if (feel === "cinematic") return 0.75; return 1; }

function clipSet(request: NormalizedSpritePlanCompileRequest): readonly string[] {
  const selected = new Set<string>(CORE_CLIPS[request.role]);
  if (request.coverage !== "core") {
    for (const id of roleDefaultClipIds(request.role)) selected.add(id);
    for (const id of gameplayDefaultClipIds(request.gameplayProfile)) selected.add(id);
    for (const feature of request.features) for (const id of FEATURE_CLIPS[feature] ?? []) selected.add(id);
  }
  if (request.coverage === "cinematic" && CHARACTER_CATEGORIES === ROLE_CATEGORIES[request.role]) {
    for (const id of ["turn", "gesture", "talk", "alert", "spawn", "despawn"]) selected.add(id);
  }
  for (const override of request.clipOverrides) {
    if (override.include === false) selected.delete(override.id);
    else if (override.include === true) selected.add(override.id);
  }
  const allowedCategories = ROLE_CATEGORIES[request.role];
  const categoryOrder = ["foundation", "locomotion", "combat", "interaction", "state", "cinematic", "prop", "particle", "ui", "portrait"];
  return [...selected]
    .filter((id) => { const template = SPRITE_CLIP_CATALOGUE[id]; return template ? allowedCategories.has(template.category) : true; })
    .sort((left, right) => {
      const leftTemplate = SPRITE_CLIP_CATALOGUE[left];
      const rightTemplate = SPRITE_CLIP_CATALOGUE[right];
      const difference = categoryOrder.indexOf(leftTemplate?.category ?? "cinematic") - categoryOrder.indexOf(rightTemplate?.category ?? "cinematic");
      return difference || left.localeCompare(right);
    });
}

function overrideFor(request: NormalizedSpritePlanCompileRequest, id: string): SpritePlanClipOverrideInput | undefined { return request.clipOverrides.find((entry) => entry.id === id); }
function templateFor(request: NormalizedSpritePlanCompileRequest, id: string): SpriteClipTemplate {
  const template = SPRITE_CLIP_CATALOGUE[id];
  if (template) return template;
  const override = overrideFor(request, id);
  if (!override?.framesPerDirection || !override.framesPerSecond) throw new SpritePlannerError("SPRITE_PLAN_CUSTOM_CLIP_INCOMPLETE", `Custom clip ${id} requires framesPerDirection and framesPerSecond overrides.`);
  return {
    id, category: "cinematic", directionMode: "all", loopMode: override.loopMode ?? "none",
    baseFrames: { pixel: override.framesPerDirection, raster: override.framesPerDirection, prerendered: override.framesPerDirection },
    framesPerSecond: override.framesPerSecond, keyPoseFractions: [0, 0.5, 1],
    reason: override.reason ?? "Explicit project-specific custom animation clip.",
  };
}

const MIRROR_PAIRS: readonly Readonly<[string, string]>[] = [
  ["left", "right"], ["west", "east"], ["south-west", "south-east"], ["north-west", "north-east"],
  ["southwest", "southeast"], ["northwest", "northeast"],
];

export function planDirections(request: NormalizedSpritePlanCompileRequest): readonly SpritePlannedDirection[] {
  const names = request.artDirectionContract.production.directionNames.length
    ? request.artDirectionContract.production.directionNames
    : request.artDirectionContract.asset.directionNames;
  if (!names.length) throw new SpritePlannerError("SPRITE_PLAN_DIRECTION_SET_EMPTY", "Art direction contains no direction set.");
  const style = request.artDirectionContract.style;
  const asset = request.artDirectionContract.asset;
  const safeToMirror = request.allowDerivedMirrors && style.camera.mirroring !== "forbidden" && !asset.asymmetric && !asset.hasHeldItems && !asset.runtimeEquipmentSwaps;
  const derived = new Map<string, string>();
  if (safeToMirror) for (const [derivedName, sourceName] of MIRROR_PAIRS) if (names.includes(derivedName) && names.includes(sourceName)) derived.set(derivedName, sourceName);
  return names.map((name, index) => {
    const mirrorOf = derived.get(name);
    return {
      name, index, authored: mirrorOf === undefined, masterId: `direction-master:${name}`,
      ...(mirrorOf === undefined ? {} : { mirrorOf }),
      reason: mirrorOf === undefined
        ? style.projection === "isometric-2:1"
          ? "Independent isometric direction master preserves silhouette, equipment, light and footprint."
          : "Authored direction master is the source for all clips in this facing."
        : `Deterministic horizontal mirror derived from ${mirrorOf}; permitted only because the contract is symmetric and has no held or swappable equipment.`,
    };
  });
}

function selectDirections(mode: SpriteDirectionMode, directions: readonly SpritePlannedDirection[]): readonly SpritePlannedDirection[] {
  if (mode === "none") return [{ name: "default", index: 0, authored: true, masterId: "direction-master:default", reason: "This asset has no directional facing." }];
  if (mode === "front-only") {
    const preferred = ["toward", "south", "front", "default"];
    const selected = preferred.map((name) => directions.find((entry) => entry.name === name)).find(Boolean) ?? directions.find((entry) => entry.authored) ?? directions[0];
    if (!selected) throw new SpritePlannerError("SPRITE_PLAN_DIRECTION_SET_EMPTY", "No front-facing direction is available.");
    return [selected.authored ? selected : directions.find((entry) => entry.name === selected.mirrorOf) ?? selected];
  }
  if (mode === "horizontal") { const horizontal = directions.filter((entry) => ["left", "right", "west", "east"].includes(entry.name)); return horizontal.length ? horizontal : directions; }
  return directions;
}

function frameCount(template: SpriteClipTemplate, request: NormalizedSpritePlanCompileRequest, override?: SpritePlanClipOverrideInput): number {
  if (override?.framesPerDirection !== undefined) return override.framesPerDirection;
  return Math.max(1, Math.round(template.baseFrames[renderingClass(request.artDirectionContract.style.renderingMode)] * fidelityMultiplier(request.fidelity)));
}
function framesPerSecond(template: SpriteClipTemplate, request: NormalizedSpritePlanCompileRequest, override?: SpritePlanClipOverrideInput): number {
  if (override?.framesPerSecond !== undefined) return override.framesPerSecond;
  return Math.max(1, Math.round(template.framesPerSecond * timingMultiplier(request.artDirectionContract.style.motion.timingFeel) * 1000) / 1000);
}
function keyPoses(template: SpriteClipTemplate, frames: number, override?: SpritePlanClipOverrideInput): readonly number[] {
  const values = override?.keyPoseFrames ?? template.keyPoseFractions.map((fraction) => Math.round((frames - 1) * fraction));
  const output = [...new Set(values.map((value) => Math.max(0, Math.min(frames - 1, value))))].sort((left, right) => left - right);
  if (!output.includes(0)) output.unshift(0);
  if (!output.includes(frames - 1)) output.push(frames - 1);
  return output;
}
function frameDurations(id: string, frames: number, fps: number, loopMode: string): readonly number[] {
  const base = 1000 / fps;
  const weights = Array.from({ length: frames }, () => 1);
  if (id.includes("idle") && frames > 2) { weights[0] = 1.5; weights[frames - 1] = 1.5; }
  if (id.startsWith("attack") || id === "cast" || id === "special" || id === "phase-transition") { weights[0] = 1.35; weights[Math.min(frames - 1, Math.round(frames * 0.55))] = 0.65; weights[frames - 1] = 1.4; }
  if (id === "death" || id === "destroyed" || id === "broken") weights[frames - 1] = 2.5;
  if (id === "blink" && frames >= 3) { weights[0] = 1.5; weights[Math.floor(frames / 2)] = 0.55; weights[frames - 1] = 1.5; }
  if (loopMode === "none" && !id.startsWith("attack") && frames > 1) weights[frames - 1] = Math.max(weights[frames - 1] ?? 1, 1.25);
  return weights.map((weight) => Math.max(16, Math.round(base * weight)));
}

export function planClips(request: NormalizedSpritePlanCompileRequest, directions: readonly SpritePlannedDirection[]): readonly SpritePlannedClip[] {
  return clipSet(request).map((id) => {
    const template = templateFor(request, id);
    const override = overrideFor(request, id);
    const selectedDirections = override?.directionNames?.length
      ? override.directionNames.map((name) => directions.find((entry) => entry.name === name) ?? (() => { throw new SpritePlannerError("SPRITE_PLAN_CLIP_DIRECTION_INVALID", `Clip ${id} references unknown direction ${name}.`); })())
      : selectDirections(template.directionMode, directions);
    const frames = frameCount(template, request, override);
    const fps = framesPerSecond(template, request, override);
    const loopMode = override?.loopMode ?? template.loopMode;
    const authoredDirections = selectedDirections.filter((entry) => entry.authored).map((entry) => entry.name);
    for (const direction of selectedDirections) if (!direction.authored && direction.mirrorOf && !selectedDirections.some((entry) => entry.name === direction.mirrorOf)) throw new SpritePlannerError("SPRITE_PLAN_MIRROR_SOURCE_MISSING", `Clip ${id} includes derived ${direction.name} without source ${direction.mirrorOf}.`);
    return {
      id, category: template.category, required: true, reason: override?.reason ?? template.reason, directionMode: template.directionMode,
      directionNames: selectedDirections.map((entry) => entry.name), authoredDirectionNames: authoredDirections,
      framesPerDirection: frames, framesPerSecond: fps, frameDurationsMs: frameDurations(id, frames, fps, loopMode), loopMode,
      keyPoseFrames: keyPoses(template, frames, override), runtimeFrameCount: frames * selectedDirections.length,
      authoredFrameCount: frames * authoredDirections.length, asepriteTagNames: authoredDirections.map((direction) => `${id}/${direction}`),
    };
  });
}

export function planFrames(clips: readonly SpritePlannedClip[], directions: readonly SpritePlannedDirection[], assetId: string): readonly SpritePlannedFrame[] {
  const directionByName = new Map(directions.map((entry) => [entry.name, entry]));
  const output: SpritePlannedFrame[] = [];
  let globalFrameIndex = 0;
  for (const clip of clips) for (const directionName of clip.directionNames) {
    const direction = directionByName.get(directionName) ?? { name: directionName, authored: true };
    const sourceDirection = direction.authored ? direction.name : direction.mirrorOf ?? direction.name;
    for (let frameIndex = 0; frameIndex < clip.framesPerDirection; frameIndex += 1) {
      output.push({
        id: `${clip.id}:${directionName}:${String(frameIndex).padStart(4, "0")}`, clipId: clip.id, direction: directionName,
        frameIndex, globalFrameIndex, durationMs: clip.frameDurationsMs[frameIndex]!, keyPose: clip.keyPoseFrames.includes(frameIndex),
        authored: direction.authored, sourceDirection,
        compositePath: `art/${assetId}/frames/${clip.id}/${directionName}/frame-${String(frameIndex).padStart(4, "0")}.png`,
      });
      globalFrameIndex += 1;
    }
  }
  return output;
}
