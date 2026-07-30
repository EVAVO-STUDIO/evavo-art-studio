import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  TargetedRepairError,
  targetedRepairProtocolSummary,
  targetedRepairRequestSha256,
  validateTargetedRepairRequest,
} from "@evavo/art-repair";

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
              error instanceof TargetedRepairError
                ? error.code
                : "TARGETED_REPAIR_TOOL_REJECTED",
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof TargetedRepairError && error.details !== undefined
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
}
