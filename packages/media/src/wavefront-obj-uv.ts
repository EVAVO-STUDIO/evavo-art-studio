import { reviewUvLayout, type UvLayoutReviewEvidence, type UvLayoutReviewSpec, type UvPoint, type Position3, type UvTriangle } from "./uv-layout-review.js";

export const WAVEFRONT_OBJ_UV_CONTRACT = "evavo.wavefront-obj-uv.v1" as const;

export interface WavefrontObjUvExtraction {
  readonly contract: typeof WAVEFRONT_OBJ_UV_CONTRACT;
  readonly vertexCount: number;
  readonly textureCoordinateCount: number;
  readonly faceCount: number;
  readonly polygonFaceCount: number;
  readonly triangleCount: number;
  readonly skippedFacesWithoutUv: number;
  readonly objectNames: readonly string[];
  readonly groupNames: readonly string[];
  readonly materialNames: readonly string[];
  readonly triangles: readonly UvTriangle[];
}

export interface WavefrontObjUvReviewSpec extends UvLayoutReviewSpec {
  /** Apply v := 1-v before review without changing the source text. */
  readonly flipVForReview?: boolean;
}

export interface WavefrontObjUvReviewResult {
  readonly extraction: WavefrontObjUvExtraction;
  readonly review: UvLayoutReviewEvidence;
  readonly sourceModified: false;
}

type FaceRef = Readonly<{ vertexIndex: number; uvIndex: number | null }>;

function parseFinite(raw: string, label: string, lineNumber: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`OBJ line ${lineNumber}: ${label} must be finite.`);
  return value;
}

