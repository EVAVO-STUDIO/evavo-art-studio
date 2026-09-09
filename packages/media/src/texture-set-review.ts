import {
  reviewTextureMap,
  type TextureMapKind,
  type TextureMapReviewEvidence,
} from "./texture-map-review.js";

export const TEXTURE_SET_REVIEW_CONTRACT = "evavo.texture-set-review.v1" as const;

export type TextureSetDecision = "pass" | "needs-finishing" | "reject";
export type TexturePowerOfTwoPolicy = "ignore" | "warn" | "require";
export type TextureSamplingIntent = "srgb-colour" | "linear-data";

export interface TextureSetMapInput {
  readonly id: string;
  readonly kind: TextureMapKind;
  readonly encoded: Buffer;
  readonly filename?: string;
  readonly expectSeamless?: boolean;
}

export interface TextureSetReviewSpec {
  readonly expectedKinds?: readonly TextureMapKind[];
  readonly requireMatchingDimensions?: boolean;
  readonly powerOfTwoPolicy?: TexturePowerOfTwoPolicy;
  readonly expectSeamless?: boolean;
}

export interface GodotTextureImportGuidance {
  readonly kind: TextureMapKind;
  readonly samplingIntent: TextureSamplingIntent;
  readonly repeatRecommended: boolean;
  readonly materialTarget: "StandardMaterial3D" | "ORMMaterial3D";
  readonly usage: string;
  readonly channelContract: string;
  readonly importNotes: readonly string[];
}

export interface TextureSetMapReview {
  readonly id: string;
  readonly kind: TextureMapKind;
  readonly filename?: string;
  readonly review: TextureMapReviewEvidence;
  readonly godot: GodotTextureImportGuidance;
}

