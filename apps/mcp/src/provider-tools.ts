import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  ProviderError,
  compileProviderCandidatePrompt,
  providerProtocolSummary,
  providerRequestSha256,
  validateProviderCandidateRequest,
} from "@evavo/art-providers";

import { registerSelectionTools } from "./selection-tools.js";

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function toolError(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            code:
              error instanceof ProviderError
                ? error.code
                : "PROVIDER_CONTRACT_REJECTED",
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      },
    ],
  };
}

function compiledValue(input: unknown) {
  const request = validateProviderCandidateRequest(input);
  const prompt = compileProviderCandidatePrompt(request);
  return {
    schemaVersion: "1.0",
    request,
    requestSha256: providerRequestSha256(request),
    compiledPrompt: prompt.text,
    compiledPromptSha256: prompt.sha256,
    runtimeJob: {
      queue: "provider",
      kind: `art.candidate.${request.operation}`,
      idempotencyKey: `provider:${request.requestId}`,
      payload: request,
      requiredCapabilities: [
        `provider.${request.operation}`,
        "provider.reference-lock",
        "provider.candidate-store",
        "evidence.bundle",
      ],
      maximumAttempts: 3,
      leaseDurationMs: 300_000,
      timeoutMs: 1_800_000,
      labels: {
        providerRequestId: request.requestId,
        candidateFamilyId: request.candidateFamilyId,
        assetId: request.assetId,
        continuityPhase: request.continuityPhase,
      },
    },
    executionMode: "submit-runtime-job",
  };
}

export function registerProviderTools(server: McpServer): void {
  registerSelectionTools(server);

  server.registerTool(
    "provider_candidate_protocol",
    {
      description:
        "Describe the governed generation, edit and inpaint candidate protocol, continuity reference roles and non-final-output rules without calling a provider.",
      inputSchema: z.object({}),
    },
    async () => textResult(providerProtocolSummary()),
  );

  server.registerTool(
    "validate_provider_candidate_request",
    {
      description:
        "Validate and normalize one bounded provider candidate request. Continuity-locked sprite work requires canonical identity references; in-betweens require both neighbouring key poses; inpainting requires a base image and mask.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateProviderCandidateRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_provider_candidate_request",
    {
      description:
        "Compile a provider-neutral candidate request into its deterministic prompt, hashes and ready-to-submit durable runtime job. This tool never calls an external model.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(compiledValue(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
