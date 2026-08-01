export const SPRITE_EFFECT_PACK_SCHEMA =
  "evavo.art-godot-sprite-effect-pack.v1" as const;
export const SPRITE_EFFECT_PACK_RECEIPT_SCHEMA =
  "evavo.art-godot-sprite-effect-pack-receipt.v1" as const;
export const SPRITE_EFFECT_COMPILER_VERSION = "0.2.0" as const;
export const SPRITE_EFFECT_CATALOG_VERSION = "2026-08-01.2" as const;

export type SpriteEffectId =
  | "sprite_feedback"
  | "sprite_dissolve"
  | "sprite_ghost"
  | "sprite_sway"
  | "sprite_engraved_ink"
  | "sprite_additive_pulse";

export type SpriteEffectBlendMode =
  | "blend_mix"
  | "blend_add"
  | "blend_mul";

export interface SpriteEffectUniformDefinition {
  readonly name: string;
  readonly type: "float" | "vec2" | "vec4" | "bool";
  readonly scope: "instance" | "material";
  readonly defaultValue: string;
  readonly purpose: string;
}

export interface SpriteEffectDefinition {
  readonly id: SpriteEffectId;
  readonly title: string;
  readonly description: string;
  readonly blendMode: SpriteEffectBlendMode;
  readonly animated: boolean;
  readonly usesVertexStage: boolean;
  readonly usesNeighbourSampling: boolean;
  readonly compatibleRoles: readonly string[];
  readonly uniforms: readonly SpriteEffectUniformDefinition[];
  readonly performanceClass: "cheap" | "moderate";
  readonly notes: readonly string[];
}

export interface SpriteEffectPackRequest {
  readonly schema: typeof SPRITE_EFFECT_PACK_SCHEMA;
  readonly packId: string;
  readonly project: Readonly<{
    id: string;
    title: string;
    engine: "Godot";
    engineVersion: "4.6.2";
    renderer: "gl_compatibility" | "mobile" | "forward_plus";
  }>;
  readonly effects: readonly SpriteEffectId[];
  readonly targetRoot: string;
  readonly csharpNamespace: string;
  readonly binderClassName: string;
  readonly binderPath: string;
}

export interface SpriteEffectFileEvidence {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly kind: "shader" | "material" | "catalog" | "binder" | "receipt";
}

export interface SpriteEffectPackReceipt {
  readonly schema: typeof SPRITE_EFFECT_PACK_RECEIPT_SCHEMA;
  readonly compilerVersion: typeof SPRITE_EFFECT_COMPILER_VERSION;
  readonly catalogVersion: typeof SPRITE_EFFECT_CATALOG_VERSION;
  readonly packId: string;
  readonly requestSha256: string;
  readonly project: SpriteEffectPackRequest["project"];
  readonly effects: readonly Readonly<{
    id: SpriteEffectId;
    shaderPath: string;
    materialPath: string;
    shaderSha256: string;
    materialSha256: string;
    uniforms: readonly SpriteEffectUniformDefinition[];
    validation: Readonly<{ passed: true; textureSamples: number; findings: readonly string[] }>;
  }>[];
  readonly files: readonly SpriteEffectFileEvidence[];
  readonly exactOutputPaths: readonly string[];
  readonly mutationPerformed: boolean;
  readonly validationBoundary: string;
}

export interface CompiledSpriteEffectPack {
  readonly files: ReadonlyMap<string, Buffer>;
  readonly receipt: SpriteEffectPackReceipt;
}

export class SpriteEffectError extends Error {
  public readonly code: string;
  public readonly details: Readonly<Record<string, unknown>> | null;

  public constructor(
    code: string,
    message: string,
    details: Readonly<Record<string, unknown>> | null = null,
  ) {
    super(message);
    this.name = "SpriteEffectError";
    this.code = code;
    this.details = details;
  }
}
