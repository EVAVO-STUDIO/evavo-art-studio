import {
  artDirectionSha256,
  compileArtDirectionContract,
  type CompiledArtDirectionContract,
} from "@evavo/art-direction";
import { createHash } from "node:crypto";

import {
  SPRITE_COVERAGE_LEVELS,
  SPRITE_FEATURES,
  SPRITE_FIDELITY_LEVELS,
  SPRITE_GAMEPLAY_PROFILES,
  SPRITE_PLAN_ROLES,
  SPRITE_PLANNER_PROTOCOL_VERSION,
  SpritePlannerError,
  type NormalizedSpritePlanCompileRequest,
  type SpriteFeature,
  type SpritePlanClipOverrideInput,
  type SpritePlanCompileRequestInput,
  type SpritePlanRole,
  type SpriteGameplayProfile,
} from "./types.js";
import { gameplayDefaultClipIds, roleDefaultClipIds } from "./catalogue.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const roleSet = new Set<string>(SPRITE_PLAN_ROLES);
const gameplaySet = new Set<string>(SPRITE_GAMEPLAY_PROFILES);
const coverageSet = new Set<string>(SPRITE_COVERAGE_LEVELS);
const fidelitySet = new Set<string>(SPRITE_FIDELITY_LEVELS);
const featureSet = new Set<string>(SPRITE_FEATURES);
const loopModes = new Set(["none", "linear", "ping-pong"]);
const sheetStrategies = new Set(["per-clip-layer-grid", "per-clip-composite-grid", "atlas-only", "individual-frames-only"]);

function fail(code: string, message: string, details?: unknown): never { throw new SpritePlannerError(code, message, details); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function record(value: unknown, name: string): Record<string, unknown> { if (!isRecord(value)) fail("SPRITE_PLAN_REQUEST_INVALID", `${name} must be an object.`); return value; }
function text(value: unknown, name: string, fallback?: string, maximum = 4096): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") fail("SPRITE_PLAN_REQUEST_INVALID", `${name} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0")) fail("SPRITE_PLAN_REQUEST_INVALID", `${name} must contain 1 to ${maximum} safe characters.`);
  return normalized;
}
function safeId(value: unknown, name: string): string { const normalized = text(value, name, undefined, 128); if (!SAFE_ID.test(normalized)) fail("SPRITE_PLAN_REQUEST_INVALID", `${name} must be a safe identifier.`); return normalized; }
function booleanValue(value: unknown, name: string, fallback: boolean): boolean { if (value === undefined) return fallback; if (typeof value !== "boolean") fail("SPRITE_PLAN_REQUEST_INVALID", `${name} must be a boolean.`); return value; }
function integer(value: unknown, name: string, fallback: number, minimum: number, maximum: number): number {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isInteger(resolved) || (resolved as number) < minimum || (resolved as number) > maximum) fail("SPRITE_PLAN_REQUEST_INVALID", `${name} must be an integer between ${minimum} and ${maximum}.`);
  return resolved as number;
}
function uniqueStrings(value: unknown, name: string, maximum: number): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum) fail("SPRITE_PLAN_REQUEST_INVALID", `${name} must contain no more than ${maximum} strings.`);
  const output = value.map((entry, index) => text(entry, `${name}[${index}]`, undefined, 128));
  if (new Set(output).size !== output.length) fail("SPRITE_PLAN_REQUEST_INVALID", `${name} must not contain duplicates.`);
  return output;
}
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
}
export function spritePlanSha256(value: unknown): string { return createHash("sha256").update(stable(value)).digest("hex"); }

function verifyCompiledArtDirection(value: unknown): CompiledArtDirectionContract {
  const contract = record(value, "artDirectionContract") as unknown as CompiledArtDirectionContract;
  if (contract.schemaVersion !== "1.0" || typeof contract.protocolVersion !== "string" || typeof contract.contractId !== "string" || !SAFE_ID.test(contract.contractId) || typeof contract.contractSha256 !== "string" || !SHA256.test(contract.contractSha256) || !isRecord(contract.project) || !isRecord(contract.style) || !isRecord(contract.asset) || !isRecord(contract.production) || !Array.isArray(contract.outputs)) {
    fail("SPRITE_PLAN_ART_DIRECTION_INVALID", "artDirectionContract is not a complete compiled art-direction contract.");
  }
  const { contractSha256, ...hashBody } = contract;
  const calculated = artDirectionSha256(hashBody);
  if (calculated !== contractSha256) fail("SPRITE_PLAN_ART_DIRECTION_HASH_MISMATCH", "The embedded art-direction contract does not match its declared SHA-256.", { declared: contractSha256, calculated });
  return contract;
}

