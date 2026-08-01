import { normalizeJson } from "@evavo/art-artifacts";
import {
  artDirectionSha256,
  compileArtDirectionContract,
  type CompiledArtDirectionContract,
} from "@evavo/art-direction";
import type { CompiledSpriteProductionPlan } from "@evavo/art-sprite-planner";

import { SpriteSupervisorError } from "./types.js";

const SHA256 = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function verifyCompiledArtDirection(value: unknown): CompiledArtDirectionContract {
  if (!isRecord(value)) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_ART_DIRECTION_INVALID",
      "artDirectionContract must be a compiled art-direction object.",
    );
  }
  const contract = value as unknown as CompiledArtDirectionContract;
  if (
    contract.schemaVersion !== "1.0" ||
    typeof contract.protocolVersion !== "string" ||
    typeof contract.contractId !== "string" ||
    typeof contract.contractSha256 !== "string" ||
    !SHA256.test(contract.contractSha256) ||
    !isRecord(contract.project) ||
    !isRecord(contract.style) ||
    !isRecord(contract.asset) ||
    !isRecord(contract.production) ||
    !Array.isArray(contract.outputs)
  ) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_ART_DIRECTION_INVALID",
      "artDirectionContract is missing required compiled fields.",
    );
  }
  const { contractSha256, ...body } = contract;
  const calculated = artDirectionSha256(body);
  if (calculated !== contractSha256) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_ART_DIRECTION_HASH_MISMATCH",
      "The supplied art-direction contract does not match its declared SHA-256.",
      normalizeJson({ declared: contractSha256, calculated }),
    );
  }
  return contract;
}

function inferredSource(input: Record<string, unknown>): Readonly<{
  contract?: unknown;
  request?: unknown;
}> {
  if (input.artDirectionContract !== undefined || input.artDirectionRequest !== undefined) {
    return {
      ...(input.artDirectionContract === undefined
        ? {}
        : { contract: input.artDirectionContract }),
      ...(input.artDirectionRequest === undefined
        ? {}
        : { request: input.artDirectionRequest }),
    };
  }
  if (!isRecord(input.spritePlanRequest)) return {};
  return {
    ...(input.spritePlanRequest.artDirectionContract === undefined
      ? {}
      : { contract: input.spritePlanRequest.artDirectionContract }),
    ...(input.spritePlanRequest.artDirectionRequest === undefined
      ? {}
      : { request: input.spritePlanRequest.artDirectionRequest }),
  };
}

export function resolveAutomaticArtDirection(
  input: unknown,
  plan: CompiledSpriteProductionPlan,
): CompiledArtDirectionContract {
  if (!isRecord(input)) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_REQUEST_INVALID",
      "Automatic sprite workflow request must be an object.",
    );
  }
  const source = inferredSource(input);
  const hasContract = source.contract !== undefined;
  const hasRequest = source.request !== undefined;
  if (hasContract === hasRequest) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_ART_DIRECTION_REQUIRED",
      "Provide exactly one artDirectionContract or artDirectionRequest, directly or inside spritePlanRequest.",
    );
  }
  let contract: CompiledArtDirectionContract;
  if (hasContract) {
    contract = verifyCompiledArtDirection(source.contract);
  } else {
    try {
      contract = compileArtDirectionContract(source.request);
    } catch (error: unknown) {
      throw new SpriteSupervisorError(
        "AUTOMATIC_SPRITE_WORKFLOW_ART_DIRECTION_COMPILE_FAILED",
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
  if (
    contract.contractId !== plan.artDirectionBinding.contractId ||
    contract.contractSha256 !== plan.artDirectionBinding.contractSha256 ||
    contract.protocolVersion !== plan.artDirectionBinding.protocolVersion
  ) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_ART_DIRECTION_BINDING_MISMATCH",
      "The verified art-direction contract does not match the exact binding compiled into the sprite plan.",
      normalizeJson({
        plan: plan.artDirectionBinding,
        supplied: {
          contractId: contract.contractId,
          contractSha256: contract.contractSha256,
          protocolVersion: contract.protocolVersion,
        },
      }),
    );
  }
  return contract;
}
