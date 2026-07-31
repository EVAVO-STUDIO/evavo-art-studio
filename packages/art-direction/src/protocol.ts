import { listArtDirectionOutputProfiles } from "./output-profiles.js";
import { listArtDirectionPresets } from "./presets.js";
import { ART_DIRECTION_PROTOCOL_VERSION } from "./types.js";

export function artDirectionProtocolSummary() {
  return {
    schemaVersion: "1.0" as const,
    protocolVersion: ART_DIRECTION_PROTOCOL_VERSION,
    purpose:
      "Compile a project-specific style bible, sprite-shot grammar, layer ownership plan, QA contract and delivery profile before any provider or media worker creates art.",
    presets: listArtDirectionPresets().map((preset) => ({
      id: preset.id,
      title: preset.title,
      description: preset.description,
      compatibleFamilies: preset.compatibleFamilies,
      lockedFields: preset.lockedFields,
      defaultDirections: preset.defaultDirections,
      defaultOutputProfileIds: preset.defaultOutputProfileIds,
    })),
    outputProfiles: listArtDirectionOutputProfiles().map((profile) => ({
      id: profile.id,
      title: profile.title,
      target: profile.target,
      compatibleFamilies: profile.compatibleFamilies,
      requiresTransparency: profile.requiresTransparency,
      textureFiltering: profile.textureFiltering,
      atlas: profile.atlas,
    })),
    layerDecisionRules: [
      "Separate a component when it needs independent reuse, pivot, timing, collision, blend, material, occlusion, repair or runtime variation.",
      "Bake a component when separation would create visible seams, invent hidden art, break intentional pixel clusters or make anatomy and cloth move mechanically.",
      "Identity anatomy and large deformation remain authored cels unless a reviewed high-resolution rig is explicitly justified.",
      "Collision, normal, depth, emission, tile masks and guides never enter visible colour pixels.",
      "Shadows remain separate for isometric, world-lit or independently placed assets.",
      "A provider receives one bounded frame, layer, tile, static asset or cinematic frame; never an authority to design a whole sheet or family.",
    ],
    historicalRules: [
      "A 1990s preset locks medium, projection, pixel or render-rig behaviour rather than merely adding retro keywords.",
      "Historical plausibility requires a specific era or a bound historical reference and rejects modern intrusions.",
      "Named commercial games and living artists are not used as style shortcuts; presets describe production methods, constraints and visual grammar.",
    ],
    godotRules: [
      "Godot 4.6.2 pixel sprites retain individual frames, exact durations, pivots and SpriteFrames metadata.",
      "Pixel-derived AnimatedSprite2D output avoids half-pixel placement through centered=false or 2D pixel snapping.",
      "Isometric TileSet output preserves a 2:1 grid, tile origin, Y-sort ownership and untrimmed tile cells.",
      "Particle flipbooks keep fixed cell dimensions and authored duration rather than trimming every effect frame.",
      "Atlas packing forbids rotation, preserves transparent padding and retains source trim offsets.",
    ],
    executionBoundary:
      "Protocol, validation and compilation are deterministic and provider-free. Provider candidates, media mastering, family verification, selection and promotion remain separate governed stages.",
  };
}
