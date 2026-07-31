import {
  SPRITE_PLANNER_PROTOCOL_VERSION,
  type CompiledSpritePlanJob,
  type NormalizedSpritePlanCompileRequest,
  type SpritePlanCompileRequestInput,
} from "./types.js";
import { spritePlanRequestSha256, validateSpritePlanCompileRequest } from "./validation.js";

export const SPRITE_PLAN_COMPILE_CAPABILITIES = Object.freeze([
  "sprite.inventory.compile",
  "sprite.animation-matrix.compile",
  "sprite.sheet-plan.compile",
  "godot.spriteframes-plan",
  "evidence.bundle",
] as const);

export function compileSpritePlanJob(input: SpritePlanCompileRequestInput | NormalizedSpritePlanCompileRequest | unknown): CompiledSpritePlanJob {
  const request = input && typeof input === "object" && "protocolVersion" in input
    ? input as NormalizedSpritePlanCompileRequest
    : validateSpritePlanCompileRequest(input);
  const requestSha256 = spritePlanRequestSha256(request);
  return {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_PLANNER_PROTOCOL_VERSION,
    request,
    requestSha256,
    executionMode: "deterministic-compile-only",
    runtimeJob: {
      queue: "control",
      kind: "art.sprite-plan.compile",
      idempotencyKey: `sprite-plan:${request.planId}:${requestSha256}`,
      payload: request,
      inputArtifacts: request.artDirectionContractArtifactId ? [request.artDirectionContractArtifactId] : [],
      requiredCapabilities: SPRITE_PLAN_COMPILE_CAPABILITIES,
      maximumAttempts: 1,
      leaseDurationMs: 60_000,
      timeoutMs: 300_000,
      labels: {
        planId: request.planId,
        assetId: request.artDirectionContract.asset.assetId,
        artDirectionContractId: request.artDirectionContract.contractId,
      },
    },
  };
}
