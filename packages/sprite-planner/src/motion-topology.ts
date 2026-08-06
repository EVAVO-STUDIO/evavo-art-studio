import {
  SpritePlannerError,
  type CompiledSpriteProductionPlan,
  type SpriteLoopMode,
  type SpritePlannedClip,
  type SpritePlannedFrame,
} from "./types.js";
import { spritePlanSha256 } from "./validation.js";

export const SPRITE_MOTION_TOPOLOGY_PROTOCOL_VERSION = "2026-08-07.1" as const;

export type SpriteMotionProjection =
  | "auto"
  | "single-view"
  | "side"
  | "top-down"
  | "isometric-2:1"
  | "pre-rendered-2.5d";

export type SpriteGroundContact = "grounded" | "airborne" | "transition" | "not-applicable";
export type SpriteDirectionAngleSource = "explicit-label" | "evenly-spaced-fallback" | "non-directional";

export interface SpriteMotionVector {
  readonly x: number;
  readonly y: number;
}

export interface SpriteMotionScreenBasis {
  readonly east: SpriteMotionVector;
  readonly south: SpriteMotionVector;
}

export interface SpriteMotionTopologyOptions {
  readonly projection?: SpriteMotionProjection;
  readonly screenBasis?: SpriteMotionScreenBasis;
  readonly strictDirectionLabels?: boolean;
  readonly requireEightDirectionsForIsometric?: boolean;
}

export interface NormalizedSpriteMotionTopologyOptions {
  readonly projection: Exclude<SpriteMotionProjection, "auto">;
  readonly screenBasis: SpriteMotionScreenBasis;
  readonly screenBasisSource: "projection-default" | "caller-supplied";
  readonly strictDirectionLabels: boolean;
  readonly requireEightDirectionsForIsometric: boolean;
}

export interface SpriteDirectionGeometry {
  readonly name: string;
  readonly index: number;
  readonly authored: boolean;
  readonly angleSource: SpriteDirectionAngleSource;
  readonly worldAngleDegrees?: number;
  readonly worldVector: SpriteMotionVector;
  readonly screenVector: SpriteMotionVector;
  readonly oppositeDirection?: string;
  readonly clockwiseDirection?: string;
  readonly counterClockwiseDirection?: string;
  readonly adjacentDirections: readonly string[];
  readonly mirrorOf?: string;
}

export interface SpriteSemanticPhase {
  readonly id: string;
  readonly label: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly keyFrame: number;
  readonly frameCount: number;
  readonly durationMs: number;
  readonly motionIntent: string;
  readonly groundContact: SpriteGroundContact;
}

export interface SpriteClipMotionTopology {
  readonly clipId: string;
  readonly category: SpritePlannedClip["category"];
  readonly loopMode: SpriteLoopMode;
  readonly framesPerDirection: number;
  readonly phases: readonly SpriteSemanticPhase[];
  readonly phaseCoverageComplete: true;
  readonly phaseDurationMs: number;
}

export interface SpriteFrameContinuityBinding {
  readonly frameId: string;
  readonly clipId: string;
  readonly direction: string;
  readonly frameIndex: number;
  readonly phaseId: string;
  readonly phaseProgress: number;
  readonly previousFrameId?: string;
  readonly nextFrameId?: string;
  readonly clockwiseDirectionFrameId?: string;
  readonly counterClockwiseDirectionFrameId?: string;
  readonly canonicalReferenceIds: readonly string[];
}

export interface SpriteMotionTopologyGate {
  readonly id: string;
  readonly severity: "blocking" | "warning";
  readonly description: string;
  readonly expected: number | string | boolean;
  readonly actual: number | string | boolean;
  readonly passed: boolean;
}

export interface CompiledSpriteMotionTopology {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SPRITE_MOTION_TOPOLOGY_PROTOCOL_VERSION;
  readonly sourcePlanId: string;
  readonly sourcePlanSha256: string;
  readonly topologySha256: string;
  readonly options: NormalizedSpriteMotionTopologyOptions;
  readonly directions: readonly SpriteDirectionGeometry[];
  readonly clips: readonly SpriteClipMotionTopology[];
  readonly frameBindings: readonly SpriteFrameContinuityBinding[];
  readonly qualityGates: readonly SpriteMotionTopologyGate[];
  readonly warnings: readonly string[];
  readonly authority: Readonly<{
    readonly compileOnly: true;
    readonly providerCalled: false;
    readonly artworkMutated: false;
    readonly candidateSelected: false;
    readonly candidatePromoted: false;
    readonly targetRepositoryMutated: false;
    readonly publicationPerformed: false;
  }>;
}

