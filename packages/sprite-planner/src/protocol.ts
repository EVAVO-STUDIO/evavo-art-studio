import { SPRITE_CLIP_CATALOGUE } from "./catalogue.js";
import {
  SPRITE_COVERAGE_LEVELS,
  SPRITE_FIDELITY_LEVELS,
  SPRITE_GAMEPLAY_PROFILES,
  SPRITE_PLAN_ROLES,
  SPRITE_PLANNER_PROTOCOL_VERSION,
} from "./types.js";

export function spritePlannerProtocolSummary() {
  return {
    schemaVersion: "1.0" as const,
    protocolVersion: SPRITE_PLANNER_PROTOCOL_VERSION,
    purpose: "Compile the complete role-aware direction, animation, frame, layer, sheet, atlas and Godot inventory before any sprite provider work begins.",
    roles: SPRITE_PLAN_ROLES,
    gameplayProfiles: SPRITE_GAMEPLAY_PROFILES,
    coverageLevels: SPRITE_COVERAGE_LEVELS,
    fidelityLevels: SPRITE_FIDELITY_LEVELS,
    clipCatalogue: Object.values(SPRITE_CLIP_CATALOGUE).map((clip) => ({
      id: clip.id,
      category: clip.category,
      directionMode: clip.directionMode,
      loopMode: clip.loopMode,
      baseFrames: clip.baseFrames,
      framesPerSecond: clip.framesPerSecond,
      reason: clip.reason,
    })),
    directionRules: [
      "Isometric 2:1 character and creature families compile exactly eight ordered runtime directions.",
      "Isometric and equipment-heavy families author all eight direction masters by default.",
      "Mirrored directions are derived only when explicitly enabled, permitted by art direction, and the asset has no asymmetry, held item or swappable equipment.",
      "Every derived direction identifies one authored source direction and still receives a complete runtime frame and manifest entry.",
      "Front-only, horizontal and non-directional clips reduce the relevant clip matrix without changing the family direction contract.",
    ],
    coverageRules: [
      "Role and gameplay profiles infer the complete baseline clip inventory.",
      "Declared features add locomotion, combat, interaction, state, portrait, prop or particle clips deterministically.",
      "Core coverage keeps essential runtime states; complete coverage includes all declared gameplay capabilities; cinematic coverage adds authored transitions and performance states.",
      "Every clip has exact frame counts, millisecond durations, key poses, direction coverage and source paths.",
      "Custom clips require explicit frame and timing overrides and cannot appear as unbounded prompt prose.",
    ],
    sourceRules: [
      "Editable Aseprite or OpenRaster source, individual frames, layers, tags, slices, pivots and exact timing remain authoritative.",
      "Sprite sheets and texture atlases are deterministic derivatives and never the sole source.",
      "Aseprite linked cels and intentional holds remain explicit; duplicate merging is not automatic.",
      "Separate costume, equipment, weapon and palette variants prevent a Cartesian explosion of full flattened families.",
    ],
    godotRules: [
      "Godot SpriteFrames plans retain animation names, exact per-frame duration multipliers, loop flags and source paths.",
      "Isometric plans retain the exact Y-sort origin, ground pivot, 2:1 footprint and no-rotation atlas rule.",
      "Separate visible layers become synchronised sibling Sprite2D or AnimatedSprite2D nodes; collision and occlusion remain engine sidecars.",
      "Pixel art uses nearest filtering and integer placement, with centered=false or verified 2D pixel snapping when required.",
      "Particle flipbooks keep fixed cells and authored lifetime mapping rather than per-frame trimming.",
    ],
    executionBoundary: "Validation and planning are deterministic and provider-free. Identity masters, frame generation, mastering, family verification, selection, promotion and packaging remain separate governed stages.",
  };
}
