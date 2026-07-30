import {
  normalizeJson,
  type ArtifactId,
} from "@evavo/art-artifacts";
import {
  SpriteFamilyError,
  validateSpriteFamilyManifest,
  verifySpriteFamily,
} from "@evavo/art-sprite-family";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

const REQUIRED_CAPABILITIES = Object.freeze([
  "sprite.family.verify",
  "media.layer-compose",
  "selection.compare",
  "evidence.bundle",
] as const);

function inputArtifactIds(input: unknown): readonly ArtifactId[] {
  const manifest = validateSpriteFamilyManifest(input);
  return [
    ...new Set(
      manifest.frames.flatMap((frame) => [
        ...frame.layers.map((layer) => layer.artifactId),
        ...(frame.declaredCompositeArtifactId
          ? [frame.declaredCompositeArtifactId]
          : []),
      ]),
    ),
  ].sort() as readonly ArtifactId[];
}

function familyFailure(error: SpriteFamilyError): PermanentRuntimeError {
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

export function createSpriteFamilyHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const verify: RuntimeJobHandler = async (context) => {
    let manifest;
    try {
      manifest = validateSpriteFamilyManifest(context.job.spec.payload);
    } catch (error: unknown) {
      if (error instanceof SpriteFamilyError) throw familyFailure(error);
      throw error;
    }
    for (const capability of REQUIRED_CAPABILITIES) {
      if (!context.job.spec.requiredCapabilities.includes(capability)) {
        throw new PermanentRuntimeError(
          "SPRITE_FAMILY_RUNTIME_CAPABILITY_MISSING",
          `sprite.family.verify job must require ${capability}.`,
        );
      }
    }
    const declaredInputs = new Set<ArtifactId>(context.job.spec.inputArtifacts);
    const missing = inputArtifactIds(manifest).filter(
      (artifactId) => !declaredInputs.has(artifactId),
    );
    if (missing.length) {
      throw new PermanentRuntimeError(
        "SPRITE_FAMILY_RUNTIME_INPUT_LINEAGE_MISSING",
        `sprite.family.verify inputArtifacts is missing: ${missing.join(", ")}`,
      );
    }
    try {
      const result = await verifySpriteFamily(manifest, {
        artifacts: context.artifacts,
      });
      if (!result.evidence.passed) {
        throw new PermanentRuntimeError(
          "SPRITE_FAMILY_BLOCKING_GATES_FAILED",
          "Layered sprite family failed one or more blocking consistency gates.",
          normalizeJson({
            manifestArtifactId: result.manifestArtifactId,
            evidenceArtifactId: result.evidenceArtifactId,
            generatedCompositeArtifactIds: result.generatedCompositeArtifactIds,
          }),
        );
      }
      return {
        outputArtifacts: [
          result.manifestArtifactId,
          ...result.generatedCompositeArtifactIds,
          result.evidenceArtifactId,
        ],
        result: normalizeJson(result),
      };
    } catch (error: unknown) {
      if (error instanceof SpriteFamilyError) throw familyFailure(error);
      throw error;
    }
  };
  return Object.freeze({
    "sprite.family.verify": verify,
  });
}

export function spriteFamilyWorkerCapabilities(): readonly string[] {
  return [...REQUIRED_CAPABILITIES];
}