interface PhaseTemplate {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly motionIntent: string;
  readonly groundContact: SpriteGroundContact;
}

const COMPASS_ANGLES: Readonly<Record<string, number>> = Object.freeze({
  north: 0,
  "north-north-east": 22.5,
  "north-east": 45,
  "east-north-east": 67.5,
  east: 90,
  right: 90,
  "east-south-east": 112.5,
  "south-east": 135,
  "south-south-east": 157.5,
  south: 180,
  front: 180,
  toward: 180,
  "south-south-west": 202.5,
  "south-west": 225,
  "west-south-west": 247.5,
  west: 270,
  left: 270,
  "west-north-west": 292.5,
  "north-west": 315,
  "north-north-west": 337.5,
  back: 0,
  away: 0,
});

const DIRECTION_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  n: "north",
  nne: "north-north-east",
  ne: "north-east",
  northeast: "north-east",
  ene: "east-north-east",
  e: "east",
  ese: "east-south-east",
  se: "south-east",
  southeast: "south-east",
  sse: "south-south-east",
  s: "south",
  ssw: "south-south-west",
  sw: "south-west",
  southwest: "south-west",
  wsw: "west-south-west",
  w: "west",
  wnw: "west-north-west",
  nw: "north-west",
  northwest: "north-west",
  nnw: "north-north-west",
});

const SINGLE_PHASE: readonly PhaseTemplate[] = Object.freeze([
  { id: "hold", label: "Hold", weight: 1, motionIntent: "Preserve the exact authored state.", groundContact: "not-applicable" },
]);

const PHASES = Object.freeze({
  idle: [
    { id: "settle", label: "Settle", weight: 0.2, motionIntent: "Resolve into the stable idle silhouette.", groundContact: "grounded" },
    { id: "hold", label: "Hold", weight: 0.6, motionIntent: "Preserve identity, balance and readable breathing or secondary motion.", groundContact: "grounded" },
    { id: "return", label: "Return", weight: 0.2, motionIntent: "Return seamlessly to the first idle pose.", groundContact: "grounded" },
  ],
  locomotion: [
    { id: "contact-a", label: "Contact A", weight: 0.25, motionIntent: "Establish the first grounded contact and weight transfer.", groundContact: "grounded" },
    { id: "passing-a", label: "Passing A", weight: 0.25, motionIntent: "Pass the moving limb through the body line without scale drift.", groundContact: "transition" },
    { id: "contact-b", label: "Contact B", weight: 0.25, motionIntent: "Establish the opposite grounded contact at the same footprint.", groundContact: "grounded" },
    { id: "passing-b", label: "Passing B", weight: 0.25, motionIntent: "Complete the cycle and preserve loop velocity.", groundContact: "transition" },
  ],
  attack: [
    { id: "anticipation", label: "Anticipation", weight: 0.2, motionIntent: "Load weight and make the action readable before commitment.", groundContact: "grounded" },
    { id: "commitment", label: "Commitment", weight: 0.25, motionIntent: "Drive the action toward the target while preserving weapon and hand occupancy.", groundContact: "transition" },
    { id: "impact", label: "Impact", weight: 0.2, motionIntent: "Present the authored hit, release or cast key pose.", groundContact: "transition" },
    { id: "recovery", label: "Recovery", weight: 0.35, motionIntent: "Resolve momentum and return to a valid gameplay state.", groundContact: "grounded" },
  ],
  reaction: [
    { id: "impact", label: "Impact", weight: 0.2, motionIntent: "Register the incoming force without changing identity or costume topology.", groundContact: "transition" },
    { id: "recoil", label: "Recoil", weight: 0.45, motionIntent: "Carry the reaction through a readable displacement.", groundContact: "transition" },
    { id: "recovery", label: "Recovery", weight: 0.35, motionIntent: "Restore a valid grounded or controlled state.", groundContact: "grounded" },
  ],
  collapse: [
    { id: "impact", label: "Impact", weight: 0.15, motionIntent: "Register the terminal force or failure.", groundContact: "transition" },
    { id: "collapse", label: "Collapse", weight: 0.55, motionIntent: "Move the silhouette through the complete fall or destruction arc.", groundContact: "transition" },
    { id: "settle", label: "Settle", weight: 0.3, motionIntent: "Reach the final stable pose without rebound or geometry drift.", groundContact: "grounded" },
  ],
  jump: [
    { id: "anticipation", label: "Anticipation", weight: 0.16, motionIntent: "Compress before leaving the ground.", groundContact: "grounded" },
    { id: "takeoff", label: "Takeoff", weight: 0.17, motionIntent: "Break ground contact at the authored launch frame.", groundContact: "transition" },
    { id: "ascent", label: "Ascent", weight: 0.18, motionIntent: "Carry upward motion while preserving direction and scale.", groundContact: "airborne" },
    { id: "apex", label: "Apex", weight: 0.16, motionIntent: "Hold the highest readable airborne pose.", groundContact: "airborne" },
    { id: "descent", label: "Descent", weight: 0.18, motionIntent: "Prepare the silhouette for landing without foot sliding.", groundContact: "airborne" },
    { id: "landing", label: "Landing", weight: 0.15, motionIntent: "Re-establish the exact ground anchor and absorb momentum.", groundContact: "grounded" },
  ],
  transition: [
    { id: "setup", label: "Setup", weight: 0.25, motionIntent: "Establish the starting state and readable intent.", groundContact: "not-applicable" },
    { id: "transition", label: "Transition", weight: 0.5, motionIntent: "Carry the state change through its defining motion.", groundContact: "transition" },
    { id: "resolve", label: "Resolve", weight: 0.25, motionIntent: "Reach the exact destination state.", groundContact: "not-applicable" },
  ],
  generic: [
    { id: "setup", label: "Setup", weight: 0.25, motionIntent: "Establish the action and canonical silhouette.", groundContact: "not-applicable" },
    { id: "action", label: "Action", weight: 0.5, motionIntent: "Present the defining movement or state change.", groundContact: "transition" },
    { id: "recovery", label: "Recovery", weight: 0.25, motionIntent: "Resolve into a valid next state.", groundContact: "not-applicable" },
  ],
} satisfies Readonly<Record<string, readonly PhaseTemplate[]>>);