function resolveArtDirection(root: Record<string, unknown>): CompiledArtDirectionContract {
  const hasRequest = root.artDirectionRequest !== undefined;
  const hasContract = root.artDirectionContract !== undefined;
  if (hasRequest === hasContract) fail("SPRITE_PLAN_ART_DIRECTION_REQUIRED", "Exactly one of artDirectionRequest or artDirectionContract is required.");
  if (hasRequest) {
    try { return compileArtDirectionContract(root.artDirectionRequest); }
    catch (error: unknown) { fail("SPRITE_PLAN_ART_DIRECTION_COMPILE_FAILED", error instanceof Error ? error.message : String(error)); }
  }
  return verifyCompiledArtDirection(root.artDirectionContract);
}

function roleCompatible(role: SpritePlanRole, contract: CompiledArtDirectionContract): void {
  const family = contract.asset.family;
  const animatedRoles = new Set<SpritePlanRole>(["playable-character", "npc", "enemy", "boss", "companion", "vehicle", "animated-prop", "particle-effect", "portrait-character"]);
  const allowed: Readonly<Record<SpritePlanRole, readonly string[]>> = {
    "playable-character": ["character", "creature"], npc: ["character", "creature"], enemy: ["character", "creature"], boss: ["character", "creature"], companion: ["character", "creature"],
    vehicle: ["prop", "creature", "character"], "animated-prop": ["prop", "environment", "tile", "decal"], "destructible-prop": ["prop", "environment", "tile", "decal"],
    "particle-effect": ["particle", "decal"], "ui-sprite": ["ui", "icon", "font"], "portrait-character": ["portrait", "character", "creature"],
  };
  if (!allowed[role].includes(family)) fail("SPRITE_PLAN_ROLE_INCOMPATIBLE", `${role} is not compatible with art-direction family ${family}.`);
  if (animatedRoles.has(role) && !contract.asset.animated) fail("SPRITE_PLAN_ANIMATION_REQUIRED", `${role} requires artDirectionContract.asset.animated=true.`);
}

function normalizeFeatures(role: SpritePlanRole, gameplayProfile: SpriteGameplayProfile, include: unknown, exclude: unknown): readonly SpriteFeature[] {
  const impliedByClips = new Set<string>([...roleDefaultClipIds(role), ...gameplayDefaultClipIds(gameplayProfile)]);
  const clipToFeature: Readonly<Record<string, SpriteFeature | undefined>> = {
    walk: "walk", run: "run", turn: "turn", "crouch-idle": "crouch", "crouch-walk": "crouch", "jump-start": "jump", "jump-loop": "jump", fall: "jump", land: "jump", climb: "climb", swim: "swim", fly: "fly",
    "attack-light": "melee", "attack-heavy": "heavy-melee", "attack-ranged": "ranged", aim: "aim", reload: "reload", block: "block", parry: "parry", dodge: "dodge", cast: "cast",
    interact: "interact", "use-item": "use-item", pickup: "pickup", push: "push-pull", pull: "push-pull", talk: "talk", gesture: "gesture", "work-loop": "work-loop",
    alert: "alert", "hit-react": "hit-react", stun: "stun", knockdown: "knockdown", "get-up": "knockdown", death: "death", spawn: "spawn", despawn: "despawn", "phase-transition": "phase-transition", special: "special",
    open: "open-close", close: "open-close", activate: "activate", "active-loop": "activate", deactivate: "activate", damaged: "damage-states", broken: "damage-states", damage: "damage-states", destroyed: "damage-states",
    hover: "hover-press", pressed: "hover-press", disabled: "hover-press", selected: "hover-press", focused: "hover-press", "emote-positive": "portrait-emotes", "emote-negative": "portrait-emotes", "portrait-hurt": "portrait-emotes",
    "particle-loop": "particle-loop", "particle-impact": "particle-impact", "particle-trail": "particle-trail",
  };
  const features = new Set<SpriteFeature>();
  for (const clipId of impliedByClips) { const feature = clipToFeature[clipId]; if (feature) features.add(feature); }
  const included = uniqueStrings(include, "includeFeatures", 64);
  const excluded = uniqueStrings(exclude, "excludeFeatures", 64);
  for (const entry of [...included, ...excluded]) if (!featureSet.has(entry)) fail("SPRITE_PLAN_REQUEST_INVALID", `Unsupported sprite feature ${entry}.`);
  for (const entry of included) features.add(entry as SpriteFeature);
  for (const entry of excluded) features.delete(entry as SpriteFeature);
  return [...features].sort();
}

