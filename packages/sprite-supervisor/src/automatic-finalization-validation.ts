import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";

import { compileAutomaticSpriteWorkflow } from "./automatic-compiler.js";
import {
  AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION,
  type AutomaticSpriteBackgroundMode,
  type AutomaticSpriteFinalizationCompileRequestInput,
  type CompiledAutomaticSpriteFinalizationWorkflow,
  type NormalizedAutomaticSpriteFinalizationRequest,
  type NormalizedAutomaticSpriteThreeDReference,
  type ResolvedAutomaticSpriteBackgroundPolicy,
} from "./automatic-finalization-types.js";
import type { CompiledAutomaticSpriteWorkflow } from "./automatic-types.js";
import { SpriteSupervisorError } from "./types.js";
import { spriteSupervisorSha256 } from "./validation.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const SHA = /^[a-f0-9]{40,64}$/;
const BACKGROUND_MODES = new Set<AutomaticSpriteBackgroundMode>([
  "auto",
  "native-alpha",
  "green-matte",
  "magenta-matte",
  "black-additive",
  "opaque-preserve",
]);
const DELIVERY_PROFILES = new Set([
  "retro-standing-character-576",
  "retro-ui-icon-256",
  "retro-overlay-720p",
  "godot-sprite-lossless",
]);

function fail(code: string, message: string, details?: JsonValue): never {
  throw new SpriteSupervisorError(code, message, details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail("AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID", `${name} must be an object.`);
  }
  return value;
}

function text(
  value: unknown,
  name: string,
  fallback?: string,
  maximum = 2_048,
): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") {
    fail("AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID", `${name} must be a string.`);
  }
  const result = value.trim();
  if (!result || result.length > maximum || result.includes("\0")) {
    fail(
      "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
      `${name} must contain 1 to ${maximum} safe characters.`,
    );
  }
  return result;
}

function booleanValue(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    fail("AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID", `${name} must be a boolean.`);
  }
  return value;
}

function artifactId(value: unknown, name: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    fail(
      "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
      `${name} must use artifact_<sha256> format.`,
    );
  }
  return value as ArtifactId;
}

function optionalArtifactId(value: unknown, name: string): ArtifactId | undefined {
  return value === undefined ? undefined : artifactId(value, name);
}

function artifactMap(
  value: unknown,
  name: string,
): Readonly<Record<string, ArtifactId>> {
  if (value === undefined) return {};
  const source = record(value, name);
  if (Object.keys(source).length > 64) {
    fail(
      "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
      `${name} may contain at most 64 direction bindings.`,
    );
  }
  const output: Record<string, ArtifactId> = {};
  for (const [key, candidate] of Object.entries(source)) {
    if (!SAFE_ID.test(key)) {
      fail(
        "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
        `${name} contains unsafe key ${key}.`,
      );
    }
    output[key] = artifactId(candidate, `${name}.${key}`);
  }
  return Object.freeze(output);
}

function artifactArray(
  value: unknown,
  name: string,
): readonly ArtifactId[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) {
    fail(
      "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
      `${name} must contain at most 64 artifact IDs.`,
    );
  }
  return [
    ...new Set(value.map((entry, index) => artifactId(entry, `${name}[${index}]`))),
  ].sort();
}

function strings(value: unknown, name: string, defaults: readonly string[]): readonly string[] {
  if (value === undefined) return defaults;
  if (!Array.isArray(value) || value.length > 32) {
    fail(
      "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
      `${name} must contain at most 32 strings.`,
    );
  }
  return [
    ...new Set(value.map((entry, index) => text(entry, `${name}[${index}]`, undefined, 128))),
  ];
}

function hex(value: unknown, name: string, fallback: string): string {
  const result = text(value, name, fallback, 7).toLowerCase();
  if (!HEX.test(result)) {
    fail(
      "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
      `${name} must use #RRGGBB format.`,
    );
  }
  return result;
}

