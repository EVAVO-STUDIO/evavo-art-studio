import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  RepairedFamilyPromotionError,
  RepairedFamilyRankingError,
  RepairedFamilyRevisionError,
  RepairedFamilySelectionError,
  TargetedRepairError,
  compileRepairedFamilyPromotionJob,
  compileRepairedFamilyRankingJob,
  compileRepairedFamilyRevisionJob,
  compileRepairedFamilySelectionJob,
  repairedFamilyPromotionProtocolSummary,
  repairedFamilyRankingProtocolSummary,
  repairedFamilyRevisionProtocolSummary,
  repairedFamilySelectionProtocolSummary,
  targetedRepairProtocolSummary,
  targetedRepairRequestSha256,
  validateRepairedFamilyPromotionRequest,
  validateRepairedFamilyRankingRequest,
  validateRepairedFamilyRevisionRequest,
  validateRepairedFamilySelectionRequest,
  validateTargetedRepairRequest,
} from "@evavo/art-repair";

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function toolError(error: unknown) {
  const governed =
    error instanceof TargetedRepairError ||
    error instanceof RepairedFamilyRevisionError ||
    error instanceof RepairedFamilySelectionError ||
    error instanceof RepairedFamilyRankingError ||
    error instanceof RepairedFamilyPromotionError;
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            code: governed ? error.code : "TARGETED_REPAIR_TOOL_REJECTED",
            message: error instanceof Error ? error.message : String(error),
            ...(governed && error.details !== undefined
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

function runtimeJob(request: ReturnType<typeof validateTargetedRepairRequest>) {
  const inputArtifacts = [
    request.familyEvidenceArtifactId,
    ...(request.maskArtifactId ? [request.maskArtifactId] : []),
    ...request.references.map((reference) => reference.artifactId),
  ];
  return {
    queue: "selection",
    kind: "art.repair.plan",
    idempotencyKey: request.repairId,
    payload: request,
    inputArtifacts: [...new Set(inputArtifacts)].sort(),
    requiredCapabilities: [
      "repair.plan",
      "artifacts.store",
      "evidence.bundle",
    ],
    maximumAttempts: 1,
    leaseDurationMs: 60_000,
    timeoutMs: 300_000,
  } as const;
}

export function registerRepairTools(server: McpServer): void {
  server.registerTool(
    "targeted_repair_protocol",
    {
      description:
        "Describe evidence-driven frame and layer repair strategies, shared-layer impact rules and the non-approval boundary.",
      inputSchema: z.object({}),
    },
    async () => textResult(targetedRepairProtocolSummary()),
  );

  server.registerTool(
    "validate_targeted_repair_request",
    {
      description:
        "Validate one targeted repair request without reading artifacts, planning a provider call or changing any source.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateTargetedRepairRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_targeted_repair_job",
    {
      description:
        "Compile a targeted repair request into an evidence-only durable planning job. The worker later verifies family evidence and may return a blocked packet; this tool does not read pixels or execute a provider.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        const repair = validateTargetedRepairRequest(request);
        return textResult({
          schemaVersion: "1.0",
          request: repair,
          requestSha256: targetedRepairRequestSha256(repair),
          executionMode: "durable-worker-only",
          runtimeJob: runtimeJob(repair),
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "repaired_family_revision_protocol",
    {
      description:
        "Describe the immutable repaired-family revision boundary, quality gates and complete layered-family reverification requirements.",
      inputSchema: z.object({}),
    },
    async () => textResult(repairedFamilyRevisionProtocolSummary()),
  );

  server.registerTool(
    "validate_repaired_family_revision_request",
    {
      description:
        "Validate a repaired-family revision request without reading artifacts, rebuilding composites or changing a family.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateRepairedFamilyRevisionRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_repaired_family_revision_job",
    {
      description:
        "Compile a repaired-family revision into a capability-scoped durable job. This tool does not read artifacts, run frame QA, rebuild composites or approve a result.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(compileRepairedFamilyRevisionJob(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "repaired_family_revision_selection_protocol",
    {
      description:
        "Describe how multiple passed repaired-family revisions are converted into one later candidate-selection job without ranking or approval.",
      inputSchema: z.object({}),
    },
    async () => textResult(repairedFamilySelectionProtocolSummary()),
  );

  server.registerTool(
    "validate_repaired_family_revision_selection_request",
    {
      description:
        "Validate a revision-selection bridge request without reading revision evidence or selecting images.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateRepairedFamilySelectionRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_repaired_family_revision_selection_job",
    {
      description:
        "Compile a revision-selection bridge into a capability-scoped durable preparation job. The later worker verifies revision evidence and emits a separate selection job; this tool does not read artifacts or rank candidates.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(compileRepairedFamilySelectionJob(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "repaired_family_revision_ranking_protocol",
    {
      description:
        "Describe how a verified revision-selection bridge is ranked and wrapped in immutable revision-bound evidence without promotion authority.",
      inputSchema: z.object({}),
    },
    async () => textResult(repairedFamilyRankingProtocolSummary()),
  );

  server.registerTool(
    "validate_repaired_family_revision_ranking_request",
    {
      description:
        "Validate a revision-bound ranking request without reading bridge evidence or comparing images.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateRepairedFamilyRankingRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_repaired_family_revision_ranking_job",
    {
      description:
        "Compile a revision-bound ranking request into a capability-scoped durable job. The worker later verifies bridge provenance and runs deterministic selection; this tool does not read artifacts, rank images or promote results.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(compileRepairedFamilyRankingJob(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "repaired_family_revision_promotion_protocol",
    {
      description:
        "Describe promotion of the highest-ranked repaired candidate through revision-bound evidence and stale-generation compare-and-swap governance.",
      inputSchema: z.object({}),
    },
    async () => textResult(repairedFamilyPromotionProtocolSummary()),
  );

  server.registerTool(
    "validate_repaired_family_revision_promotion_request",
    {
      description:
        "Validate a revision-bound promotion request without reading ranking evidence or changing an approved reference.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateRepairedFamilyPromotionRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_repaired_family_revision_promotion_job",
    {
      description:
        "Compile a revision-bound promotion request into a capability-scoped durable job. The later worker verifies ranking evidence and uses the existing compare-and-swap promotion transaction; this tool does not read artifacts or update references.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(compileRepairedFamilyPromotionJob(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