function normalizeClipOverrides(value: unknown): readonly SpritePlanClipOverrideInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128) fail("SPRITE_PLAN_REQUEST_INVALID", "clipOverrides must contain no more than 128 entries.");
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const item = record(entry, `clipOverrides[${index}]`);
    const clipId = safeId(item.id, `clipOverrides[${index}].id`);
    if (ids.has(clipId)) fail("SPRITE_PLAN_REQUEST_INVALID", `Duplicate clip override ${clipId}.`);
    ids.add(clipId);
    const loopMode = item.loopMode === undefined ? undefined : text(item.loopMode, `clipOverrides[${index}].loopMode`, undefined, 32);
    if (loopMode !== undefined && !loopModes.has(loopMode)) fail("SPRITE_PLAN_REQUEST_INVALID", `clipOverrides[${index}].loopMode is unsupported.`);
    const directionNames = item.directionNames === undefined ? undefined : uniqueStrings(item.directionNames, `clipOverrides[${index}].directionNames`, 32);
    const keyPoseFrames = item.keyPoseFrames === undefined ? undefined : (() => {
      if (!Array.isArray(item.keyPoseFrames) || item.keyPoseFrames.length > 64) fail("SPRITE_PLAN_REQUEST_INVALID", `clipOverrides[${index}].keyPoseFrames is invalid.`);
      const output = item.keyPoseFrames.map((frame, frameIndex) => integer(frame, `clipOverrides[${index}].keyPoseFrames[${frameIndex}]`, 0, 0, 4095));
      if (new Set(output).size !== output.length) fail("SPRITE_PLAN_REQUEST_INVALID", `clipOverrides[${index}].keyPoseFrames contains duplicates.`);
      return output.sort((left, right) => left - right);
    })();
    return {
      id: clipId,
      ...(item.include === undefined ? {} : { include: booleanValue(item.include, `clipOverrides[${index}].include`, true) }),
      ...(item.framesPerDirection === undefined ? {} : { framesPerDirection: integer(item.framesPerDirection, `clipOverrides[${index}].framesPerDirection`, 1, 1, 4096) }),
      ...(item.framesPerSecond === undefined ? {} : (() => { if (typeof item.framesPerSecond !== "number" || !Number.isFinite(item.framesPerSecond) || item.framesPerSecond <= 0 || item.framesPerSecond > 240) fail("SPRITE_PLAN_REQUEST_INVALID", `clipOverrides[${index}].framesPerSecond must be greater than 0 and at most 240.`); return { framesPerSecond: item.framesPerSecond }; })()),
      ...(loopMode === undefined ? {} : { loopMode: loopMode as "none" | "linear" | "ping-pong" }),
      ...(directionNames === undefined ? {} : { directionNames }),
      ...(keyPoseFrames === undefined ? {} : { keyPoseFrames }),
      ...(item.reason === undefined ? {} : { reason: text(item.reason, `clipOverrides[${index}].reason`, undefined, 2048) }),
    };
  });
}