function parseInteger(raw: string, label: string, lineNumber: number): number {
  if (!/^-?\d+$/u.test(raw)) throw new Error(`OBJ line ${lineNumber}: ${label} must be an integer index.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`OBJ line ${lineNumber}: ${label} must be a non-zero safe integer.`);
  return value;
}

function resolveIndex(index: number, length: number, label: string, lineNumber: number): number {
  const resolved = index > 0 ? index - 1 : length + index;
  if (resolved < 0 || resolved >= length) {
    throw new Error(`OBJ line ${lineNumber}: ${label} index ${index} is outside the available range of ${length}.`);
  }
  return resolved;
}

function faceRef(token: string, vertexCount: number, uvCount: number, lineNumber: number): FaceRef {
  const parts = token.split("/");
  if (!parts[0]) throw new Error(`OBJ line ${lineNumber}: face vertex reference is missing.`);
  const vertexIndex = resolveIndex(parseInteger(parts[0], "vertex", lineNumber), vertexCount, "vertex", lineNumber);
  const uvIndex = parts.length > 1 && parts[1]
    ? resolveIndex(parseInteger(parts[1], "texture coordinate", lineNumber), uvCount, "texture coordinate", lineNumber)
    : null;
  return Object.freeze({ vertexIndex, uvIndex });
}

function uniquePush(target: string[], value: string): void {
  if (value && !target.includes(value)) target.push(value);
}

/** Extract triangulated UV/world-space data from Wavefront OBJ text. */
export function extractWavefrontObjUv(source: string): WavefrontObjUvExtraction {
  if (typeof source !== "string" || !source.trim()) throw new Error("Wavefront OBJ source must be a non-empty string.");
  const vertices: Position3[] = [];
  const textureCoordinates: UvPoint[] = [];
  const triangles: UvTriangle[] = [];
  const objectNames: string[] = [];
  const groupNames: string[] = [];
  const materialNames: string[] = [];
  let currentObject = "default-object";
  let currentGroup = "default-group";
  let currentMaterial = "default-material";
  let faceCount = 0;
  let polygonFaceCount = 0;
  let skippedFacesWithoutUv = 0;

  const lines = source.split(/\r?\n/u);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineNumber = lineIndex + 1;
    const uncommented = lines[lineIndex]!.replace(/\s+#.*$/u, "").trim();
    if (!uncommented || uncommented.startsWith("#")) continue;
    const parts = uncommented.split(/\s+/u);
    const opcode = parts[0]!;

    if (opcode === "v") {
      if (parts.length < 4) throw new Error(`OBJ line ${lineNumber}: vertex requires x y z.`);
      vertices.push(Object.freeze({
        x: parseFinite(parts[1]!, "vertex x", lineNumber),
        y: parseFinite(parts[2]!, "vertex y", lineNumber),
        z: parseFinite(parts[3]!, "vertex z", lineNumber),
      }));
      continue;
    }
    if (opcode === "vt") {
      if (parts.length < 2) throw new Error(`OBJ line ${lineNumber}: texture coordinate requires at least u.`);
      textureCoordinates.push(Object.freeze({
        u: parseFinite(parts[1]!, "texture u", lineNumber),
        v: parts.length >= 3 ? parseFinite(parts[2]!, "texture v", lineNumber) : 0,
      }));
      continue;
    }
    if (opcode === "o") {
      currentObject = parts.slice(1).join(" ").trim() || "unnamed-object";
      uniquePush(objectNames, currentObject);
      continue;
    }
    if (opcode === "g") {
      currentGroup = parts.slice(1).join(" ").trim() || "unnamed-group";
      uniquePush(groupNames, currentGroup);
      continue;
    }
    if (opcode === "usemtl") {
      currentMaterial = parts.slice(1).join(" ").trim() || "unnamed-material";
      uniquePush(materialNames, currentMaterial);
      continue;
    }
    if (opcode !== "f") continue;

    faceCount += 1;
    const tokens = parts.slice(1);
    if (tokens.length < 3) throw new Error(`OBJ line ${lineNumber}: face requires at least three vertices.`);
    if (tokens.length > 3) polygonFaceCount += 1;
    const refs = tokens.map((token) => faceRef(token, vertices.length, textureCoordinates.length, lineNumber));
    if (refs.some((ref) => ref.uvIndex === null)) {
      skippedFacesWithoutUv += 1;
      continue;
    }

    for (let fan = 1; fan < refs.length - 1; fan += 1) {
      const triRefs = [refs[0]!, refs[fan]!, refs[fan + 1]!] as const;
      const uv = triRefs.map((ref) => textureCoordinates[ref.uvIndex!]!) as unknown as [UvPoint, UvPoint, UvPoint];
      const position = triRefs.map((ref) => vertices[ref.vertexIndex]!) as unknown as [Position3, Position3, Position3];
      triangles.push(Object.freeze({
        id: `${currentObject}/${currentGroup}/${currentMaterial}/face-${faceCount}/tri-${fan}`,
        uv: Object.freeze(uv) as readonly [UvPoint, UvPoint, UvPoint],
        position: Object.freeze(position) as readonly [Position3, Position3, Position3],
      }));
    }
  }

  if (!triangles.length) throw new Error(`Wavefront OBJ produced no UV triangles; faces=${faceCount}, skippedWithoutUv=${skippedFacesWithoutUv}.`);
  return Object.freeze({
    contract: WAVEFRONT_OBJ_UV_CONTRACT,
    vertexCount: vertices.length,
    textureCoordinateCount: textureCoordinates.length,
    faceCount,
    polygonFaceCount,
    triangleCount: triangles.length,
    skippedFacesWithoutUv,
    objectNames: Object.freeze(objectNames),
    groupNames: Object.freeze(groupNames),
    materialNames: Object.freeze(materialNames),
    triangles: Object.freeze(triangles),
  });
}

/** Extract and immediately review OBJ UVs without mutating the source. */
export function reviewWavefrontObjUv(source: string, spec: WavefrontObjUvReviewSpec = {}): WavefrontObjUvReviewResult {
  const extraction = extractWavefrontObjUv(source);
  const triangles = spec.flipVForReview
    ? extraction.triangles.map((triangle) => Object.freeze({
      ...triangle,
      uv: Object.freeze(triangle.uv.map((point) => Object.freeze({ u: point.u, v: 1 - point.v }))) as unknown as readonly [UvPoint, UvPoint, UvPoint],
    }))
    : extraction.triangles;
  const review = reviewUvLayout(triangles, {
    ...(typeof spec.allowTiledCoordinates === "boolean" ? { allowTiledCoordinates: spec.allowTiledCoordinates } : {}),
    ...(spec.overlapPolicy ? { overlapPolicy: spec.overlapPolicy } : {}),
    ...(spec.mirroredPolicy ? { mirroredPolicy: spec.mirroredPolicy } : {}),
    ...(spec.orientationConvention ? { orientationConvention: spec.orientationConvention } : {}),
    ...(spec.uvAreaEpsilon !== undefined ? { uvAreaEpsilon: spec.uvAreaEpsilon } : {}),
    ...(spec.uvEqualityTolerance !== undefined ? { uvEqualityTolerance: spec.uvEqualityTolerance } : {}),
    ...(spec.textureWidth !== undefined ? { textureWidth: spec.textureWidth } : {}),
    ...(spec.textureHeight !== undefined ? { textureHeight: spec.textureHeight } : {}),
    ...(spec.maximumTexelDensityRatio !== undefined ? { maximumTexelDensityRatio: spec.maximumTexelDensityRatio } : {}),
    ...(spec.minimumAtlasBoundaryPaddingTexels !== undefined ? { minimumAtlasBoundaryPaddingTexels: spec.minimumAtlasBoundaryPaddingTexels } : {}),
    ...(spec.minimumIslandPaddingTexels !== undefined ? { minimumIslandPaddingTexels: spec.minimumIslandPaddingTexels } : {}),
  });
  return Object.freeze({ extraction, review, sourceModified: false as const });
}