function normalizeThreeD(value: unknown): NormalizedAutomaticSpriteThreeDReference | undefined {
  if (value === undefined) return undefined;
  const source = record(value, "threeDReference");
  const repository = text(
    source.repository,
    "threeDReference.repository",
    "EVAVO-STUDIO/evavo-3d-studio",
    256,
  );
  if (!SAFE_REPOSITORY.test(repository)) {
    fail(
      "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
      "threeDReference.repository must use owner/name format.",
    );
  }
  const revision = text(source.revision, "threeDReference.revision", undefined, 64);
  if (!SHA.test(revision)) {
    fail(
      "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
      "threeDReference.revision must be a 40 to 64 character lowercase commit or content hash.",
    );
  }
  return {
    repository,
    revision,
    ...(optionalArtifactId(
      source.renderRigArtifactId,
      "threeDReference.renderRigArtifactId",
    ) === undefined
      ? {}
      : {
          renderRigArtifactId: optionalArtifactId(
            source.renderRigArtifactId,
            "threeDReference.renderRigArtifactId",
          )!,
        }),
    ...(optionalArtifactId(
      source.cameraManifestArtifactId,
      "threeDReference.cameraManifestArtifactId",
    ) === undefined
      ? {}
      : {
          cameraManifestArtifactId: optionalArtifactId(
            source.cameraManifestArtifactId,
            "threeDReference.cameraManifestArtifactId",
          )!,
        }),
    ...(optionalArtifactId(
      source.materialReferenceArtifactId,
      "threeDReference.materialReferenceArtifactId",
    ) === undefined
      ? {}
      : {
          materialReferenceArtifactId: optionalArtifactId(
            source.materialReferenceArtifactId,
            "threeDReference.materialReferenceArtifactId",
          )!,
        }),
    turntableArtifactIds: artifactArray(
      source.turntableArtifactIds,
      "threeDReference.turntableArtifactIds",
    ),
    directionReferenceArtifactIds: artifactMap(
      source.directionReferenceArtifactIds,
      "threeDReference.directionReferenceArtifactIds",
    ),
    depthReferenceArtifactIds: artifactMap(
      source.depthReferenceArtifactIds,
      "threeDReference.depthReferenceArtifactIds",
    ),
    normalReferenceArtifactIds: artifactMap(
      source.normalReferenceArtifactIds,
      "threeDReference.normalReferenceArtifactIds",
    ),
    notes: strings(source.notes, "threeDReference.notes", []),
  };
}