function round(value: number): number {
  const normalized = Math.abs(value) < 0.0000005 ? 0 : value;
  return Math.round(normalized * 1_000_000) / 1_000_000;
}

function vector(x: number, y: number): SpriteMotionVector {
  return { x: round(x), y: round(y) };
}

function normalizeVector(value: SpriteMotionVector): SpriteMotionVector {
  const magnitude = Math.hypot(value.x, value.y);
  if (magnitude === 0) return vector(0, 0);
  return vector(value.x / magnitude, value.y / magnitude);
}

function normalizeDirectionName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/-+/g, "-");
  return DIRECTION_ALIASES[normalized] ?? normalized;
}

function explicitAngle(name: string): number | undefined {
  return COMPASS_ANGLES[normalizeDirectionName(name)];
}

function worldVector(angleDegrees: number): SpriteMotionVector {
  const radians = angleDegrees * Math.PI / 180;
  return vector(Math.sin(radians), -Math.cos(radians));
}

function transformToScreen(world: SpriteMotionVector, basis: SpriteMotionScreenBasis): SpriteMotionVector {
  return normalizeVector(vector(
    world.x * basis.east.x + world.y * basis.south.x,
    world.x * basis.east.y + world.y * basis.south.y,
  ));
}

function defaultBasis(projection: NormalizedSpriteMotionTopologyOptions["projection"]): SpriteMotionScreenBasis {
  if (projection === "isometric-2:1") return { east: vector(1, 0.5), south: vector(-1, 0.5) };
  if (projection === "side") return { east: vector(1, 0), south: vector(0, 0) };
  return { east: vector(1, 0), south: vector(0, 1) };
}

function validateBasis(value: SpriteMotionScreenBasis): SpriteMotionScreenBasis {
  for (const [name, component] of Object.entries({ eastX: value.east.x, eastY: value.east.y, southX: value.south.x, southY: value.south.y })) {
    if (!Number.isFinite(component) || Math.abs(component) > 16) throw new SpritePlannerError("SPRITE_MOTION_BASIS_INVALID", `${name} must be a finite number between -16 and 16.`);
  }
  if (value.east.x === 0 && value.east.y === 0 && value.south.x === 0 && value.south.y === 0) {
    throw new SpritePlannerError("SPRITE_MOTION_BASIS_INVALID", "At least one screen-basis axis must be non-zero.");
  }
  return { east: vector(value.east.x, value.east.y), south: vector(value.south.x, value.south.y) };
}