export interface TextureSetReviewResult {
  readonly contract: typeof TEXTURE_SET_REVIEW_CONTRACT;
  readonly decision: TextureSetDecision;
  readonly width: number;
  readonly height: number;
  readonly mapKinds: readonly TextureMapKind[];
  readonly missingExpectedKinds: readonly TextureMapKind[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly maps: readonly TextureSetMapReview[];
  readonly godot: Readonly<{
    preferredMaterial: "StandardMaterial3D" | "ORMMaterial3D";
    ormChannelContract: "R=ambient-occlusion,G=roughness,B=metallic";
    normalConvention: "OpenGL X+ Y+ Z+";
    notes: readonly string[];
  }>;
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function importGuidance(kind: TextureMapKind, repeatRecommended: boolean): GodotTextureImportGuidance {
  const colour = kind === "base-color" || kind === "emissive";
  const common = {
    kind,
    samplingIntent: colour ? "srgb-colour" as const : "linear-data" as const,
    repeatRecommended,
  };

  if (kind === "base-color") {
    return Object.freeze({ ...common, materialTarget: "StandardMaterial3D", usage: "Albedo/base colour", channelContract: "RGB=colour; alpha may carry opacity when intentionally authored", importNotes: Object.freeze(["Treat as colour data.", "Avoid baked lighting unless the material style intentionally requires it."]) });
  }
  if (kind === "normal-tangent") {
    return Object.freeze({ ...common, materialTarget: "StandardMaterial3D", usage: "Tangent-space normal", channelContract: "RGB=OpenGL-style X+,Y+,Z+ normal", importNotes: Object.freeze(["Use Godot normal-map import/compression handling.", "Godot expects OpenGL-style X+, Y+, Z+ normals; invert Y only for a confirmed DirectX-style source."]) });
  }
  if (kind === "orm-packed") {
    return Object.freeze({ ...common, materialTarget: "ORMMaterial3D", usage: "Packed occlusion/roughness/metallic data", channelContract: "R=ambient occlusion; G=roughness; B=metallic", importNotes: Object.freeze(["Treat channels as linear material data, not RGB colour.", "Use ORMMaterial3D when consuming the packed texture directly."]) });
  }
  if (kind === "ambient-occlusion") {
    return Object.freeze({ ...common, materialTarget: "StandardMaterial3D", usage: "Ambient occlusion", channelContract: "grayscale=data", importNotes: Object.freeze(["Treat as linear material data.", "Can be packed into ORM red."]) });
  }
  if (kind === "roughness") {
    return Object.freeze({ ...common, materialTarget: "StandardMaterial3D", usage: "Roughness", channelContract: "grayscale: 0=smooth, 1=rough", importNotes: Object.freeze(["Treat as linear material data.", "Can be packed into ORM green."]) });
  }
  if (kind === "metallic") {
    return Object.freeze({ ...common, materialTarget: "StandardMaterial3D", usage: "Metallic", channelContract: "grayscale: 0=dielectric, 1=metal", importNotes: Object.freeze(["Treat as linear material data.", "Can be packed into ORM blue."]) });
  }
  if (kind === "height") {
    return Object.freeze({ ...common, materialTarget: "StandardMaterial3D", usage: "Height/parallax", channelContract: "grayscale=data; verify authored height direction", importNotes: Object.freeze(["Treat as linear data.", "Godot height mapping is a shading displacement illusion; pair with a normal map for stronger surface depth."]) });
  }
  if (kind === "specular") {
    return Object.freeze({ ...common, materialTarget: "StandardMaterial3D", usage: "Specular intensity/control", channelContract: "grayscale=data", importNotes: Object.freeze(["Treat as material data and verify the target shader actually consumes a specular texture."]) });
  }
  if (kind === "opacity") {
    return Object.freeze({ ...common, materialTarget: "StandardMaterial3D", usage: "Opacity/cutout", channelContract: "grayscale=data", importNotes: Object.freeze(["Treat as linear mask data.", "Verify the material transparency mode and sorting/cutout expectations."]) });
  }
  return Object.freeze({ ...common, materialTarget: "StandardMaterial3D", usage: "Emission", channelContract: "RGB=emissive colour/intensity mask", importNotes: Object.freeze(["Treat emissive colour as colour data.", "Emission does not by itself guarantee surrounding geometry receives emitted light; that depends on the lighting/GI setup."]) });
}

/** Review a complete material texture set as one coherent game asset. */
export async function reviewTextureSet(
  maps: readonly TextureSetMapInput[],
  spec: TextureSetReviewSpec = {},
): Promise<TextureSetReviewResult> {
  if (!Array.isArray(maps) || maps.length < 1 || maps.length > 32) {
    throw new Error("Texture set must contain 1 through 32 maps.");
  }

  const seenIds = new Set<string>();
  const seenKinds = new Set<TextureMapKind>();
  const duplicateKinds = new Set<TextureMapKind>();
  const reviewed: TextureSetMapReview[] = [];

  for (const [index, map] of maps.entries()) {
    if (!map || typeof map.id !== "string" || !map.id.trim()) throw new Error(`maps[${index}].id must be a non-empty string.`);
    if (!Buffer.isBuffer(map.encoded) || !map.encoded.byteLength) throw new Error(`maps[${index}].encoded must be a non-empty Buffer.`);
    if (seenIds.has(map.id)) throw new Error(`Duplicate texture map id ${JSON.stringify(map.id)}.`);
    seenIds.add(map.id);
    if (seenKinds.has(map.kind)) duplicateKinds.add(map.kind);
    seenKinds.add(map.kind);

    const expectSeamless = map.expectSeamless ?? spec.expectSeamless ?? false;
    const review = await reviewTextureMap(map.encoded, { kind: map.kind, expectSeamless });
    reviewed.push(Object.freeze({
      id: map.id,
      kind: map.kind,
      ...(map.filename ? { filename: map.filename } : {}),
      review,
      godot: importGuidance(map.kind, expectSeamless),
    }));
  }

  const first = reviewed[0]!;
  const width = first.review.width;
  const height = first.review.height;
  const requireMatchingDimensions = spec.requireMatchingDimensions !== false;
  const powerOfTwoPolicy = spec.powerOfTwoPolicy ?? "warn";
  if (powerOfTwoPolicy !== "ignore" && powerOfTwoPolicy !== "warn" && powerOfTwoPolicy !== "require") {
    throw new Error("powerOfTwoPolicy must be ignore, warn or require.");
  }

  const structuralBlockers: string[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  for (const kind of duplicateKinds) structuralBlockers.push(`duplicate-map-kind:${kind}`);

  for (const item of reviewed) {
    if (requireMatchingDimensions && (item.review.width !== width || item.review.height !== height)) {
      structuralBlockers.push(`dimension-mismatch:${item.id}:${item.review.width}x${item.review.height}!=${width}x${height}`);
    }
    if (item.review.grade === "fail") blockers.push(...item.review.blockers.map((value) => `${item.id}:${value}`));
    warnings.push(...item.review.warnings.map((value) => `${item.id}:${value}`));

    const pot = isPowerOfTwo(item.review.width) && isPowerOfTwo(item.review.height);
    if (!pot && powerOfTwoPolicy === "require") structuralBlockers.push(`non-power-of-two:${item.id}:${item.review.width}x${item.review.height}`);
    else if (!pot && powerOfTwoPolicy === "warn") warnings.push(`non-power-of-two:${item.id}:${item.review.width}x${item.review.height}`);
  }

  const expectedKinds = Object.freeze([...(spec.expectedKinds ?? [])]);
  const missingExpectedKinds = Object.freeze(expectedKinds.filter((kind) => !seenKinds.has(kind)));
  for (const kind of missingExpectedKinds) structuralBlockers.push(`missing-expected-map:${kind}`);

  if (seenKinds.has("orm-packed") && (seenKinds.has("ambient-occlusion") || seenKinds.has("roughness") || seenKinds.has("metallic"))) {
    warnings.push("orm-packed-and-separate-orm-inputs-present; verify which source is authoritative");
  }
  if (seenKinds.has("height") && !seenKinds.has("normal-tangent")) {
    warnings.push("height-map-without-normal-map; Godot surface depth usually benefits from pairing height with tangent-space normal detail");
  }

  blockers.unshift(...structuralBlockers);
  const hasMapFailure = reviewed.some((item) => item.review.grade === "fail");
  const hasMapWarning = reviewed.some((item) => item.review.grade === "warn");
  const decision: TextureSetDecision = structuralBlockers.length > 0
    ? "reject"
    : hasMapFailure || hasMapWarning || warnings.length > 0
      ? "needs-finishing"
      : "pass";

  const preferredMaterial = seenKinds.has("orm-packed") ? "ORMMaterial3D" as const : "StandardMaterial3D" as const;
  return Object.freeze({
    contract: TEXTURE_SET_REVIEW_CONTRACT,
    decision,
    width,
    height,
    mapKinds: Object.freeze(reviewed.map((item) => item.kind)),
    missingExpectedKinds,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    maps: Object.freeze(reviewed),
    godot: Object.freeze({
      preferredMaterial,
      ormChannelContract: "R=ambient-occlusion,G=roughness,B=metallic" as const,
      normalConvention: "OpenGL X+ Y+ Z+" as const,
      notes: Object.freeze([
        "StandardMaterial3D consumes separate AO, roughness and metallic textures; ORMMaterial3D consumes the packed ORM form.",
        "Normal maps are data textures and should use Godot normal-map import handling rather than colour-texture assumptions.",
        "For tileable assets, repeat sampling must be enabled in the consuming material/texture path and the 3x3 tile proof should be visually reviewed.",
      ]),
    }),
  });
}
