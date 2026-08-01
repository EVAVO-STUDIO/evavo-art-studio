import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
import {
  compileSpriteProductionPlan,
  spritePlanSha256,
  type CompiledSpriteProductionPlan,
} from "@evavo/art-sprite-planner";

import {
  AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
  type AutomaticSpriteWorkflowCompileRequestInput,
  type NormalizedAutomaticSpriteWorkflowCompileRequest,
} from "./automatic-types.js";
import { SpriteSupervisorError } from "./types.js";
import { spriteSupervisorSha256 } from "./validation.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_ROLE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

function fail(code: string, message: string, details?: JsonValue): never {
  throw new SpriteSupervisorError(code, message, details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail("AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID", `${name} must be an object.`);
  }
  return value;
}

function text(
  value: unknown,
  name: string,
  fallback?: string,
  maximum = 4_096,
): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") {
    fail("AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID", `${name} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0")) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      `${name} must contain 1 to ${maximum} safe characters.`,
    );
  }
  return normalized;
}

function safeId(value: unknown, name: string): string {
  const normalized = text(value, name, undefined, 128);
  if (!SAFE_ID.test(normalized)) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      `${name} must be a safe identifier.`,
    );
  }
  return normalized;
}

function artifactId(value: unknown, name: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      `${name} must use artifact_<sha256> format.`,
    );
  }
  return value as ArtifactId;
}

function integer(
  value: unknown,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const resolved = value === undefined ? fallback : value;
  if (
    typeof resolved !== "number" ||
    !Number.isInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return resolved;
}

function booleanValue(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      `${name} must be a boolean.`,
    );
  }
  return value;
}

function strings(
  value: unknown,
  name: string,
  maximumItems: number,
): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      `${name} must contain no more than ${maximumItems} strings.`,
    );
  }
  const output = value.map((entry, index) =>
    safeId(entry, `${name}[${index}]`),
  );
  if (new Set(output).size !== output.length) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      `${name} must not contain duplicates.`,
    );
  }
  return output;
}

function safeNamespace(value: unknown): string {
  const normalized = text(value, "promotion.namespace", undefined, 512)
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "");
  const segments = normalized.split("/");
  if (
    !segments.length ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !SAFE_ID.test(segment),
    )
  ) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      "promotion.namespace must contain safe slash-separated segments.",
    );
  }
  return segments.join("/");
}

function verifyCompiledPlan(value: unknown): CompiledSpriteProductionPlan {
  const plan = record(value, "spritePlan") as unknown as CompiledSpriteProductionPlan;
  if (
    plan.schemaVersion !== "1.0" ||
    typeof plan.protocolVersion !== "string" ||
    typeof plan.planId !== "string" ||
    !SAFE_ID.test(plan.planId) ||
    typeof plan.planSha256 !== "string" ||
    !SHA256.test(plan.planSha256) ||
    !Array.isArray(plan.frames) ||
    !Array.isArray(plan.clips) ||
    !Array.isArray(plan.directions) ||
    !Array.isArray(plan.layers) ||
    !isRecord(plan.asset) ||
    !isRecord(plan.project)
  ) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_PLAN_INVALID",
      "spritePlan must be a complete compiled sprite-production plan.",
    );
  }
  const { planSha256, ...body } = plan;
  const calculated = spritePlanSha256(body);
  if (calculated !== planSha256) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_PLAN_HASH_MISMATCH",
      "The compiled sprite plan does not match its declared SHA-256.",
      normalizeJson({ declared: planSha256, calculated }),
    );
  }
  return plan;
}

function resolvePlan(root: Record<string, unknown>): CompiledSpriteProductionPlan {
  const hasPlan = root.spritePlan !== undefined;
  const hasRequest = root.spritePlanRequest !== undefined;
  if (hasPlan === hasRequest) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_PLAN_SOURCE_INVALID",
      "Provide exactly one of spritePlan or spritePlanRequest.",
    );
  }
  if (hasPlan) return verifyCompiledPlan(root.spritePlan);
  try {
    return compileSpriteProductionPlan(root.spritePlanRequest);
  } catch (error: unknown) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_PLAN_COMPILE_FAILED",
      error instanceof Error ? error.message : String(error),
      normalizeJson({
        sourceCode:
          error && typeof error === "object" && "code" in error
            ? String((error as { code: unknown }).code)
            : "UNKNOWN",
      }),
    );
  }
}

function layerReferences(value: unknown): Readonly<Record<string, ArtifactId>> {
  if (value === undefined) return {};
  const input = record(value, "references.layerReferenceArtifactIds");
  const output: Record<string, ArtifactId> = {};
  const entries = Object.entries(input);
  if (entries.length > 64) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      "references.layerReferenceArtifactIds must contain no more than 64 roles.",
    );
  }
  for (const [role, candidate] of entries) {
    if (!SAFE_ROLE.test(role)) {
      fail(
        "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
        `Layer reference role is not safe: ${role}`,
      );
    }
    output[role] = artifactId(
      candidate,
      `references.layerReferenceArtifactIds.${role}`,
    );
  }
  return Object.freeze(output);
}

export function validateAutomaticSpriteWorkflowRequest(
  input: AutomaticSpriteWorkflowCompileRequestInput | unknown,
): NormalizedAutomaticSpriteWorkflowCompileRequest {
  const root = record(input, "request");
  if (root.schemaVersion !== "1.0") {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      'schemaVersion must be "1.0".',
    );
  }
  const references = record(root.references, "references");
  const provider =
    root.provider === undefined ? {} : record(root.provider, "provider");
  const promotion = record(root.promotion, "promotion");
  const policyInput =
    root.policy === undefined ? {} : record(root.policy, "policy");
  const matteColour = text(
    provider.matteColour,
    "provider.matteColour",
    "#00ff00",
    7,
  ).toLowerCase();
  if (!HEX_COLOUR.test(matteColour)) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      "provider.matteColour must use #RRGGBB format.",
    );
  }
  const quality = provider.quality === undefined ? "high" : provider.quality;
  if (quality !== "draft" && quality !== "standard" && quality !== "high") {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      "provider.quality is unsupported.",
    );
  }
  const resampling =
    provider.resampling === undefined ? "nearest" : provider.resampling;
  if (resampling !== "nearest" && resampling !== "lanczos3") {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      "provider.resampling must be nearest or lanczos3.",
    );
  }
  const allowedAdapterIds = strings(
    provider.allowedAdapterIds,
    "provider.allowedAdapterIds",
    32,
  );
  const preferredAdapterId =
    provider.preferredAdapterId === undefined
      ? undefined
      : safeId(provider.preferredAdapterId, "provider.preferredAdapterId");
  if (
    preferredAdapterId &&
    allowedAdapterIds.length > 0 &&
    !allowedAdapterIds.includes(preferredAdapterId)
  ) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      "provider.preferredAdapterId must be present in allowedAdapterIds.",
    );
  }
  const preferredModel =
    provider.preferredModel === undefined
      ? undefined
      : safeId(provider.preferredModel, "provider.preferredModel");
  const referencePrefix = text(
    promotion.referencePrefix,
    "promotion.referencePrefix",
    "sprite",
    128,
  )
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!referencePrefix || !SAFE_ID.test(referencePrefix)) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      "promotion.referencePrefix must normalize to one safe identifier.",
    );
  }

  const includeDirectionMasters = booleanValue(
    policyInput.includeDirectionMasters,
    "policy.includeDirectionMasters",
    true,
  );
  const includeKeyPoses = booleanValue(
    policyInput.includeKeyPoses,
    "policy.includeKeyPoses",
    true,
  );
  const includeInBetweens = booleanValue(
    policyInput.includeInBetweens,
    "policy.includeInBetweens",
    true,
  );
  const includeFamilyVerification = booleanValue(
    policyInput.includeFamilyVerification,
    "policy.includeFamilyVerification",
    true,
  );
  if (!includeDirectionMasters || !includeKeyPoses || !includeInBetweens) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_COMPLETE_FRAME_COVERAGE_REQUIRED",
      "Automatic release requires direction masters, every key pose, and every authored in-between. Partial frame families may be planned separately but cannot enter the automatic release compiler.",
      normalizeJson({
        includeDirectionMasters,
        includeKeyPoses,
        includeInBetweens,
      }),
    );
  }
  if (!includeFamilyVerification) {
    fail(
      "AUTOMATIC_SPRITE_WORKFLOW_FAMILY_VERIFICATION_REQUIRED",
      "Automatic release requires complete layered-family verification.",
    );
  }

  const metadata =
    root.metadata === undefined ? undefined : normalizeJson(root.metadata);
  return {
    schemaVersion: "1.0",
    protocolVersion: AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
    runId: safeId(root.runId, "runId"),
    spritePlan: resolvePlan(root),
    references: {
      canonicalIdentityArtifactId: artifactId(
        references.canonicalIdentityArtifactId,
        "references.canonicalIdentityArtifactId",
      ),
      ...(references.paletteReferenceArtifactId === undefined
        ? {}
        : {
            paletteReferenceArtifactId: artifactId(
              references.paletteReferenceArtifactId,
              "references.paletteReferenceArtifactId",
            ),
          }),
      ...(references.lineReferenceArtifactId === undefined
        ? {}
        : {
            lineReferenceArtifactId: artifactId(
              references.lineReferenceArtifactId,
              "references.lineReferenceArtifactId",
            ),
          }),
      ...(references.materialReferenceArtifactId === undefined
        ? {}
        : {
            materialReferenceArtifactId: artifactId(
              references.materialReferenceArtifactId,
              "references.materialReferenceArtifactId",
            ),
          }),
      layerReferenceArtifactIds: layerReferences(
        references.layerReferenceArtifactIds,
      ),
    },
    provider: {
      candidatesPerUnit: integer(
        provider.candidatesPerUnit,
        "provider.candidatesPerUnit",
        3,
        2,
        8,
      ),
      ...(preferredAdapterId === undefined ? {} : { preferredAdapterId }),
      ...(preferredModel === undefined ? {} : { preferredModel }),
      allowedAdapterIds,
      allowFallback: booleanValue(
        provider.allowFallback,
        "provider.allowFallback",
        false,
      ),
      matteColour,
      quality,
      resampling,
    },
    promotion: {
      namespace: safeNamespace(promotion.namespace),
      referencePrefix,
      expectedGeneration: integer(
        promotion.expectedGeneration,
        "promotion.expectedGeneration",
        0,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      actor: text(promotion.actor, "promotion.actor", undefined, 256),
      automatic: booleanValue(
        promotion.automatic,
        "promotion.automatic",
        true,
      ),
    },
    policy: {
      maximumTasks: integer(
        policyInput.maximumTasks,
        "policy.maximumTasks",
        10_000,
        1,
        10_000,
      ),
      maximumProductionUnits: integer(
        policyInput.maximumProductionUnits,
        "policy.maximumProductionUnits",
        2_000,
        1,
        10_000,
      ),
      includeDirectionMasters,
      includeKeyPoses,
      includeInBetweens,
      includeSeparateVisibleLayers: booleanValue(
        policyInput.includeSeparateVisibleLayers,
        "policy.includeSeparateVisibleLayers",
        true,
      ),
      includeFamilyVerification,
      requireFinalHumanApproval: booleanValue(
        policyInput.requireFinalHumanApproval,
        "policy.requireFinalHumanApproval",
        false,
      ),
      failOnDerivedDirections: booleanValue(
        policyInput.failOnDerivedDirections,
        "policy.failOnDerivedDirections",
        true,
      ),
      failOnMissingLayerReferences: booleanValue(
        policyInput.failOnMissingLayerReferences,
        "policy.failOnMissingLayerReferences",
        true,
      ),
    },
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function automaticSpriteWorkflowRequestSha256(
  request: NormalizedAutomaticSpriteWorkflowCompileRequest,
): string {
  return spriteSupervisorSha256(request);
}
