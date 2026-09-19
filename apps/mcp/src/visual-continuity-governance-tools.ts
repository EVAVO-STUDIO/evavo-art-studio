import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  ArtDirectionError,
  compileApprovedVisualContinuityStudioHandoff,
  compileVisualContinuityApprovalReceipt,
  evaluateVisualContinuityWorkPacketBatch,
  verifyApprovedVisualContinuityStudioHandoff,
  verifyVisualContinuityApprovalReceipt,
  visualContinuityHardeningSummary,
} from "@evavo/art-direction";
import type {
  ApprovedVisualContinuityStudioHandoff,
  CompiledVisualContinuityBible,
  CompiledVisualContinuitySession,
  VisualContinuityApprovalReceipt,
  VisualContinuityWorkPacket,
} from "@evavo/art-direction";

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
              error instanceof ArtDirectionError
                ? error.code
                : "VISUAL_CONTINUITY_GOVERNANCE_TOOL_REJECTED",
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof ArtDirectionError && error.details !== undefined
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

export function registerVisualContinuityGovernanceTools(
  server: McpServer,
): void {
  server.registerTool(
    "visual_continuity_hardening_protocol",
    {
      description:
        "Describe the fail-closed continuity guarantees for atomic multi-job evaluation, one-candidate admission, exact map and material context, named-human approval receipts and receiver-verified cross-studio handoff. No provider, mutation, approval decision or publication is executed.",
      inputSchema: z.object({}),
    },
    async () => textResult(visualContinuityHardeningSummary()),
  );

  server.registerTool(
    "evaluate_visual_continuity_packet_batch",
    {
      description:
        "Evaluate exactly one evidence packet for every job in a multi-job visual continuity packet, then commit all state transitions atomically so the first result cannot stale unfinished jobs. Image bytes are not inspected or changed by this tool.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        packet: z.unknown(),
        attempts: z.unknown(),
      }),
    },
    async ({ bible, session, packet, attempts }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          session: evaluateVisualContinuityWorkPacketBatch(
            bible as CompiledVisualContinuityBible,
            session as CompiledVisualContinuitySession,
            packet as VisualContinuityWorkPacket,
            attempts,
          ),
          executionBoundary:
            "Evidence evaluation only: no provider call, image inspection, image mutation, automatic approval, canon mutation, repository write, Git operation or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_visual_continuity_approval_receipt",
    {
      description:
        "Compile a deterministic named-human creative decision receipt bound to the exact technically accepted candidate, review attempt, work-item context and external decision evidence. The decision is supplied by the caller; this tool never makes it.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        approval: z.unknown(),
      }),
    },
    async ({ bible, session, approval }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          approvalReceipt: compileVisualContinuityApprovalReceipt(
            bible as CompiledVisualContinuityBible,
            session as CompiledVisualContinuitySession,
            approval,
          ),
          executionBoundary:
            "Receipt compilation only: the named-human decision and evidence are caller supplied; no automatic creative approval, image mutation, canon mutation, repository write or publication occurs.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "verify_visual_continuity_approval_receipt",
    {
      description:
        "Verify a named-human continuity approval receipt against the exact bible, session, accepted artifact and technical-review attempt.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        approvalReceipt: z.unknown(),
      }),
    },
    async ({ bible, session, approvalReceipt }) => {
      try {
        const receipt = approvalReceipt as VisualContinuityApprovalReceipt;
        verifyVisualContinuityApprovalReceipt(
          bible as CompiledVisualContinuityBible,
          session as CompiledVisualContinuitySession,
          receipt,
        );
        return textResult({
          schemaVersion: "1.0",
          status: "passed",
          workItemId: receipt.workItemId,
          candidateSha256: receipt.candidateSha256,
          approvalSha256: receipt.approvalSha256,
          executionBoundary: "Verification only; no source or target is changed.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_approved_visual_continuity_handoff",
    {
      description:
        "Compile a release-grade cross-studio continuity handoff only when every selected source has a matching approved named-human receipt. The result distinguishes a live downstream receiver from a contract-only route and still grants no target execution or publication authority.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        approvedHandoff: z.unknown(),
      }),
    },
    async ({ bible, session, approvedHandoff }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          handoff: compileApprovedVisualContinuityStudioHandoff(
            bible as CompiledVisualContinuityBible,
            session as CompiledVisualContinuitySession,
            approvedHandoff,
          ),
          executionBoundary:
            "Approved metadata handoff only: no source mutation, automatic approval, target-repository mutation, receiver execution, runtime activation or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "verify_approved_visual_continuity_handoff",
    {
      description:
        "Verify a release-grade visual continuity handoff, every source-bound approval receipt, receiver route and deterministic handoff hash against the current bible and session.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        handoff: z.unknown(),
      }),
    },
    async ({ bible, session, handoff }) => {
      try {
        const compiled = handoff as ApprovedVisualContinuityStudioHandoff;
        verifyApprovedVisualContinuityStudioHandoff(
          bible as CompiledVisualContinuityBible,
          session as CompiledVisualContinuitySession,
          compiled,
        );
        return textResult({
          schemaVersion: "1.0",
          status: "passed",
          targetStudio: compiled.targetStudio,
          sourceCount: compiled.sources.length,
          approvalCount: compiled.approvalReceipts.length,
          receiverRoute: compiled.receiverRoute,
          handoffSha256: compiled.handoffSha256,
          executionBoundary: "Verification only; no receiver or target action is executed.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
