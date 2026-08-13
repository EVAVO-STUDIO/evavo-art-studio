import type { LayeredProductionLayerRole } from "./layered-production-types.js";
import type { CanonicalUnitLock, RoleRecipe } from "./jonez-source-art-recipe-types.js";
import { JONEZ_GROUND_BASE_RECIPE, JONEZ_ROUTE_BASE_RECIPE } from "./jonez-source-art-recipe-ground-route.js";
import { JONEZ_ARCHITECTURE_BACK_RECIPE, JONEZ_DESTINATION_STRUCTURE_RECIPE } from "./jonez-source-art-recipe-architecture-destination.js";
import { JONEZ_PLAYER_CHARACTER_RECIPE, JONEZ_AMBIENT_EFFECT_RECIPE } from "./jonez-source-art-recipe-player-ambient.js";
import {
  JONEZ_CROWD_CHARACTER_RECIPE,
  JONEZ_WORLD_PROP_RECIPE,
  JONEZ_FOREGROUND_OCCLUSION_RECIPE,
  JONEZ_ROUTE_HIGHLIGHT_RECIPE,
  JONEZ_UI_RECIPE,
} from "./jonez-source-art-recipe-supporting.js";

export type { CanonicalUnitLock, RoleRecipe } from "./jonez-source-art-recipe-types.js";

export const CANONICAL_PALETTE = [
  "#101018", "#263248", "#4B5D72", "#8B6A4D", "#C49A65", "#E1C68A",
  "#295A46", "#4E8A57", "#32739A", "#6A4C93", "#B54D4D", "#E3A646",
] as const;

export const CANONICAL_PROOF_UNITS = [
  "ground-base", "route-base", "architecture-back", "cafe-building",
  "player-idle-se", "fountain-f001",
] as const;

export const CANONICAL_UNIT_LOCKS: Readonly<Record<string, CanonicalUnitLock>> = {
  "ground-base": { role: "ground-base", kind: "full-canvas-layer", alpha: "opaque", width: 320, height: 200 },
  "route-base": { role: "route-base", kind: "full-canvas-layer", alpha: "transparent", width: 320, height: 200 },
  "architecture-back": { role: "architecture-back", kind: "full-canvas-layer", alpha: "transparent", width: 320, height: 200 },
  "cafe-building": { role: "destination-structure", kind: "sprite", alpha: "transparent", width: 96, height: 80 },
  "player-idle-se": { role: "player-character", kind: "animation-frame", alpha: "transparent", width: 24, height: 36 },
  "player-walk-se-f001": { role: "player-character", kind: "animation-frame", alpha: "transparent", width: 24, height: 36 },
  "fountain-f001": { role: "ambient-effect", kind: "animation-frame", alpha: "transparent", width: 32, height: 32 },
};

export const ROLE_RECIPES: Readonly<Partial<Record<LayeredProductionLayerRole, RoleRecipe>>> = {
  "ground-base": JONEZ_GROUND_BASE_RECIPE,
  "route-base": JONEZ_ROUTE_BASE_RECIPE,
  "architecture-back": JONEZ_ARCHITECTURE_BACK_RECIPE,
  "destination-structure": JONEZ_DESTINATION_STRUCTURE_RECIPE,
  "player-character": JONEZ_PLAYER_CHARACTER_RECIPE,
  "ambient-effect": JONEZ_AMBIENT_EFFECT_RECIPE,
  "crowd-character": JONEZ_CROWD_CHARACTER_RECIPE,
  "world-prop": JONEZ_WORLD_PROP_RECIPE,
  "foreground-occlusion": JONEZ_FOREGROUND_OCCLUSION_RECIPE,
  "route-highlight": JONEZ_ROUTE_HIGHLIGHT_RECIPE,
  ui: JONEZ_UI_RECIPE,
};

export const COMMON_NEGATIVE_TERMS = [
  "generic AI pixel city", "mobile-game isometric kit", "procedural pixel noise",
  "random detail confetti", "smooth vector geometry", "anti-aliasing",
  "subpixel detail", "soft alpha fringe", "gradient shading", "bloom",
  "ambient-occlusion fog", "PBR gloss", "painterly texture",
  "red-and-white striped search character", "recognisable Waldo-like costume",
  "copied Jones in the Fast Lane building or interface",
  "readable generated signage", "pseudo-lettering", "concept screenshot",
  "presentation sheet",
] as const;