function inferProjection(plan: CompiledSpriteProductionPlan): NormalizedSpriteMotionTopologyOptions["projection"] {
  if (plan.directions.length <= 1) return "single-view";
  if (plan.aseprite.slices.some((slice) => slice.purpose === "tile-footprint")) return "isometric-2:1";
  const names = new Set(plan.directions.map((entry) => normalizeDirectionName(entry.name)));
  if (names.size <= 2 && [...names].every((name) => ["left", "right", "east", "west"].includes(name))) return "side";
  return "top-down";
}

function normalizeOptions(plan: CompiledSpriteProductionPlan, input: SpriteMotionTopologyOptions | undefined): NormalizedSpriteMotionTopologyOptions {
  const projection = input?.projection === undefined || input.projection === "auto" ? inferProjection(plan) : input.projection;
  const screenBasis = validateBasis(input?.screenBasis ?? defaultBasis(projection));
  return {
    projection,
    screenBasis,
    screenBasisSource: input?.screenBasis === undefined ? "projection-default" : "caller-supplied",
    strictDirectionLabels: input?.strictDirectionLabels ?? projection === "isometric-2:1",
    requireEightDirectionsForIsometric: input?.requireEightDirectionsForIsometric ?? true,
  };
}

function verifySourcePlan(plan: CompiledSpriteProductionPlan): void {
  if (plan.schemaVersion !== "1.0" || !plan.planId || !/^[a-f0-9]{64}$/.test(plan.planSha256)) {
    throw new SpritePlannerError("SPRITE_MOTION_SOURCE_PLAN_INVALID", "A complete compiled sprite production plan is required.");
  }
  const { planSha256, ...body } = plan;
  const calculated = spritePlanSha256(body);
  if (calculated !== planSha256) {
    throw new SpritePlannerError("SPRITE_MOTION_SOURCE_PLAN_HASH_MISMATCH", "The source sprite plan does not match its declared SHA-256.", { declared: planSha256, calculated });
  }
  if (new Set(plan.directions.map((entry) => entry.name)).size !== plan.directions.length) {
    throw new SpritePlannerError("SPRITE_MOTION_DIRECTION_DUPLICATE", "Direction names must be unique.");
  }
  if (new Set(plan.clips.map((entry) => entry.id)).size !== plan.clips.length) {
    throw new SpritePlannerError("SPRITE_MOTION_CLIP_DUPLICATE", "Clip identifiers must be unique.");
  }
  if (new Set(plan.frames.map((entry) => entry.id)).size !== plan.frames.length) {
    throw new SpritePlannerError("SPRITE_MOTION_FRAME_DUPLICATE", "Frame identifiers must be unique.");
  }
}

function nearestDirectionName(angle: number, candidates: readonly Readonly<{ name: string; angle: number }>[]): string | undefined {
  let best: Readonly<{ name: string; distance: number }> | undefined;
  for (const candidate of candidates) {
    const distance = Math.abs((((candidate.angle - angle) % 360) + 540) % 360 - 180);
    if (!best || distance < best.distance || (distance === best.distance && candidate.name.localeCompare(best.name) < 0)) best = { name: candidate.name, distance };
  }
  return best && best.distance <= 0.001 ? best.name : undefined;
}

