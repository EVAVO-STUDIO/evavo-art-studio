import sharp from "sharp";
import { reviewTextureMap, type TextureMapKind, type TextureMapReviewEvidence } from "./texture-map-review.js";

export const TEXTURE_CHANNEL_PACK_CONTRACT = "evavo.texture-channel-pack.v1" as const;

export type TextureScalarChannel = "r" | "g" | "b" | "a";

export interface TextureScalarSource {
  readonly encoded: Buffer;
  readonly channel?: TextureScalarChannel;
}

export interface GodotOrmPackSpec {
  readonly ambientOcclusion?: TextureScalarSource;
  readonly roughness?: TextureScalarSource;
  readonly metallic?: TextureScalarSource;
  readonly defaultAmbientOcclusion?: number;
  readonly defaultRoughness?: number;
  readonly defaultMetallic?: number;
  readonly strictScalarValidation?: boolean;
}

export interface GodotOrmPackResult {
  readonly png: Buffer;
  readonly evidence: Readonly<{
    contract: typeof TEXTURE_CHANNEL_PACK_CONTRACT;
    width: number;
    height: number;
    outputKind: "orm-packed";
    channelContract: "R=ambient-occlusion,G=roughness,B=metallic,A=255";
    defaultedChannels: readonly ("ambient-occlusion" | "roughness" | "metallic")[];
    sourceChannels: Readonly<{
      ambientOcclusion: TextureScalarChannel | "default";
      roughness: TextureScalarChannel | "default";
      metallic: TextureScalarChannel | "default";
    }>;
    sourceReviews: readonly Readonly<{
      kind: "ambient-occlusion" | "roughness" | "metallic";
      grade: TextureMapReviewEvidence["grade"];
      blockers: readonly string[];
      warnings: readonly string[];
    }>[];
    losslessChannelPacking: true;
    sourceMutationAllowed: false;
    godotMaterial: "ORMMaterial3D";
  }>;
}

type ScalarKind = "ambient-occlusion" | "roughness" | "metallic";

type DecodedScalar = Readonly<{
  width: number;
  height: number;
  values: Buffer;
  channel: TextureScalarChannel;
  review: TextureMapReviewEvidence;
}>;

function byte(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error(`${label} must be an integer from 0 through 255.`);
  return value;
}

function channelOffset(channel: TextureScalarChannel): number {
  if (channel === "r") return 0;
  if (channel === "g") return 1;
  if (channel === "b") return 2;
  return 3;
}

async function decodeScalar(
  source: TextureScalarSource,
  kind: ScalarKind,
  strictScalarValidation: boolean,
): Promise<DecodedScalar> {
  if (!Buffer.isBuffer(source.encoded) || !source.encoded.byteLength) throw new Error(`${kind} source must be a non-empty Buffer.`);
  const channel = source.channel ?? "r";
  const review = await reviewTextureMap(source.encoded, { kind });
  if (strictScalarValidation && review.blockers.some((value) => value.startsWith("scalar-map-has-colour-contamination"))) {
    throw new Error(`${kind} source failed scalar validation: ${review.blockers.join(", ")}`);
  }

  const decoded = await sharp(source.encoded, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  if (!width || !height) throw new Error(`${kind} source has no dimensions.`);
  const values = Buffer.alloc(width * height);
  const component = channelOffset(channel);
  for (let pixel = 0; pixel < width * height; pixel += 1) values[pixel] = decoded.data[pixel * 4 + component]!;
  return Object.freeze({ width, height, values, channel, review });
}

/**
 * Losslessly pack Godot ORM data as R=AO, G=roughness, B=metallic, A=255.
 * Missing scalar maps use explicit deterministic defaults; inputs are never mutated.
 */
export async function packGodotOrmTexture(spec: GodotOrmPackSpec): Promise<GodotOrmPackResult> {
  if (!spec || (!spec.ambientOcclusion && !spec.roughness && !spec.metallic)) {
    throw new Error("ORM packing requires at least one ambient occlusion, roughness or metallic source.");
  }
  const strictScalarValidation = spec.strictScalarValidation !== false;
  const decoded: Partial<Record<ScalarKind, DecodedScalar>> = {};
  if (spec.ambientOcclusion) decoded["ambient-occlusion"] = await decodeScalar(spec.ambientOcclusion, "ambient-occlusion", strictScalarValidation);
  if (spec.roughness) decoded.roughness = await decodeScalar(spec.roughness, "roughness", strictScalarValidation);
  if (spec.metallic) decoded.metallic = await decodeScalar(spec.metallic, "metallic", strictScalarValidation);

  const present = [decoded["ambient-occlusion"], decoded.roughness, decoded.metallic].filter((value): value is DecodedScalar => value !== undefined);
  const first = present[0]!;
  const width = first.width;
  const height = first.height;
  for (const source of present) {
    if (source.width !== width || source.height !== height) {
      throw new Error(`ORM source dimensions must match exactly; expected ${width}x${height}, received ${source.width}x${source.height}.`);
    }
  }

  const defaultAmbientOcclusion = byte(spec.defaultAmbientOcclusion, 255, "defaultAmbientOcclusion");
  const defaultRoughness = byte(spec.defaultRoughness, 255, "defaultRoughness");
  const defaultMetallic = byte(spec.defaultMetallic, 0, "defaultMetallic");
  const output = Buffer.alloc(width * height * 4);
  const ao = decoded["ambient-occlusion"];
  const roughness = decoded.roughness;
  const metallic = decoded.metallic;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    output[offset] = ao?.values[pixel] ?? defaultAmbientOcclusion;
    output[offset + 1] = roughness?.values[pixel] ?? defaultRoughness;
    output[offset + 2] = metallic?.values[pixel] ?? defaultMetallic;
    output[offset + 3] = 255;
  }

  const defaultedChannels: ("ambient-occlusion" | "roughness" | "metallic")[] = [];
  if (!ao) defaultedChannels.push("ambient-occlusion");
  if (!roughness) defaultedChannels.push("roughness");
  if (!metallic) defaultedChannels.push("metallic");

  const sourceReviews = present.map((source) => {
    const kind = source.review.kind;
    if (kind !== "ambient-occlusion" && kind !== "roughness" && kind !== "metallic") throw new Error(`Unexpected scalar review kind ${JSON.stringify(kind)}.`);
    return Object.freeze({ kind, grade: source.review.grade, blockers: source.review.blockers, warnings: source.review.warnings });
  });

  const png = await sharp(output, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  return Object.freeze({
    png,
    evidence: Object.freeze({
      contract: TEXTURE_CHANNEL_PACK_CONTRACT,
      width,
      height,
      outputKind: "orm-packed" as const,
      channelContract: "R=ambient-occlusion,G=roughness,B=metallic,A=255" as const,
      defaultedChannels: Object.freeze(defaultedChannels),
      sourceChannels: Object.freeze({
        ambientOcclusion: ao?.channel ?? "default",
        roughness: roughness?.channel ?? "default",
        metallic: metallic?.channel ?? "default",
      }),
      sourceReviews: Object.freeze(sourceReviews),
      losslessChannelPacking: true as const,
      sourceMutationAllowed: false as const,
      godotMaterial: "ORMMaterial3D" as const,
    }),
  });
}
