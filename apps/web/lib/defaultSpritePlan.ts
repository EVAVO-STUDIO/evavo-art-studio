import type { SpritePlanCompileRequestInput } from "@evavo/art-sprite-planner";

import { DEFAULT_ART_DIRECTION_REQUEST } from "./defaultArtDirection";

export const DEFAULT_SPRITE_PLAN_REQUEST = {
  schemaVersion: "1.0",
  planId: "brass-brine-deckhand-complete-family",
  artDirectionRequest: {
    ...DEFAULT_ART_DIRECTION_REQUEST,
    contractId: "brass-brine-deckhand-family-direction",
    asset: {
      ...DEFAULT_ART_DIRECTION_REQUEST.asset,
      assetId: "deckhand",
      purpose:
        "Complete eight-direction playable deckhand sprite family with locomotion, combat, interaction, damage and performance states.",
      hasHeldItems: true,
    },
  },
  role: "playable-character",
  gameplayProfile: "action-rpg",
  coverage: "complete",
  fidelity: "premium",
  includeFeatures: [
    "jump",
    "ranged",
    "aim",
    "reload",
    "parry",
    "talk",
    "gesture",
    "pickup",
    "spawn",
    "despawn",
  ],
  allowDerivedMirrors: false,
  variants: {
    costumeVariants: 3,
    equipmentVariants: 2,
    weaponVariants: 4,
    teamColourVariants: 4,
    damageVariants: 2,
  },
  clipOverrides: [
    {
      id: "idle",
      framesPerDirection: 8,
      framesPerSecond: 7,
      loopMode: "linear",
      keyPoseFrames: [0, 4, 7],
      reason:
        "Longer premium idle with restrained breathing, coat and equipment settling.",
    },
    {
      id: "walk",
      framesPerDirection: 8,
      framesPerSecond: 9,
      loopMode: "linear",
      keyPoseFrames: [0, 2, 4, 6, 7],
      reason:
        "Eight-frame contact, down, passing and up gait with an explicit loop endpoint review.",
    },
    {
      id: "ship-rigging-swing",
      include: true,
      framesPerDirection: 12,
      framesPerSecond: 12,
      loopMode: "none",
      keyPoseFrames: [0, 4, 8, 11],
      reason:
        "Project-specific traversal action for swinging between ship rigging lines.",
    },
  ],
  output: {
    sheetStrategy: "per-clip-layer-grid",
    maximumSheetSize: 4096,
    includeAsepriteExport: true,
    includePerClipSheets: true,
    includeFamilyAtlas: true,
    includeGodotResources: true,
  },
  metadata: {
    owner: "EVAVO Studio",
    releaseIntent: "Complete gameplay sprite source and Godot delivery family",
  },
} as const satisfies SpritePlanCompileRequestInput;