function compileDirections(plan: CompiledSpriteProductionPlan, options: NormalizedSpriteMotionTopologyOptions): readonly SpriteDirectionGeometry[] {
  const directional = plan.directions.length > 1;
  const angles = plan.directions.map((entry) => {
    const explicit = explicitAngle(entry.name);
    if (explicit !== undefined) return { name: entry.name, angle: explicit, source: "explicit-label" as const };
    if (!directional || normalizeDirectionName(entry.name) === "default") return { name: entry.name, angle: undefined, source: "non-directional" as const };
    if (options.strictDirectionLabels) throw new SpritePlannerError("SPRITE_MOTION_DIRECTION_LABEL_UNKNOWN", `Direction ${entry.name} has no canonical compass angle.`);
    return { name: entry.name, angle: round((180 + entry.index * (360 / plan.directions.length)) % 360), source: "evenly-spaced-fallback" as const };
  });
  if (options.projection === "isometric-2:1" && options.requireEightDirectionsForIsometric && plan.directions.length !== 8) {
    throw new SpritePlannerError("SPRITE_MOTION_ISOMETRIC_DIRECTION_COUNT_INVALID", "Isometric 2:1 motion topology requires exactly eight runtime directions.");
  }
  const angular = angles.filter((entry): entry is Readonly<{ name: string; angle: number; source: "explicit-label" | "evenly-spaced-fallback" }> => entry.angle !== undefined);
  if (new Set(angular.map((entry) => entry.angle)).size !== angular.length) {
    throw new SpritePlannerError("SPRITE_MOTION_DIRECTION_ANGLE_DUPLICATE", "Directional labels must resolve to unique world angles.");
  }
  const step = angular.length > 1 ? 360 / angular.length : 0;
  return plan.directions.map((entry, index) => {
    const resolved = angles[index];
    if (!resolved) throw new SpritePlannerError("SPRITE_MOTION_DIRECTION_INDEX_INVALID", `Direction index ${index} could not be resolved.`);
    if (resolved.angle === undefined) {
      return {
        name: entry.name,
        index: entry.index,
        authored: entry.authored,
        angleSource: resolved.source,
        worldVector: vector(0, 0),
        screenVector: vector(0, 0),
        adjacentDirections: [],
        ...(entry.mirrorOf === undefined ? {} : { mirrorOf: entry.mirrorOf }),
      };
    }
    const clockwiseDirection = nearestDirectionName((resolved.angle + step) % 360, angular);
    const counterClockwiseDirection = nearestDirectionName((resolved.angle - step + 360) % 360, angular);
    const oppositeDirection = nearestDirectionName((resolved.angle + 180) % 360, angular);
    const world = worldVector(resolved.angle);
    const adjacentDirections = [counterClockwiseDirection, clockwiseDirection].filter((name): name is string => name !== undefined && name !== entry.name);
    return {
      name: entry.name,
      index: entry.index,
      authored: entry.authored,
      angleSource: resolved.source,
      worldAngleDegrees: resolved.angle,
      worldVector: world,
      screenVector: transformToScreen(world, options.screenBasis),
      ...(oppositeDirection === undefined ? {} : { oppositeDirection }),
      ...(clockwiseDirection === undefined ? {} : { clockwiseDirection }),
      ...(counterClockwiseDirection === undefined ? {} : { counterClockwiseDirection }),
      adjacentDirections,
      ...(entry.mirrorOf === undefined ? {} : { mirrorOf: entry.mirrorOf }),
    };
  });
}

function phaseTemplates(clip: SpritePlannedClip): readonly PhaseTemplate[] {
  if (clip.framesPerDirection <= 1) return SINGLE_PHASE;
  const id = clip.id.toLowerCase();
  if (/(jump|fall|land)/.test(id)) return PHASES.jump;
  if (/(walk|run|move|swim|fly|climb|crouch-walk|work-loop|particle-loop)/.test(id) || clip.category === "locomotion") return PHASES.locomotion;
  if (/(attack|cast|shoot|fire|reload|parry|block|dodge|interact|use-item|pickup|push|pull|special)/.test(id) || clip.category === "combat") return PHASES.attack;
  if (/(hit|hurt|stun|damaged|damage)/.test(id)) return PHASES.reaction;
  if (/(death|destroyed|broken|despawn|dissipate)/.test(id)) return PHASES.collapse;
  if (/(idle|blink|normal|hover|pressed|disabled|selected|focused|active-loop)/.test(id) || clip.loopMode !== "none") return PHASES.idle;
  if (/(spawn|activate|deactivate|open|close|turn|phase-transition|get-up|knockdown)/.test(id)) return PHASES.transition;
  return PHASES.generic;
}

function selectTemplates(frameCount: number, templates: readonly PhaseTemplate[]): readonly PhaseTemplate[] {
  if (frameCount >= templates.length) return templates;
  if (frameCount === 1) {
    const preferred = templates.find((entry) => ["impact", "action", "hold", "transition", "apex"].includes(entry.id)) ?? templates[Math.floor(templates.length / 2)];
    return preferred ? [preferred] : SINGLE_PHASE;
  }
  const indexes = new Set<number>();
  for (let index = 0; index < frameCount; index += 1) indexes.add(Math.round(index * (templates.length - 1) / (frameCount - 1)));
  return [...indexes].sort((left, right) => left - right).map((index) => templates[index]).filter((entry): entry is PhaseTemplate => entry !== undefined);
}

