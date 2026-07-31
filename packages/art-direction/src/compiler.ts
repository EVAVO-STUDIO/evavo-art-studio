import { compileProductionGrammar } from "./grammar.js";
import { resolveArtDirectionOutputProfile } from "./output-profiles.js";
import { resolveArtDirectionPreset } from "./presets.js";
import { artDirectionSha256, validateArtDirectionCompileRequest } from "./validation.js";
import {
  ART_DIRECTION_PROTOCOL_VERSION,
  type ArtDirectionCompileRequestInput,
  type CompiledArtDirectionContract,
  type CompiledArtDirectionGate,
  type NormalizedArtDirectionCompileRequest,
} from "./types.js";

function gate(id: string, severity: "blocking" | "warning", description: string, evidence: readonly string[], threshold?: number | string | boolean): CompiledArtDirectionGate {
  return { id, severity, description, evidence, ...(threshold === undefined ? {} : { threshold }) };
}

function qualityGates(request: NormalizedArtDirectionCompileRequest, production: ReturnType<typeof compileProductionGrammar>): readonly CompiledArtDirectionGate[] {
  const { style, asset } = request;
  const gates: CompiledArtDirectionGate[] = [
    gate("style-envelope-lock", "blocking", "Rendering mode, projection, camera, palette, lighting, line and material language must match the compiled style bible.", ["compiled style contract", "candidate evidence", "approved reference comparisons"], true),
    gate("anti-generic-art", "blocking", "The result must contain the required project-specific motifs and none of the prohibited generic or unrequested content.", ["motif inventory", "shot ownership", "review findings"], true),
    gate("complete-shot-bounds", "blocking", "The full requested silhouette, motion arc and declared layer extents must remain inside the canvas safety margin.", ["decoded alpha bounds", "safe padding", "crop overlay"], production.shot.safePaddingPixels),
    gate("real-transparency", "blocking", "Transparent delivery must contain a decoded alpha channel and reject baked checkerboards, flat mattes, halos and unrelated hidden RGB.", ["decoded frame QA", "hostile matte proof", "alpha statistics"], asset.transparency !== "opaque"),
    gate("layer-ownership", "blocking", "Visible colour, identity layers and engine sidecars must match the compiled ownership plan without duplication or contamination.", ["layer manifest", "reconstructed composite", "source parity"], true),
    gate("identity-and-proportion-lock", "blocking", "Identity, body proportions, costume construction, materials, defining marks, equipment scale and handedness must remain stable.", ["canonical identity comparison", "silhouette comparison", "equipment evidence"], true),
    gate("camera-and-light-rig", "blocking", "Projection, camera and lighting must remain fixed across every related asset and frame unless the contract explicitly permits authored variation.", ["camera manifest", "light manifest", "family comparisons"], true),
  ];
  if (style.pixelGrid.enabled) {
    gates.push(
      gate("pixel-cluster-coherence", "blocking", "Pixel clusters, staircase contours, palette ramps and selective outlines must be deliberate; accidental antialiasing and random single-pixel noise are rejected.", ["palette histogram", "cluster analysis", "edge map", "manual proof view"], true),
      gate("pixel-art-banding-and-pillow-shading", "warning", "Banding, pillow shading, tangent clusters and noisy dithering must be absent unless explicitly authored as part of the style.", ["cluster diagnostics", "lighting comparison", "review findings"], false),
      gate("integer-grid-registration", "blocking", "Frames, pivots and runtime placement remain on the declared integer pixel grid without half-pixel deformation.", ["frame geometry", "pivot manifest", "engine import proof"], true),
    );
  }
  if (style.projection === "isometric-2:1") {
    gates.push(
      gate("isometric-2-to-1-projection", "blocking", "Every tile, sprite footprint and direction master must follow one fixed 2:1 isometric projection.", ["tile width and height", "diamond guide", "direction overlays"], "2:1"),
      gate("isometric-footprint-and-y-sort", "blocking", "Feet, cast shadow, collision footprint and Y-sort origin must agree for every direction and frame.", ["pivot and Y-sort manifest", "tile footprint", "ground-contact overlay"], true),
    );
  }
  if (style.renderingMode === "pre-rendered-2.5d") {
    gates.push(gate("render-rig-lock", "blocking", "Model, skeleton, materials, camera, focal or orthographic settings, light rig, render settings and reduction pipeline must be identical across the family.", ["render-scene hash", "rig hash", "camera and lighting manifest", "render settings"], true));
  }
  if (asset.animated) {
    gates.push(
      gate("exact-frame-timing", "blocking", "Every frame retains its authored duration and direction/tag ownership; timing may not be flattened to an approximate global rate.", ["frame manifest", "duration list", "SpriteFrames proof"], true),
      gate("adjacent-frame-continuity", "blocking", "Neighbouring frames must preserve identity, palette, anchors, layer registration and motion intent.", ["adjacent comparisons", "onion-skin overlay", "anchor drift"], style.motion.maximumAnchorDriftPixels),
      gate("loop-closure", asset.loop ? "blocking" : "warning", "Looping animations must close without silhouette, anchor, palette or effect discontinuity.", ["last-to-first comparison", "loop preview", "duration proof"], asset.loop),
    );
  }
  if (style.antiGeneric.requireHistoricalPlausibility) gates.push(gate("historical-plausibility", "blocking", "Clothing, architecture, tools, weapons, typography and materials must match the declared place and era and exclude modern intrusions.", ["historical reference set", "object inventory", "review findings"], true));
  for (const outputId of request.outputProfileIds) gates.push(gate(`output-profile:${outputId}`, "blocking", `Delivery must satisfy every master, derivative, metadata, filtering, atlas and source-retention rule in ${outputId}.`, ["output profile", "delivery manifest", "artifact hashes", "import proof"], true));
  return gates;
}

