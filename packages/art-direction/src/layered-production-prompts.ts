import type {
  CompiledLayeredProductionUnit,
  LayeredProductionAlphaPolicy,
  LayeredProductionLayerInput,
  LayeredProductionLayerRole,
  LayeredProductionRequestInput,
  LayeredProductionUnitInput,
  LayeredProviderAssetKind,
  LayeredProviderContinuityPhase,
  LayeredProviderReferenceRole,
} from "./layered-production-types.js";
import { freeze } from "./layered-production-internal.js";
import { projectSourceArtCalibration } from "./jonez-source-art-calibration.js";

function alphaInstruction(alpha: LayeredProductionAlphaPolicy): string {
  if (alpha === "opaque") return "Fill the complete canvas deliberately. No alpha holes and no accidental transparency.";
  if (alpha === "transparent") return "Use true RGBA transparency. Alpha must be exactly zero outside owned pixels; no checkerboard, matte, halo, fringe or hidden unrelated RGB.";
  return "Use mixed alpha only where this layer contract requires it. Exterior pixels remain true transparent RGBA; authored surfaces remain deliberately opaque.";
}

function providerAssetKind(
  layer: LayeredProductionLayerInput,
  unit: LayeredProductionUnitInput,
): LayeredProviderAssetKind {
  if (layer.role === "ambient-effect") return "effect";
  if (layer.role === "ui" || layer.role === "route-highlight") return "ui";
  if (unit.kind === "animation-frame") return "sprite-frame";
  if (
    unit.kind === "sprite" &&
    (layer.role === "player-character" || layer.role === "crowd-character")
  ) return "sprite-layer";
  return "environment";
}

function providerContinuityPhase(
  request: LayeredProductionRequestInput,
  layer: LayeredProductionLayerInput,
  unit: LayeredProductionUnitInput,
  assetKind: LayeredProviderAssetKind,
): Readonly<{
  phase: LayeredProviderContinuityPhase;
  requiredReferenceRoles: readonly LayeredProviderReferenceRole[];
}> {
  if (assetKind !== "sprite-frame" && assetKind !== "sprite-layer") {
    return freeze({ phase: "independent" as const, requiredReferenceRoles: [] });
  }
  const related = request.layers
    .flatMap((entry) => entry.units)
    .filter((entry) => entry.continuityKey === unit.continuityKey);
  const first = related[0];
  if (first?.id === unit.id) {
    return freeze({ phase: "identity-master" as const, requiredReferenceRoles: [] });
  }
  return freeze({
    phase: "key-pose" as const,
    requiredReferenceRoles: ["canonical-identity" as const],
  });
}

export function providerContractForUnit(
  request: LayeredProductionRequestInput,
  layer: LayeredProductionLayerInput,
  unit: LayeredProductionUnitInput,
) {
  const assetKind = providerAssetKind(layer, unit);
  const continuity = providerContinuityPhase(request, layer, unit, assetKind);
  return freeze({
    assetKind,
    continuityPhase: continuity.phase,
    requiredReferenceRoles: continuity.requiredReferenceRoles,
  });
}