function allocatedCounts(frameCount: number, templates: readonly PhaseTemplate[]): readonly number[] {
  const counts = templates.map(() => 1);
  let remaining = frameCount - templates.length;
  if (remaining <= 0) return counts;
  const weightTotal = templates.reduce((sum, entry) => sum + entry.weight, 0);
  const shares = templates.map((entry, index) => {
    const raw = remaining * entry.weight / weightTotal;
    const whole = Math.floor(raw);
    counts[index] = (counts[index] ?? 1) + whole;
    return { index, fraction: raw - whole };
  });
  remaining -= shares.reduce((sum, entry) => sum + Math.floor((frameCount - templates.length) * templates[entry.index]!.weight / weightTotal), 0);
  shares.sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) {
    const target = shares[index % shares.length];
    if (target) counts[target.index] = (counts[target.index] ?? 1) + 1;
  }
  return counts;
}

function compileClipTopology(clip: SpritePlannedClip): SpriteClipMotionTopology {
  const templates = selectTemplates(clip.framesPerDirection, phaseTemplates(clip));
  const counts = allocatedCounts(clip.framesPerDirection, templates);
  let cursor = 0;
  const phases = templates.map((template, index): SpriteSemanticPhase => {
    const frameCount = counts[index] ?? 1;
    const startFrame = cursor;
    const endFrame = cursor + frameCount - 1;
    const keyPoseCandidates = clip.keyPoseFrames.filter((frame) => frame >= startFrame && frame <= endFrame);
    const midpoint = Math.floor((startFrame + endFrame) / 2);
    const keyFrame = keyPoseCandidates.sort((left, right) => Math.abs(left - midpoint) - Math.abs(right - midpoint) || left - right)[0] ?? midpoint;
    const durationMs = clip.frameDurationsMs.slice(startFrame, endFrame + 1).reduce((sum, duration) => sum + duration, 0);
    cursor = endFrame + 1;
    return {
      id: template.id,
      label: template.label,
      startFrame,
      endFrame,
      keyFrame,
      frameCount,
      durationMs,
      motionIntent: template.motionIntent,
      groundContact: template.groundContact,
    };
  });
  if (cursor !== clip.framesPerDirection) throw new SpritePlannerError("SPRITE_MOTION_PHASE_COVERAGE_INVALID", `Clip ${clip.id} phase coverage ends at ${cursor}, expected ${clip.framesPerDirection}.`);
  return {
    clipId: clip.id,
    category: clip.category,
    loopMode: clip.loopMode,
    framesPerDirection: clip.framesPerDirection,
    phases,
    phaseCoverageComplete: true,
    phaseDurationMs: phases.reduce((sum, phase) => sum + phase.durationMs, 0),
  };
}

function frameIdMap(plan: CompiledSpriteProductionPlan): ReadonlyMap<string, SpritePlannedFrame> {
  return new Map(plan.frames.map((frame) => [`${frame.clipId}\u0000${frame.direction}\u0000${frame.frameIndex}`, frame]));
}

function sameDirectionFrames(plan: CompiledSpriteProductionPlan, clipId: string, direction: string): readonly SpritePlannedFrame[] {
  return plan.frames.filter((frame) => frame.clipId === clipId && frame.direction === direction).sort((left, right) => left.frameIndex - right.frameIndex);
}

function framePhase(frame: SpritePlannedFrame, clipTopology: SpriteClipMotionTopology): SpriteSemanticPhase {
  const phase = clipTopology.phases.find((entry) => frame.frameIndex >= entry.startFrame && frame.frameIndex <= entry.endFrame);
  if (!phase) throw new SpritePlannerError("SPRITE_MOTION_FRAME_PHASE_MISSING", `Frame ${frame.id} is not covered by a semantic phase.`);
  return phase;
}

function continuityFrameId(frames: readonly SpritePlannedFrame[], index: number, delta: -1 | 1, loopMode: SpriteLoopMode): string | undefined {
  const target = index + delta;
  if (target >= 0 && target < frames.length) return frames[target]?.id;
  if (loopMode === "linear" && frames.length > 1) return delta === -1 ? frames.at(-1)?.id : frames[0]?.id;
  if (loopMode === "ping-pong" && frames.length > 1) return delta === -1 ? frames[1]?.id : frames.at(-2)?.id;
  return undefined;
}

