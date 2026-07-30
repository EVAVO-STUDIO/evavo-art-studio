import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  CandidateSelectionError,
  promotionRequestSha256,
  selectionProtocolSummary,
  selectionRequestSha256,
  validateCandidatePromotionRequest,
  validateCandidateSelectionRequest,
} from "@evavo/art-selection";

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function toolError(error: unknown) {
  const code =
    error instanceof CandidateSelectionError
      ? error.code
      : "CANDIDATE_SELECTION_TOOL_REJECTED";
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            code,
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof CandidateSelectionError &&
            error.details !== undefined
              ? { details: error.details }
              : {}),
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function registerSelectionTools(server: McpServer): void {
  server.registerTool(
    "candidate_selection_protocol",
    {
      description:
        "List deterministic candidate metrics, optional model-evidence kinds, selection outcomes and the separate compare-and-swap promotion boundary.",
      inputSchema: z.object({}),
    },
    async () => textResult(selectionProtocolSummary()),
  );

  server.registerTool(
    "validate_candidate_selection",
    {
      description:
        "Validate one candidate-selection policy without reading artifacts or ranking images.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateCandidateSelectionRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_candidate_selection_job",
    {
      description:
        "Compile a validated candidate selection into a capability-scoped durable worker job. This tool does not decode images or approve a candidate.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        const selection = validateCandidateSelectionRequest(request);
        return textResult({
          schemaVersion: "1.0",
          request: selection,
          requestSha256: selectionRequestSha256(selection),
          executionMode: "durable-worker-only",
          runtimeJob: {
            queue: "selection",
            kind: "art.candidate.select",
            idempotencyKey: selection.selectionId,
            payload: selection,
            inputArtifacts: [
              selection.referenceArtifactId,
              ...selection.candidateArtifactIds,
              ...selection.externalEvidenceArtifactIds,
            ],
            requiredCapabilities: ["selection.compare", "evidence.bundle"],
            maximumAttempts: 1,
            leaseDurationMs: 120_000,
            timeoutMs: 900_000,
          },
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "validate_candidate_promotion",
    {
      description:
        "Validate a separate automatic or human promotion request with an explicit reference generation and candidate binding.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateCandidatePromotionRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_candidate_promotion_job",
    {
      description:
        "Compile a promotion into a capability-scoped durable job. The worker must reverify selection evidence, candidate hashes and compare-and-swap reference state.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        const promotion = validateCandidatePromotionRequest(request);
        return textResult({
          schemaVersion: "1.0",
          request: promotion,
          requestSha256: promotionRequestSha256(promotion),
          executionMode: "durable-worker-only",
          runtimeJob: {
            queue: "selection",
            kind: "art.candidate.promote",
            idempotencyKey: promotion.promotionId,
            payload: promotion,
            inputArtifacts: [
              promotion.selectionEvidenceArtifactId,
              promotion.candidateArtifactId,
            ],
            requiredCapabilities: [
              "selection.promote",
              "artifacts.store",
              "evidence.bundle",
            ],
            maximumAttempts: 1,
            leaseDurationMs: 60_000,
            timeoutMs: 300_000,
          },
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
