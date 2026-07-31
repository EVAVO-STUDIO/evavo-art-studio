import { artDirectionSha256, validateArtDirectionCompileRequest } from "./validation.js";
import {
  ART_DIRECTION_PROTOCOL_VERSION,
  type ArtDirectionCompileRequestInput,
  type CompiledArtDirectionJob,
} from "./types.js";

export const ART_DIRECTION_COMPILE_CAPABILITIES = Object.freeze([
  "art-direction.compile",
  "style.preset.resolve",
  "output-profile.compile",
  "evidence.bundle",
] as const);

export function compileArtDirectionJob(
  input: ArtDirectionCompileRequestInput | unknown,
): CompiledArtDirectionJob {
  const request = validateArtDirectionCompileRequest(input);
  const requestSha256 = artDirectionSha256(request);
  return {
    schemaVersion: "1.0",
    protocolVersion: ART_DIRECTION_PROTOCOL_VERSION,
    request,
    requestSha256,
    executionMode: "deterministic-compile-only",
    runtimeJob: {
      queue: "control",
      kind: "art.direction.compile",
      idempotencyKey: `art-direction:${request.contractId}:${requestSha256}`,
      payload: request,
      inputArtifacts: [],
      requiredCapabilities: ART_DIRECTION_COMPILE_CAPABILITIES,
      maximumAttempts: 1,
      leaseDurationMs: 60_000,
      timeoutMs: 300_000,
      labels: {
        contractId: request.contractId,
        assetId: request.asset.assetId,
        projectId: request.project.projectId,
      },
    },
  };
}