function compileFrameBindings(
  plan: CompiledSpriteProductionPlan,
  directions: readonly SpriteDirectionGeometry[],
  clips: readonly SpriteClipMotionTopology[],
): readonly SpriteFrameContinuityBinding[] {
  const indexedFrames = frameIdMap(plan);
  const directionMap = new Map(directions.map((entry) => [entry.name, entry]));
  const clipMap = new Map(clips.map((entry) => [entry.clipId, entry]));
  const grouped = new Map<string, readonly SpritePlannedFrame[]>();
  for (const clip of plan.clips) for (const direction of clip.directionNames) grouped.set(`${clip.id}\u0000${direction}`, sameDirectionFrames(plan, clip.id, direction));
  return plan.frames.map((frame): SpriteFrameContinuityBinding => {
    const clipTopology = clipMap.get(frame.clipId);
    const sourceClip = plan.clips.find((entry) => entry.id === frame.clipId);
    const direction = directionMap.get(frame.direction);
    const frames = grouped.get(`${frame.clipId}\u0000${frame.direction}`);
    if (!clipTopology || !sourceClip || !direction || !frames) throw new SpritePlannerError("SPRITE_MOTION_BINDING_SOURCE_MISSING", `Frame ${frame.id} references an unknown clip or direction.`);
    const phase = framePhase(frame, clipTopology);
    const phaseProgress = phase.frameCount <= 1 ? 1 : round((frame.frameIndex - phase.startFrame) / (phase.frameCount - 1));
    const clockwiseDirectionFrameId = direction.clockwiseDirection === undefined ? undefined : indexedFrames.get(`${frame.clipId}\u0000${direction.clockwiseDirection}\u0000${frame.frameIndex}`)?.id;
    const counterClockwiseDirectionFrameId = direction.counterClockwiseDirection === undefined ? undefined : indexedFrames.get(`${frame.clipId}\u0000${direction.counterClockwiseDirection}\u0000${frame.frameIndex}`)?.id;
    const previousFrameId = continuityFrameId(frames, frame.frameIndex, -1, sourceClip.loopMode);
    const nextFrameId = continuityFrameId(frames, frame.frameIndex, 1, sourceClip.loopMode);
    const phaseKeyFrameId = indexedFrames.get(`${frame.clipId}\u0000${frame.direction}\u0000${phase.keyFrame}`)?.id;
    const canonicalReferenceIds = [
      `direction-master:${frame.sourceDirection}`,
      phaseKeyFrameId,
      previousFrameId,
      nextFrameId,
      clockwiseDirectionFrameId,
      counterClockwiseDirectionFrameId,
    ].filter((value): value is string => value !== undefined);
    return {
      frameId: frame.id,
      clipId: frame.clipId,
      direction: frame.direction,
      frameIndex: frame.frameIndex,
      phaseId: phase.id,
      phaseProgress,
      ...(previousFrameId === undefined ? {} : { previousFrameId }),
      ...(nextFrameId === undefined ? {} : { nextFrameId }),
      ...(clockwiseDirectionFrameId === undefined ? {} : { clockwiseDirectionFrameId }),
      ...(counterClockwiseDirectionFrameId === undefined ? {} : { counterClockwiseDirectionFrameId }),
      canonicalReferenceIds: [...new Set(canonicalReferenceIds)],
    };
  });
}

function gate(id: string, description: string, expected: number | string | boolean, actual: number | string | boolean, severity: "blocking" | "warning" = "blocking"): SpriteMotionTopologyGate {
  return { id, severity, description, expected, actual, passed: expected === actual };
}

function qualityGates(
  plan: CompiledSpriteProductionPlan,
  options: NormalizedSpriteMotionTopologyOptions,
  directions: readonly SpriteDirectionGeometry[],
  clips: readonly SpriteClipMotionTopology[],
  bindings: readonly SpriteFrameContinuityBinding[],
): readonly SpriteMotionTopologyGate[] {
  const isometricExpected = options.projection === "isometric-2:1" && options.requireEightDirectionsForIsometric ? 8 : directions.length;
  const phaseFrameCoverage = clips.reduce((sum, clip) => sum + clip.phases.reduce((phaseSum, phase) => phaseSum + phase.frameCount, 0) * (plan.clips.find((entry) => entry.id === clip.clipId)?.directionNames.length ?? 0), 0);
  const validFrameIds = new Set(plan.frames.map((entry) => entry.id));
  const continuityReferencesValid = bindings.every((binding) => [binding.previousFrameId, binding.nextFrameId, binding.clockwiseDirectionFrameId, binding.counterClockwiseDirectionFrameId].filter((value): value is string => value !== undefined).every((value) => validFrameIds.has(value)));
  return [
    gate("source-plan-hash-binding", "The topology is compiled only from the exact verified source plan.", plan.planSha256, plan.planSha256),
    gate("direction-geometry-coverage", "Every runtime direction has deterministic world and screen geometry.", plan.directions.length, directions.length),
    gate("isometric-direction-coverage", "Strict isometric 2:1 families retain eight runtime directions.", isometricExpected, directions.length),
    gate("semantic-phase-clip-coverage", "Every clip has a complete non-overlapping semantic phase topology.", plan.clips.length, clips.length),
    gate("semantic-phase-frame-coverage", "Semantic phases account for every clip, direction and frame index.", plan.frames.length, phaseFrameCoverage),
    gate("frame-continuity-coverage", "Every runtime frame has one continuity binding.", plan.frames.length, bindings.length),
    gate("continuity-reference-integrity", "All temporal and directional frame references resolve to the source plan.", true, continuityReferencesValid),
    gate("compile-only-authority", "Motion-topology compilation cannot call providers, mutate artwork, select, promote or publish.", true, true),
  ];
}

