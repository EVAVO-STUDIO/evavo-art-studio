import {
  DELIVERY_TARGETS, MATERIAL_WORKFLOWS, REQUIRED_TEXTURE_ROLES, RIG_TYPES,
  STYLE_FAMILIES, TOPOLOGY, boolean, canonicalJson, exact, fail, finite, id, text,
} from "./asset-fabricator-reference-common.mjs";

export function normalizeArtDirection(value) {
  exact(value, ["styleFamily", "styleDescription", "silhouette", "palette", "detailStrategy", "avoid"], "artDirection");
  if (!STYLE_FAMILIES.has(value.styleFamily)) fail("artDirection:style-family");
  if (!Array.isArray(value.palette) || value.palette.length > 16 || value.palette.some((item) => typeof item !== "string")) fail("artDirection:palette");
  if (!Array.isArray(value.avoid) || value.avoid.some((item) => typeof item !== "string")) fail("artDirection:avoid");
  return {
    styleFamily: value.styleFamily,
    styleDescription: text(value.styleDescription, "artDirection.styleDescription"),
    silhouette: text(value.silhouette, "artDirection.silhouette"),
    palette: [...value.palette],
    detailStrategy: text(value.detailStrategy, "artDirection.detailStrategy"),
    avoid: [...value.avoid],
  };
}
export function normalizeGeometry(value) {
  exact(value, [
    "topologyStrategy", "targetTriangles", "maximumTriangles", "watertightRequired",
    "manifoldRequired", "maximumComponents", "minimumThicknessMetres", "symmetry",
    "hardSurface", "subdivisionReady",
  ], "geometryIntent");
  if (!TOPOLOGY.has(value.topologyStrategy)) fail("geometryIntent:topology-strategy");
  const targetTriangles = finite(value.targetTriangles, "geometryIntent.targetTriangles", { minimum: 1 });
  const maximumTriangles = finite(value.maximumTriangles, "geometryIntent.maximumTriangles", { minimum: 1 });
  const maximumComponents = finite(value.maximumComponents, "geometryIntent.maximumComponents", { minimum: 1 });
  if (!Number.isInteger(targetTriangles) || !Number.isInteger(maximumTriangles) || !Number.isInteger(maximumComponents) || targetTriangles > maximumTriangles) fail("geometryIntent:budget");
  return {
    topologyStrategy: value.topologyStrategy, targetTriangles, maximumTriangles,
    watertightRequired: boolean(value.watertightRequired, "geometryIntent.watertightRequired"),
    manifoldRequired: boolean(value.manifoldRequired, "geometryIntent.manifoldRequired"),
    maximumComponents,
    minimumThicknessMetres: finite(value.minimumThicknessMetres, "geometryIntent.minimumThicknessMetres", { minimum: 0 }),
    symmetry: boolean(value.symmetry, "geometryIntent.symmetry"),
    hardSurface: boolean(value.hardSurface, "geometryIntent.hardSurface"),
    subdivisionReady: boolean(value.subdivisionReady, "geometryIntent.subdivisionReady"),
  };
}
export function normalizeMaterial(value) {
  exact(value, ["workflow", "graphId", "textureResolution", "requiredChannels", "channelPacking", "delightRequired", "bakeRequired"], "materialIntent");
  if (!MATERIAL_WORKFLOWS.has(value.workflow)) fail("materialIntent:workflow");
  id(value.graphId, "materialIntent.graphId");
  if (![256, 512, 1024, 2048, 4096, 8192].includes(value.textureResolution)) fail("materialIntent:texture-resolution");
  if (!Array.isArray(value.requiredChannels) || new Set(value.requiredChannels).size !== value.requiredChannels.length) fail("materialIntent:required-channels");
  for (const role of REQUIRED_TEXTURE_ROLES) if (!value.requiredChannels.includes(role)) fail(`materialIntent:missing-${role}`);
  exact(value.channelPacking, ["r", "g", "b", "a"], "materialIntent.channelPacking");
  if (canonicalJson(value.channelPacking) !== canonicalJson({ r: "ao", g: "roughness", b: "metalness", a: "mask" })) fail("materialIntent:packing");
  return {
    workflow: value.workflow, graphId: value.graphId, textureResolution: value.textureResolution,
    normalConvention: "opengl", requiredChannels: [...value.requiredChannels],
    channelPacking: { r: "ao", g: "roughness", b: "metalness", a: "mask" },
    delightRequired: boolean(value.delightRequired, "materialIntent.delightRequired"),
    bakeRequired: boolean(value.bakeRequired, "materialIntent.bakeRequired"),
  };
}
export function normalizeRigging(value) {
  exact(value, ["type", "required", "maximumBones", "maximumInfluences", "blendshapes", "animations"], "riggingIntent");
  if (!RIG_TYPES.has(value.type)) fail("riggingIntent:type");
  const required = boolean(value.required, "riggingIntent.required");
  const maximumBones = finite(value.maximumBones, "riggingIntent.maximumBones", { minimum: 0 });
  const maximumInfluences = finite(value.maximumInfluences, "riggingIntent.maximumInfluences", { minimum: 0 });
  if (!Number.isInteger(maximumBones) || !Number.isInteger(maximumInfluences) || (required && value.type === "none")) fail("riggingIntent:limits");
  for (const field of ["blendshapes", "animations"]) if (!Array.isArray(value[field]) || value[field].some((item) => typeof item !== "string" || !item)) fail(`riggingIntent:${field}`);
  return { type: value.type, required, maximumBones, maximumInfluences, blendshapes: [...value.blendshapes], animations: [...value.animations] };
}
export function normalizeDelivery(value) {
  exact(value, ["targets", "format", "meshCompression", "textureCompression", "embedTextures", "generateManifest"], "deliveryIntent");
  if (!Array.isArray(value.targets) || value.targets.length < 1 || new Set(value.targets).size !== value.targets.length || value.targets.some((item) => !DELIVERY_TARGETS.has(item))) fail("deliveryIntent:targets");
  if (!["glb", "gltf", "blend", "fbx", "obj", "usd", "usdz"].includes(value.format)) fail("deliveryIntent:format");
  if (!["none", "meshopt", "draco"].includes(value.meshCompression)) fail("deliveryIntent:mesh-compression");
  if (!["none", "png", "jpeg", "webp", "ktx2-etc1s", "ktx2-uastc"].includes(value.textureCompression)) fail("deliveryIntent:texture-compression");
  return {
    targets: [...value.targets], format: value.format,
    meshCompression: value.meshCompression, textureCompression: value.textureCompression,
    embedTextures: boolean(value.embedTextures, "deliveryIntent.embedTextures"),
    generateManifest: boolean(value.generateManifest, "deliveryIntent.generateManifest"),
  };
}