export function providerPrompt(
  request: LayeredProductionRequestInput,
  layer: LayeredProductionLayerInput,
  unit: LayeredProductionUnitInput,
  allLayerRoles: readonly LayeredProductionLayerRole[],
): Readonly<{ prompt: string; negativePrompt: string }> {
  const otherRoles = allLayerRoles.filter((role) => role !== layer.role);
  const calibration = projectSourceArtCalibration(request, unit.id);
  const frameText = unit.frame
    ? `Animation: ${unit.frame.clipId}, frame ${unit.frame.frameNumber} of ${unit.frame.frameCount}, ${unit.frame.framesPerSecond} FPS, ${unit.frame.loop ? "looping" : "one-shot"}; exact pose: ${unit.frame.pose}.`
    : "Static source unit; do not invent additional states or frames.";
  const prompt = [
    "RUNTIME SOURCE UNIT — NOT CONCEPT ART, NOT A SCREENSHOT, NOT A PRESENTATION SHEET.",
    `Create exactly one PNG for ${request.project.gameTitle}: ${unit.id}. Return one image only.`,
    `Exclusive layer ownership: ${layer.id} (${layer.role}). This image may contain only content owned by that layer role.`,
    `Purpose: ${unit.purpose}`,
    `Include: ${[...layer.include, ...unit.include].join("; ")}.`,
    `Exclude from this source: ${[...layer.exclude, ...unit.exclude, ...otherRoles.map((role) => `all ${role} layer content`)].join("; ")}.`,
    `Canvas: ${unit.dimensions.width}x${unit.dimensions.height} native pixels. ${alphaInstruction(layer.alpha)}`,
    `Style identity: ${request.style.title}; ${request.style.authoredEra}; ${request.style.renderingMode}; ${request.style.projection}.`,
    `Camera lock: fixed yaw ${request.style.camera.yawDegrees}, pitch ${request.style.camera.pitchDegrees}, roll ${request.style.camera.rollDegrees}, orthographic scale ${request.style.camera.orthographicScale}.`,
    `Lighting lock: fixed key ${request.style.lighting.keyDirectionDegrees} degrees at elevation ${request.style.lighting.keyElevationDegrees}; shadow direction ${request.style.lighting.shadowDirectionDegrees}; no frame-to-frame variation.`,
    `Palette: ${request.style.palette.mode}, maximum ${request.style.palette.maximumLocalColours} local colours and ${request.style.palette.maximumSceneColours} scene colours; preserve palette indices.`,
    `Pixel grammar: deliberate clusters, fixed pixel density, antialias none, subpixel motion forbidden, gradients ${request.style.pixelGrammar.gradientPolicy}, texture noise forbidden, dithering ${request.style.pixelGrammar.dithering}, outline ${request.style.pixelGrammar.outline}.`,
    ...(calibration
      ? [
          `Project-specific calibration identity: ${calibration.calibrationSha256}.`,
          calibration.provider.promptAddendum,
        ]
      : []),
    `Distinctive motifs: ${request.style.distinctiveMotifs.join("; ")}.`,
    `Materials: ${request.style.materialVocabulary.join("; ")}.`,
    `Line rules: ${request.style.lineRules.join("; ")}.`,
    `Composition rules: ${request.style.compositionRules.join("; ")}.`,
    frameText,
    `Continuity key: ${unit.continuityKey}. Match approved neighbouring units, palette ramps, scale, camera, light and pixel density; never restart the style from a generic text-only interpretation.`,
    "Generated readable text is forbidden. Signs, labels and screens must be blank or use deliberate non-readable abstract marks for later live text or authored typography.",
    "Do not combine this unit with any other asset. Do not draw a complete scene. Do not create a concept sheet, moodboard, sprite sheet, contact sheet, grid, collage, storyboard, comparison panel, label or watermark.",
    "Candidate status only. Human review and explicit approval are required before composition, atlas assembly, Godot integration or promotion.",
  ].join("\n\n");
  const negativePrompt = [
    "complete scene",
    "game screenshot",
    "concept art",
    "concept sheet",
    "moodboard",
    "sprite sheet",
    "contact sheet",
    "grid",
    "collage",
    "storyboard",
    "multi-panel",
    "labels",
    "readable generated text",
    "watermark",
    "modern glossy indie pixel art",
    "soft gradient shading",
    "cinematic bloom",
    "volumetric lighting",
    "airbrushed edges",
    "AI microtexture noise",
    "inconsistent pixel density",
    "anti-aliased contours",
    "subpixel detail",
    ...(calibration?.provider.negativeTerms ?? []),
    ...request.style.forbiddenModernTraits,
    ...request.style.forbiddenGenericTraits,
    ...layer.exclude,
    ...unit.exclude,
    ...otherRoles.map((role) => `${role} content`),
  ].join(", ");
  return { prompt, negativePrompt };
}

export function reviewPlan(unit: LayeredProductionUnitInput, layer: LayeredProductionLayerInput): CompiledLayeredProductionUnit["review"] {
  const views = [
    "1x-native-isolated",
    "2x-nearest-isolated",
    layer.alpha === "opaque" ? "opaque-canvas-coverage" : "black-white-checkerboard-alpha-proof",
    "palette-histogram-and-unexpected-colour-proof",
    "pixel-cluster-and-edge-map",
    "composite-with-approved-lower-layers-only",
  ];
  if (unit.kind === "animation-frame") views.push("neighbour-flicker-and-onion-skin");
  const gates = [
    "exact dimensions and file identity",
    "exclusive layer ownership with no contamination",
    "no sheet, collage, grid, concept presentation, label, watermark or pseudo-text",
    "fixed camera, projection, palette, lighting and pixel density",
    "no antialiasing, soft gradients, bloom or random microtexture",
    layer.alpha === "opaque" ? "complete intentional opaque coverage" : "true alpha with no matte halo or hidden unrelated RGB",
    "distinctive project motifs present and generic motifs absent",
    "human approval recorded for this exact source hash",
  ];
  if (unit.pivot) gates.push("pivot and silhouette bounds match the manifest");
  if (unit.ySortOrigin) gates.push("ground contact and Y-sort origin match the manifest");
  if (unit.kind === "animation-frame") gates.push("identity, anchor and pose continuity with neighbouring approved frames");
  return freeze({
    approvalRequired: true as const,
    requiredViews: views,
    blockingGates: gates,
    compareAgainst: [unit.continuityKey, "approved style proof", "approved adjacent layer composite"],
    candidateOnly: true as const,
  });
}