function provider(request: NormalizedArtDirectionCompileRequest, production: ReturnType<typeof compileProductionGrammar>): CompiledArtDirectionContract["provider"] {
  const { style, asset } = request;
  const separated = production.layers.filter((layer) => layer.role !== "identity-core" && layer.treatment !== "baked" && layer.contributesToColour).map((layer) => layer.role);
  const immutableLocks = [
    `rendering mode: ${style.renderingMode}`, `projection: ${style.projection}`,
    `camera: yaw ${style.camera.yawDegrees}, pitch ${style.camera.pitchDegrees}, roll ${style.camera.rollDegrees}, orthographic scale ${style.camera.orthographicScale}`,
    `palette mode and budget: ${style.palette.mode}, maximum ${style.palette.maxColours} colours`,
    `pixel policy: antialias ${style.pixelGrid.antialias}, subpixel motion ${style.pixelGrid.subpixelMotion}, outline ${style.pixelGrid.outline}`,
    `lighting: key ${style.lighting.keyDirectionDegrees} degrees, elevation ${style.lighting.keyElevationDegrees} degrees, shadow ${style.lighting.shadowDirectionDegrees} degrees`,
    `pivot and baseline: ${production.pivot.x},${production.pivot.y}`,
    "identity, proportions, costume construction, materials, handedness and approved distinctive motifs",
  ];
  const permittedChanges = ["the explicitly requested pose, frame action or authorised layer content", "authored secondary motion that remains inside the shot and layer contract", "local surface detail only when it follows the palette, line and material language"];
  const prohibitedChanges = [
    "independent redesign of identity, costume, equipment, camera, light rig or palette",
    "creation of a complete sprite sheet, contact sheet, comparison grid or multi-panel image",
    "invention of props, characters, scenery, labels, logos, watermarks or readable text",
    "baking collision, normal, depth, guide or tile-mask information into visible colour pixels",
    ...separated.map((role) => `baking separately owned ${role} content into this unit`),
    ...style.antiGeneric.prohibitedGenericMotifs, ...style.mustAvoid,
  ];
  const orderedInstructions = [
    "Candidate status: this output is an unapproved intermediate and never a final deliverable.",
    `Unit of work: create exactly ${production.frameUnit === "single-layer" ? "one registered sprite layer for one frame" : production.frameUnit === "single-frame" ? "one complete sprite frame" : production.frameUnit === "single-static" ? "one static asset" : production.frameUnit === "tile" ? "one tile or declared tile variant" : "one cinematic frame"}.`,
    `Project and asset: ${request.project.title}; ${asset.assetId}; ${asset.family}; ${asset.purpose}.`,
    `Style: ${style.title}. ${style.intent}`,
    `Era and medium: ${style.era}; ${style.renderingMode}; ${style.projection}.`,
    `Canvas: ${asset.dimensions.width}x${asset.dimensions.height}; transparency ${asset.transparency}; safe padding ${production.shot.safePaddingPixels}px.`,
    `Shot include: ${production.shot.include.join("; ")}.`,
    `Shot exclude: ${production.shot.exclude.join("; ")}.`,
    `Framing: ${production.shot.framing.join("; ")}.`,
    `Required style traits: ${[...style.mustHave, ...style.antiGeneric.requiredDistinctiveMotifs].join("; ") || "follow the compiled style bible"}.`,
    `Line and material language: ${[...style.lineTreatment, ...style.materialLanguage].join("; ") || "follow the canonical approved references"}.`,
    `Direction set: ${asset.directionNames.join(", ")}; the work order names exactly one direction.`,
    "Continuity: use canonical identity, direction master and neighbouring approved key poses; later frames may not be unrelated text-only generations.",
    "Self-check: prove dimensions, silhouette, real transparency or declared matte, layer ownership, palette, anchor, camera and lighting before returning the candidate.",
  ];
  return {
    unitOfWork: production.frameUnit === "single-layer" ? "one-layer" : production.frameUnit === "single-frame" ? "one-frame" : production.frameUnit === "single-static" ? "one-static-asset" : production.frameUnit === "tile" ? "one-tile" : "one-cinematic-frame",
    orderedInstructions, immutableLocks, permittedChanges, prohibitedChanges,
  };
}