export function compileSpriteMotionTopology(
  plan: CompiledSpriteProductionPlan,
  input?: SpriteMotionTopologyOptions,
): CompiledSpriteMotionTopology {
  verifySourcePlan(plan);
  const options = normalizeOptions(plan, input);
  const directions = compileDirections(plan, options);
  const clips = plan.clips.map(compileClipTopology);
  const frameBindings = compileFrameBindings(plan, directions, clips);
  const gates = qualityGates(plan, options, directions, clips, frameBindings);
  const failed = gates.filter((entry) => entry.severity === "blocking" && !entry.passed);
  if (failed.length) throw new SpritePlannerError("SPRITE_MOTION_TOPOLOGY_GATE_FAILED", "Sprite motion topology failed one or more blocking gates.", failed);
  const warnings = [
    ...(directions.some((entry) => entry.angleSource === "evenly-spaced-fallback") ? ["One or more direction angles were inferred from stable direction order because their labels were not canonical compass names."] : []),
    ...(options.projection === "pre-rendered-2.5d" && options.screenBasisSource === "projection-default" ? ["Pre-rendered 2.5D uses a neutral screen basis unless the caller supplies the project camera basis."] : []),
    ...(plan.frames.length > 4_000 ? [`The topology binds ${plan.frames.length} runtime frames; provider execution should remain staged by clip category and direction.`] : []),
  ];
  const partial = {
    schemaVersion: "1.0" as const,
    protocolVersion: SPRITE_MOTION_TOPOLOGY_PROTOCOL_VERSION,
    sourcePlanId: plan.planId,
    sourcePlanSha256: plan.planSha256,
    options,
    directions,
    clips,
    frameBindings,
    qualityGates: gates,
    warnings,
    authority: {
      compileOnly: true as const,
      providerCalled: false as const,
      artworkMutated: false as const,
      candidateSelected: false as const,
      candidatePromoted: false as const,
      targetRepositoryMutated: false as const,
      publicationPerformed: false as const,
    },
  };
  return { ...partial, topologySha256: spritePlanSha256(partial) };
}

export function spriteMotionTopologyProtocolSummary(): Readonly<{
  protocolVersion: typeof SPRITE_MOTION_TOPOLOGY_PROTOCOL_VERSION;
  directionRules: readonly string[];
  animationRules: readonly string[];
  authorityRules: readonly string[];
}> {
  return {
    protocolVersion: SPRITE_MOTION_TOPOLOGY_PROTOCOL_VERSION,
    directionRules: [
      "World-space compass angles remain separate from screen-space projection vectors.",
      "Isometric 2:1 uses an explicit east/south screen basis and requires eight directions by default.",
      "Four-, eight- and sixteen-direction families receive deterministic opposite and adjacent direction bindings.",
      "Unknown labels fail closed under strict direction mode and otherwise use a recorded evenly-spaced fallback.",
    ],
    animationRules: [
      "Every clip receives complete, non-overlapping semantic phases rather than an unstructured frame count.",
      "Every frame binds its phase, temporal neighbours, directional neighbours and canonical direction master.",
      "Loop continuity is explicit for linear and ping-pong clips.",
      "Phase allocation is deterministic and preserves exact compiled frame durations.",
    ],
    authorityRules: [
      "The source plan is rehashed before topology compilation.",
      "Compilation is provider-free and cannot mutate artwork or a target repository.",
      "Selection, promotion, deployment and publication remain separate authorities.",
    ],
  };
}