export function validateAutomaticSpriteFinalizationRequest(
  input: AutomaticSpriteFinalizationCompileRequestInput | unknown,
): NormalizedAutomaticSpriteFinalizationRequest {
  const root = record(input, "request");
  if (root.schemaVersion !== "1.0") {
    fail(
      "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
      'schemaVersion must be "1.0".',
    );
  }
  const background = root.background === undefined ? {} : record(root.background, "background");
  const finalization =
    root.finalization === undefined ? {} : record(root.finalization, "finalization");
  const mode = background.mode === undefined ? "auto" : background.mode;
  if (typeof mode !== "string" || !BACKGROUND_MODES.has(mode as AutomaticSpriteBackgroundMode)) {
    fail(
      "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
      "background.mode is unsupported.",
    );
  }
  const profile =
    finalization.deliveryProfileId === undefined
      ? "godot-sprite-lossless"
      : finalization.deliveryProfileId;
  if (typeof profile !== "string" || !DELIVERY_PROFILES.has(profile)) {
    fail(
      "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
      "finalization.deliveryProfileId is unsupported.",
    );
  }
  const metadata = root.metadata === undefined ? undefined : normalizeJson(root.metadata);
  return {
    schemaVersion: "1.0",
    protocolVersion: AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION,
    workflow: root.workflow,
    background: {
      mode: mode as AutomaticSpriteBackgroundMode,
      nativeAlphaAdapterIds: strings(
        background.nativeAlphaAdapterIds,
        "background.nativeAlphaAdapterIds",
        ["openai-gpt-image"],
      ),
      greenMatteColour: hex(
        background.greenMatteColour,
        "background.greenMatteColour",
        "#00ff00",
      ),
      magentaMatteColour: hex(
        background.magentaMatteColour,
        "background.magentaMatteColour",
        "#ff00ff",
      ),
      blackColour: hex(background.blackColour, "background.blackColour", "#000000"),
      requireFakeTransparencyRejection: booleanValue(
        background.requireFakeTransparencyRejection,
        "background.requireFakeTransparencyRejection",
        true,
      ),
      requireMeaningfulAlpha: booleanValue(
        background.requireMeaningfulAlpha,
        "background.requireMeaningfulAlpha",
        true,
      ),
      proofBackgrounds: strings(
        background.proofBackgrounds,
        "background.proofBackgrounds",
        ["#000000", "#ffffff", "#808080", "#00ff00", "#ff00ff"],
      ).map((entry) => {
        if (!HEX.test(entry)) {
          fail(
            "AUTOMATIC_SPRITE_FINALIZATION_REQUEST_INVALID",
            "background.proofBackgrounds entries must use #RRGGBB format.",
          );
        }
        return entry.toLowerCase();
      }),
    },
    ...(normalizeThreeD(root.threeDReference) === undefined
      ? {}
      : { threeDReference: normalizeThreeD(root.threeDReference)! }),
    finalization: {
      deliveryProfileId: profile as NormalizedAutomaticSpriteFinalizationRequest["finalization"]["deliveryProfileId"],
      requireFamilyVerification: booleanValue(
        finalization.requireFamilyVerification,
        "finalization.requireFamilyVerification",
        true,
      ),
      requireHostileMatteProof: booleanValue(
        finalization.requireHostileMatteProof,
        "finalization.requireHostileMatteProof",
        true,
      ),
      requireNoRejectedArtifacts: booleanValue(
        finalization.requireNoRejectedArtifacts,
        "finalization.requireNoRejectedArtifacts",
        true,
      ),
      requireExactDimensions: booleanValue(
        finalization.requireExactDimensions,
        "finalization.requireExactDimensions",
        true,
      ),
    },
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function colourDistance(left: string, right: string): number {
  const rgb = (value: string): readonly number[] => [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
  const a = rgb(left);
  const b = rgb(right);
  return Math.sqrt(
    (a[0]! - b[0]!) ** 2 +
      (a[1]! - b[1]!) ** 2 +
      (a[2]! - b[2]!) ** 2,
  );
}

function collisionScore(colours: readonly string[], target: string): number {
  if (!colours.length) return 0;
  return colours.reduce((score, colour) => {
    if (!HEX.test(colour)) return score;
    const distance = colourDistance(colour.toLowerCase(), target);
    return score + Math.max(0, 1 - distance / 220);
  }, 0);
}

export function resolveAutomaticSpriteBackgroundPolicy(
  request: NormalizedAutomaticSpriteFinalizationRequest,
  base: CompiledAutomaticSpriteWorkflow,
): ResolvedAutomaticSpriteBackgroundPolicy {
  const contract = base.request.artDirectionContract;
  const asset = contract.asset;
  const palette = contract.style.palette.colours.map((entry) => entry.toLowerCase());
  const collisionScores = {
    green: collisionScore(palette, request.background.greenMatteColour),
    magenta: collisionScore(palette, request.background.magentaMatteColour),
    black: collisionScore(palette, request.background.blackColour),
  };
  const preferredAdapter = base.request.provider.preferredAdapterId;
  let mode = request.background.mode;
  let reason = "The caller selected an explicit governed background mode.";
  if (mode === "auto") {
    if (asset.transparency === "opaque") {
      mode = "opaque-preserve";
      reason = "The compiled art direction requires an opaque delivery.";
    } else if (
      request.background.nativeAlphaAdapterIds.includes(preferredAdapter ?? "")
    ) {
      mode = "native-alpha";
      reason = "The preferred adapter is explicitly allowed for native-alpha delivery.";
    } else if (collisionScores.green <= collisionScores.magenta) {
      mode = "green-matte";
      reason = "Green has the lower approved-palette collision score.";
    } else {
      mode = "magenta-matte";
      reason = "Magenta has the lower approved-palette collision score.";
    }
  }
  if (mode === "black-additive") {
    const effectLike =
      asset.family === "particle" ||
      asset.family === "decal" ||
      contract.production.layers.some(
        (entry) => entry.role === "effect" || entry.role === "emission",
      );
    if (!effectLike) {
      fail(
        "AUTOMATIC_SPRITE_BACKGROUND_BLACK_INVALID",
        "black-additive mode is limited to effects, particles, decals, or emission-owned assets.",
      );
    }
    return {
      requestedMode: request.background.mode,
      resolvedMode: "black-additive",
      providerStrategy: "opaque-source",
      matteColour: request.background.blackColour,
      transparencyExpectation: "opaque",
      deliveryBackground: { mode: "preserve" },
      proofBackgrounds: request.background.proofBackgrounds,
      requireFakeTransparencyRejection:
        request.background.requireFakeTransparencyRejection,
      requireMeaningfulAlpha: false,
      reason,
      collisionScores,
    };
  }
  if (mode === "opaque-preserve") {
    return {
      requestedMode: request.background.mode,
      resolvedMode: "opaque-preserve",
      providerStrategy: "opaque-source",
      transparencyExpectation: "opaque",
      deliveryBackground: { mode: "preserve" },
      proofBackgrounds: request.background.proofBackgrounds,
      requireFakeTransparencyRejection:
        request.background.requireFakeTransparencyRejection,
      requireMeaningfulAlpha: false,
      reason,
      collisionScores,
    };
  }
  if (mode === "native-alpha") {
    if (asset.transparency === "opaque") {
      fail(
        "AUTOMATIC_SPRITE_BACKGROUND_ALPHA_INVALID",
        "native-alpha cannot be used for an opaque art-direction target.",
      );
    }
    return {
      requestedMode: request.background.mode,
      resolvedMode: "native-alpha",
      providerStrategy: "native-alpha",
      transparencyExpectation: "alpha-required",
      deliveryBackground: { mode: "preserve" },
      proofBackgrounds: request.background.proofBackgrounds,
      requireFakeTransparencyRejection:
        request.background.requireFakeTransparencyRejection,
      requireMeaningfulAlpha: request.background.requireMeaningfulAlpha,
      reason,
      collisionScores,
    };
  }
  const matteColour =
    mode === "magenta-matte"
      ? request.background.magentaMatteColour
      : request.background.greenMatteColour;
  return {
    requestedMode: request.background.mode,
    resolvedMode: "chroma-key",
    providerStrategy: "chroma-key",
    matteColour,
    transparencyExpectation: "alpha-required",
    deliveryBackground: { mode: "remove-border-matte", matteColour },
    proofBackgrounds: request.background.proofBackgrounds,
    requireFakeTransparencyRejection:
      request.background.requireFakeTransparencyRejection,
    requireMeaningfulAlpha: request.background.requireMeaningfulAlpha,
    reason,
    collisionScores,
  };
}

export function automaticSpriteFinalizationRequestSha256(
  request: NormalizedAutomaticSpriteFinalizationRequest,
): string {
  return spriteSupervisorSha256(request);
}

export function compileAutomaticSpriteFinalizationBase(
  input: AutomaticSpriteFinalizationCompileRequestInput | unknown,
): Readonly<{
  request: NormalizedAutomaticSpriteFinalizationRequest;
  baseWorkflow: CompiledAutomaticSpriteWorkflow;
  background: ResolvedAutomaticSpriteBackgroundPolicy;
}> {
  const request = validateAutomaticSpriteFinalizationRequest(input);
  const baseWorkflow = compileAutomaticSpriteWorkflow(request.workflow);
  return {
    request,
    baseWorkflow,
    background: resolveAutomaticSpriteBackgroundPolicy(request, baseWorkflow),
  };
}