function delivery(request: NormalizedArtDirectionCompileRequest, production: ReturnType<typeof compileProductionGrammar>, outputs: CompiledArtDirectionContract["outputs"]): CompiledArtDirectionContract["delivery"] {
  const sourceOfTruth = new Set<string>([
    "compiled art-direction contract", "approved references and rights manifest", "individual lossless frame sequence",
    "editable layered source", "exact timing, pivots, baselines and direction tags", "quality and provenance evidence",
  ]);
  for (const output of outputs) for (const item of output.sourceRetention) sourceOfTruth.add(item);
  const godot = outputs.some((entry) => entry.target === "godot-4.6.2") ? {
    engineVersion: "4.6.2" as const,
    nodeRecommendations: [
      request.asset.animated ? "AnimatedSprite2D with retained SpriteFrames" : "Sprite2D or TextureRect according to asset family",
      ...(request.style.projection === "isometric-2:1" ? ["Sibling TileMapLayer and sprite nodes under a Y-sorted parent"] : []),
      ...(request.style.renderingMode === "pre-rendered-2.5d" ? ["SpriteFrames billboard with bound normal, depth or emission sidecars where declared"] : []),
    ],
    projectSettings: [
      ...(request.style.pixelGrid.enabled ? ["nearest texture filtering", "integer placement", "centered=false or 2D pixel snap to avoid half-pixel deformation"] : ["profile-defined texture filtering"]),
      ...(request.style.projection === "isometric-2:1" ? ["2:1 isometric TileSet shape", "Y-sort enabled on the shared world parent", `Y-sort origin ${production.ySortOrigin.x},${production.ySortOrigin.y}`] : []),
    ],
    resourceOutputs: outputs.flatMap((output) => output.engineMetadata),
  } : undefined;
  return {
    sourceOfTruth: [...sourceOfTruth],
    namingPattern: `${request.project.projectId}/${request.asset.assetId}/{variant}/{direction}/{frame-or-layer}`,
    folderStructure: [
      `art/${request.asset.assetId}/source`, `art/${request.asset.assetId}/frames`, `art/${request.asset.assetId}/layers`,
      `art/${request.asset.assetId}/manifests`, `art/${request.asset.assetId}/evidence`, `art/${request.asset.assetId}/generated`,
    ],
    metadataSidecars: ["art-direction.json", "frame-manifest.json", "layer-manifest.json", "output-profile.json", "provenance.json", "qa-evidence.json"],
    ...(godot ? { godot } : {}),
  };
}

export function compileArtDirectionContract(input: ArtDirectionCompileRequestInput | unknown): CompiledArtDirectionContract {
  const request = validateArtDirectionCompileRequest(input);
  const requestSha256 = artDirectionSha256(request);
  const production = compileProductionGrammar(request);
  const outputs = request.outputProfileIds.map(resolveArtDirectionOutputProfile);
  const preset = request.presetId ? resolveArtDirectionPreset(request.presetId) : undefined;
  const partial = {
    schemaVersion: "1.0" as const, protocolVersion: ART_DIRECTION_PROTOCOL_VERSION,
    contractId: request.contractId, requestSha256,
    preset: { ...(preset ? { id: preset.id } : {}), title: preset?.title ?? request.style.title, lockedFields: preset?.lockedFields ?? [] },
    project: request.project, style: request.style, asset: request.asset, production,
    provider: provider(request, production), outputs, qualityGates: qualityGates(request, production),
    delivery: delivery(request, production, outputs),
    warnings: [
      ...(request.style.references.some((entry) => !entry.rights) ? ["One or more references has no explicit rights note; release remains blocked until rights are recorded."] : []),
      ...(request.asset.animated && !request.style.references.some((entry) => entry.role === "identity") ? ["Animated identity work has no bound identity reference and requires review before provider execution."] : []),
      ...(request.style.antiGeneric.requireHistoricalPlausibility && !request.style.references.some((entry) => entry.role === "historical") ? ["Historical plausibility is required but no historical reference is bound."] : []),
    ],
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  const contractSha256 = artDirectionSha256(partial);
  return { ...partial, contractSha256 };
}
