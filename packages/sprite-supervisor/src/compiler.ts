import {
  normalizeJson,
  type ArtifactId,
} from "@evavo/art-artifacts";

import { prepareSpriteSupervisorCompileInput } from "./input.js";
import {
  SPRITE_SUPERVISOR_PROTOCOL_VERSION,
  SpriteSupervisorError,
  type CompiledSpriteSupervisorWorkflow,
  type NormalizedSpriteSupervisorCompileRequest,
  type SpriteSupervisorCompileRequestInput,
} from "./types.js";
import {
  spriteSupervisorRequestSha256,
  spriteSupervisorSha256,
  validateSpriteSupervisorCompileRequest,
} from "./validation.js";

export const SPRITE_SUPERVISOR_CAPABILITIES = Object.freeze([
  "sprite.supervisor.run",
  "runtime.jobs",
  "artifacts.store",
  "evidence.bundle",
] as const);

function normalizedRequest(
  input: SpriteSupervisorCompileRequestInput | unknown,
): NormalizedSpriteSupervisorCompileRequest {
  try {
    return validateSpriteSupervisorCompileRequest(
      prepareSpriteSupervisorCompileInput(input),
    );
  } catch (error: unknown) {
    if (error instanceof SpriteSupervisorError) throw error;
    const sourceCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "UNKNOWN";
    throw new SpriteSupervisorError(
      "SPRITE_SUPERVISOR_INPUT_INVALID",
      error instanceof Error ? error.message : String(error),
      normalizeJson({ sourceCode }),
    );
  }
}

export function compileSpriteSupervisorWorkflow(
  input: SpriteSupervisorCompileRequestInput | unknown,
): CompiledSpriteSupervisorWorkflow {
  const request = normalizedRequest(input);
  const requestSha256 = spriteSupervisorRequestSha256(request);
  const initialArtifacts = request.initialArtifactBindings.flatMap(
    (binding) => binding.artifactIds,
  );
  const artDirectionArtifact = request.spritePlan.artDirectionBinding.artifactId;
  const inputArtifacts = [
    ...initialArtifacts,
    ...(artDirectionArtifact ? [artDirectionArtifact as ArtifactId] : []),
  ];
  const workflowBody = {
    schemaVersion: "1.0" as const,
    protocolVersion: SPRITE_SUPERVISOR_PROTOCOL_VERSION,
    runId: request.runId,
    requestSha256,
    request,
  };
  const workflowSha256 = spriteSupervisorSha256(workflowBody);
  return {
    ...workflowBody,
    workflowSha256,
    rootJob: {
      queue: "control",
      kind: "art.sprite-production.supervise",
      idempotencyKey: `${request.runId}:supervisor:${workflowSha256}:tick-0`,
      payload: normalizeJson({
        schemaVersion: "1.0",
        workflowSha256,
        request,
      }),
      inputArtifacts: [...new Set(inputArtifacts)].sort(),
      requiredCapabilities: SPRITE_SUPERVISOR_CAPABILITIES,
      maximumAttempts: 3,
      leaseDurationMs: 120_000,
      timeoutMs: 300_000,
      labels: {
        runId: request.runId,
        spritePlanId: request.spritePlan.planId,
        workflowSha256,
        supervisorTick: "0",
      },
    },
  };
}