export function validateSpritePlanCompileRequest(input: SpritePlanCompileRequestInput | unknown): NormalizedSpritePlanCompileRequest {
  const root = record(input, "request");
  if (root.schemaVersion !== "1.0") fail("SPRITE_PLAN_REQUEST_INVALID", 'schemaVersion must be "1.0".');
  const planId = safeId(root.planId, "planId");
  if (typeof root.role !== "string" || !roleSet.has(root.role)) fail("SPRITE_PLAN_REQUEST_INVALID", "role is unsupported.");
  if (typeof root.gameplayProfile !== "string" || !gameplaySet.has(root.gameplayProfile)) fail("SPRITE_PLAN_REQUEST_INVALID", "gameplayProfile is unsupported.");
  const role = root.role as SpritePlanRole;
  const gameplayProfile = root.gameplayProfile as SpriteGameplayProfile;
  const artDirectionContract = resolveArtDirection(root);
  roleCompatible(role, artDirectionContract);
  const coverage = root.coverage === undefined ? "complete" : root.coverage;
  if (typeof coverage !== "string" || !coverageSet.has(coverage)) fail("SPRITE_PLAN_REQUEST_INVALID", "coverage is unsupported.");
  const fidelity = root.fidelity === undefined ? "premium" : root.fidelity;
  if (typeof fidelity !== "string" || !fidelitySet.has(fidelity)) fail("SPRITE_PLAN_REQUEST_INVALID", "fidelity is unsupported.");
  const artifactId = root.artDirectionContractArtifactId === undefined ? undefined : text(root.artDirectionContractArtifactId, "artDirectionContractArtifactId", undefined, 80);
  if (artifactId !== undefined && !ARTIFACT_ID.test(artifactId)) fail("SPRITE_PLAN_REQUEST_INVALID", "artDirectionContractArtifactId must use artifact_<sha256> format.");
  const variantsInput = root.variants === undefined ? {} : record(root.variants, "variants");
  const outputInput = root.output === undefined ? {} : record(root.output, "output");
  const sheetStrategy = outputInput.sheetStrategy === undefined ? "per-clip-layer-grid" : outputInput.sheetStrategy;
  if (typeof sheetStrategy !== "string" || !sheetStrategies.has(sheetStrategy)) fail("SPRITE_PLAN_REQUEST_INVALID", "output.sheetStrategy is unsupported.");
  return {
    schemaVersion: "1.0", protocolVersion: SPRITE_PLANNER_PROTOCOL_VERSION, planId, artDirectionContract,
    ...(artifactId === undefined ? {} : { artDirectionContractArtifactId: artifactId }),
    role, gameplayProfile, coverage: coverage as "core" | "complete" | "cinematic", fidelity: fidelity as "economical" | "standard" | "premium",
    features: normalizeFeatures(role, gameplayProfile, root.includeFeatures, root.excludeFeatures),
    allowDerivedMirrors: booleanValue(root.allowDerivedMirrors, "allowDerivedMirrors", false),
    variants: {
      costumeVariants: integer(variantsInput.costumeVariants, "variants.costumeVariants", 1, 1, 128),
      equipmentVariants: integer(variantsInput.equipmentVariants, "variants.equipmentVariants", 1, 1, 128),
      weaponVariants: integer(variantsInput.weaponVariants, "variants.weaponVariants", 1, 1, 128),
      teamColourVariants: integer(variantsInput.teamColourVariants, "variants.teamColourVariants", 1, 1, 128),
      damageVariants: integer(variantsInput.damageVariants, "variants.damageVariants", 1, 1, 32),
    },
    clipOverrides: normalizeClipOverrides(root.clipOverrides),
    output: {
      sheetStrategy: sheetStrategy as NormalizedSpritePlanCompileRequest["output"]["sheetStrategy"],
      maximumSheetSize: integer(outputInput.maximumSheetSize, "output.maximumSheetSize", 4096, 256, 16384),
      includeAsepriteExport: booleanValue(outputInput.includeAsepriteExport, "output.includeAsepriteExport", true),
      includePerClipSheets: booleanValue(outputInput.includePerClipSheets, "output.includePerClipSheets", true),
      includeFamilyAtlas: booleanValue(outputInput.includeFamilyAtlas, "output.includeFamilyAtlas", true),
      includeGodotResources: booleanValue(outputInput.includeGodotResources, "output.includeGodotResources", artDirectionContract.outputs.some((entry) => entry.target === "godot-4.6.2")),
    },
    ...(root.metadata === undefined ? {} : { metadata: root.metadata }),
  };
}

export function spritePlanRequestSha256(request: NormalizedSpritePlanCompileRequest): string { return spritePlanSha256(request); }
