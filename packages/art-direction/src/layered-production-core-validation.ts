import type { LayeredProductionIntent, LayeredProductionRequestInput } from "./layered-production-types.js";
import { LAYERED_PRODUCTION_REQUEST_KIND } from "./layered-production-types.js";
import {
  HEX_COLOUR_PATTERN,
  exactKeys,
  fail,
  freeze,
  idValue,
  integerValue,
  literalTrue,
  numberValue,
  record,
  relativePath,
  stringValue,
  strings,
} from "./layered-production-internal.js";

export interface NormalizedLayeredProductionCore {
  readonly input: Record<string, unknown>;
  readonly intent: LayeredProductionIntent;
  readonly project: LayeredProductionRequestInput["project"];
  readonly canvas: LayeredProductionRequestInput["canvas"];
  readonly style: LayeredProductionRequestInput["style"];
}

export function normalizeLayeredProductionCore(
  inputValue: unknown,
): NormalizedLayeredProductionCore {
  const input = record(inputValue, "request");
  exactKeys(input, "request", ["schemaVersion", "kind", "planId", "revision", "intent", "project", "canvas", "style", "sourcePolicy", "styleProof", "layers", "metadata"]);
  if (input.schemaVersion !== "1.0") fail("LAYERED_PRODUCTION_INPUT_INVALID", "request.schemaVersion must equal 1.0.");
  if (input.kind !== LAYERED_PRODUCTION_REQUEST_KIND) fail("LAYERED_PRODUCTION_INPUT_INVALID", `request.kind must equal ${LAYERED_PRODUCTION_REQUEST_KIND}.`);
  const intent = stringValue(input.intent, "request.intent", 30) as LayeredProductionIntent;
  if (intent !== "style-proof" && intent !== "runtime-source") fail("LAYERED_PRODUCTION_INTENT_INVALID", "request.intent must be style-proof or runtime-source; concept images use a different workflow.");
  const projectInput = record(input.project, "request.project");
  exactKeys(projectInput, "request.project", ["projectId", "title", "gameId", "gameTitle", "targetRepository", "engine", "engineVersion", "runtimeRoot"]);
  const project = freeze({
    projectId: idValue(projectInput.projectId, "request.project.projectId"),
    title: stringValue(projectInput.title, "request.project.title", 300),
    gameId: idValue(projectInput.gameId, "request.project.gameId"),
    gameTitle: stringValue(projectInput.gameTitle, "request.project.gameTitle", 300),
    targetRepository: stringValue(projectInput.targetRepository, "request.project.targetRepository", 300),
    engine: stringValue(projectInput.engine, "request.project.engine", 100),
    engineVersion: stringValue(projectInput.engineVersion, "request.project.engineVersion", 100),
    runtimeRoot: relativePath(projectInput.runtimeRoot, "request.project.runtimeRoot"),
  });
  const canvasInput = record(input.canvas, "request.canvas");
  exactKeys(canvasInput, "request.canvas", ["width", "height", "worldWidth", "worldHeight", "coordinateSystem", "pixelAspect", "presentationScale", "filtering"]);
  const canvas = freeze({
    width: integerValue(canvasInput.width, "request.canvas.width", 1, 8192),
    height: integerValue(canvasInput.height, "request.canvas.height", 1, 8192),
    worldWidth: integerValue(canvasInput.worldWidth, "request.canvas.worldWidth", 1, 32768),
    worldHeight: integerValue(canvasInput.worldHeight, "request.canvas.worldHeight", 1, 32768),
    coordinateSystem: canvasInput.coordinateSystem as "top-left-integer",
    pixelAspect: canvasInput.pixelAspect as "square" | "dos-vga-4:3-corrected",
    presentationScale: integerValue(canvasInput.presentationScale, "request.canvas.presentationScale", 1, 16),
    filtering: canvasInput.filtering as "nearest",
  });
  if (canvas.coordinateSystem !== "top-left-integer" || canvas.filtering !== "nearest" || !new Set(["square", "dos-vga-4:3-corrected"]).has(canvas.pixelAspect)) {
    fail("LAYERED_PRODUCTION_CANVAS_INVALID", "The canvas must use top-left integer coordinates, nearest filtering and a supported pixel aspect policy.");
  }
  if (canvas.worldWidth < canvas.width || canvas.worldHeight < canvas.height) fail("LAYERED_PRODUCTION_CANVAS_INVALID", "World dimensions must contain the source canvas.");

  const styleInput = record(input.style, "request.style");
  exactKeys(styleInput, "request.style", ["styleId", "title", "authoredEra", "renderingMode", "projection", "camera", "lighting", "palette", "pixelGrammar", "materialVocabulary", "lineRules", "compositionRules", "distinctiveMotifs", "forbiddenModernTraits", "forbiddenGenericTraits", "references"]);
  const cameraInput = record(styleInput.camera, "request.style.camera");
  exactKeys(cameraInput, "request.style.camera", ["fixed", "yawDegrees", "pitchDegrees", "rollDegrees", "orthographicScale"]);
  const lightingInput = record(styleInput.lighting, "request.style.lighting");
  exactKeys(lightingInput, "request.style.lighting", ["fixed", "keyDirectionDegrees", "keyElevationDegrees", "shadowDirectionDegrees", "frameVariation"]);
  const paletteInput = record(styleInput.palette, "request.style.palette");
  exactKeys(paletteInput, "request.style.palette", ["mode", "maximumSceneColours", "maximumLocalColours", "preserveIndices", "colours"]);
  const pixelInput = record(styleInput.pixelGrammar, "request.style.pixelGrammar");
  exactKeys(pixelInput, "request.style.pixelGrammar", ["deliberateClusters", "fixedPixelDensity", "antialias", "subpixelMotion", "gradientPolicy", "textureNoise", "dithering", "outline"]);
  const sceneColours = integerValue(paletteInput.maximumSceneColours, "request.style.palette.maximumSceneColours", 2, 256);
  const localColours = integerValue(paletteInput.maximumLocalColours, "request.style.palette.maximumLocalColours", 2, sceneColours);
  const colours = paletteInput.colours === undefined ? undefined : strings(paletteInput.colours, "request.style.palette.colours", 2, 256, 20).map((colour, index) => {
    if (!HEX_COLOUR_PATTERN.test(colour)) fail("LAYERED_PRODUCTION_STYLE_INVALID", `request.style.palette.colours[${index}] must be a hex colour.`);
    return colour.toUpperCase();
  });
  if (colours && colours.length > sceneColours) fail("LAYERED_PRODUCTION_STYLE_INVALID", "The explicit palette exceeds maximumSceneColours.");
  const renderingMode = stringValue(styleInput.renderingMode, "request.style.renderingMode", 40);
  if (!new Set(["pixel-art", "indexed-raster", "isometric-pixel"]).has(renderingMode)) fail("LAYERED_PRODUCTION_STYLE_INVALID", "Unsupported rendering mode.");
  const projection = stringValue(styleInput.projection, "request.style.projection", 40);
  if (!new Set(["front", "side", "top-down", "three-quarter", "isometric-2:1", "dimetric"]).has(projection)) fail("LAYERED_PRODUCTION_STYLE_INVALID", "Unsupported projection.");
  const paletteMode = stringValue(paletteInput.mode, "request.style.palette.mode", 20);
  if (paletteMode !== "indexed" && paletteMode !== "rgb") fail("LAYERED_PRODUCTION_STYLE_INVALID", "Unsupported palette mode.");
  const dithering = stringValue(pixelInput.dithering, "request.style.pixelGrammar.dithering", 20);
  if (!new Set(["none", "manual", "ordered", "patterned"]).has(dithering)) fail("LAYERED_PRODUCTION_STYLE_INVALID", "Unsupported dithering policy.");
  const outline = stringValue(pixelInput.outline, "request.style.pixelGrammar.outline", 30);
  if (!new Set(["single-colour", "selective", "coloured", "none"]).has(outline)) fail("LAYERED_PRODUCTION_STYLE_INVALID", "Unsupported outline policy.");
  const gradientPolicy = stringValue(pixelInput.gradientPolicy, "request.style.pixelGrammar.gradientPolicy", 30);
  if (gradientPolicy !== "forbidden" && gradientPolicy !== "stepped-only") fail("LAYERED_PRODUCTION_STYLE_INVALID", "Unsupported gradient policy.");
  if (cameraInput.fixed !== true || lightingInput.fixed !== true || lightingInput.frameVariation !== "forbidden") fail("LAYERED_PRODUCTION_STYLE_INVALID", "Camera and lighting must be fixed for a production layer family.");
  if (pixelInput.deliberateClusters !== true || pixelInput.fixedPixelDensity !== true || pixelInput.antialias !== "none" || pixelInput.subpixelMotion !== "forbidden" || pixelInput.textureNoise !== "forbidden") {
    fail("LAYERED_PRODUCTION_STYLE_INVALID", "Production pixel grammar must lock deliberate clusters, fixed density, no antialiasing, no subpixel motion and no texture noise.");
  }
  const references = styleInput.references === undefined ? [] : (() => {
    if (!Array.isArray(styleInput.references) || styleInput.references.length > 32) fail("LAYERED_PRODUCTION_STYLE_INVALID", "request.style.references must be an array of at most 32 entries.");
    return styleInput.references.map((entry, index) => {
      const reference = record(entry, `request.style.references[${index}]`);
      exactKeys(reference, `request.style.references[${index}]`, ["id", "role", "uri", "rights", "note"]);
      const role = stringValue(reference.role, `request.style.references[${index}].role`, 30);
      if (!new Set(["identity", "palette", "camera", "material", "composition", "historical"]).has(role)) fail("LAYERED_PRODUCTION_STYLE_INVALID", `request.style.references[${index}].role is unsupported.`);
      return freeze({
        id: idValue(reference.id, `request.style.references[${index}].id`),
        role: role as "identity" | "palette" | "camera" | "material" | "composition" | "historical",
        uri: stringValue(reference.uri, `request.style.references[${index}].uri`, 1000),
        rights: stringValue(reference.rights, `request.style.references[${index}].rights`, 500),
        note: stringValue(reference.note, `request.style.references[${index}].note`, 1000),
      });
    });
  })();
  const style = freeze({
    styleId: idValue(styleInput.styleId, "request.style.styleId"),
    title: stringValue(styleInput.title, "request.style.title", 300),
    authoredEra: stringValue(styleInput.authoredEra, "request.style.authoredEra", 300),
    renderingMode: renderingMode as "pixel-art" | "indexed-raster" | "isometric-pixel",
    projection: projection as "front" | "side" | "top-down" | "three-quarter" | "isometric-2:1" | "dimetric",
    camera: freeze({
      fixed: true as const,
      yawDegrees: numberValue(cameraInput.yawDegrees, "request.style.camera.yawDegrees", -360, 360),
      pitchDegrees: numberValue(cameraInput.pitchDegrees, "request.style.camera.pitchDegrees", -90, 90),
      rollDegrees: numberValue(cameraInput.rollDegrees, "request.style.camera.rollDegrees", -360, 360),
      orthographicScale: numberValue(cameraInput.orthographicScale, "request.style.camera.orthographicScale", 0.01, 10000),
    }),
    lighting: freeze({
      fixed: true as const,
      keyDirectionDegrees: numberValue(lightingInput.keyDirectionDegrees, "request.style.lighting.keyDirectionDegrees", -360, 360),
      keyElevationDegrees: numberValue(lightingInput.keyElevationDegrees, "request.style.lighting.keyElevationDegrees", -90, 90),
      shadowDirectionDegrees: numberValue(lightingInput.shadowDirectionDegrees, "request.style.lighting.shadowDirectionDegrees", -360, 360),
      frameVariation: "forbidden" as const,
    }),
    palette: freeze({
      mode: paletteMode as "indexed" | "rgb",
      maximumSceneColours: sceneColours,
      maximumLocalColours: localColours,
      preserveIndices: literalTrue(paletteInput.preserveIndices, "request.style.palette.preserveIndices"),
      ...(colours ? { colours } : {}),
    }),
    pixelGrammar: freeze({
      deliberateClusters: true as const,
      fixedPixelDensity: true as const,
      antialias: "none" as const,
      subpixelMotion: "forbidden" as const,
      gradientPolicy: gradientPolicy as "forbidden" | "stepped-only",
      textureNoise: "forbidden" as const,
      dithering: dithering as "none" | "manual" | "ordered" | "patterned",
      outline: outline as "single-colour" | "selective" | "coloured" | "none",
    }),
    materialVocabulary: strings(styleInput.materialVocabulary, "request.style.materialVocabulary", 3),
    lineRules: strings(styleInput.lineRules, "request.style.lineRules", 3),
    compositionRules: strings(styleInput.compositionRules, "request.style.compositionRules", 3),
    distinctiveMotifs: strings(styleInput.distinctiveMotifs, "request.style.distinctiveMotifs", 3),
    forbiddenModernTraits: strings(styleInput.forbiddenModernTraits, "request.style.forbiddenModernTraits", 6),
    forbiddenGenericTraits: strings(styleInput.forbiddenGenericTraits, "request.style.forbiddenGenericTraits", 4),
    ...(references.length ? { references } : {}),
  });


  return Object.freeze({ input, intent, project, canvas, style });
}
