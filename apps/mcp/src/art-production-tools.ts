import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  ArtDirectionError,
  applyLayeredProductionStyleProofApproval,
  artProductionOrchestratorProtocolSummary,
  compileArtProductionHumanApprovalReceipt,
  compileArtProductionLoop,
  compileArtProductionPackagingPlan,
  compileArtProductionRuntimeAssemblyHandoff,
  compileLayeredProductionPlan,
  compileLayeredProductionStyleProofApprovalReceipt,
  compileNextArtProductionBatch,
  evaluateArtProductionAttempt,
  verifyArtProductionHumanApprovalReceiptAgainstRequest,
  verifyArtProductionLoopAgainstProfile,
  verifyArtProductionPackagingPlan,
  verifyArtProductionRuntimeAssemblyHandoff,
} from "@evavo/art-direction";
import type {
  ArtProductionAttemptInput,
  ArtProductionHumanApprovalReceipt,
  ArtProductionLoop,
  ArtProductionPackagingPlan,
  ArtProductionRuntimeAssemblyHandoff,
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
                : "ART_PRODUCTION_TOOL_REJECTED",
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

function compilePlan(
  productionRequest: unknown,
  styleProofApproval: unknown | undefined,
) {
  const pending = compileLayeredProductionPlan(productionRequest);
  if (styleProofApproval === undefined) return pending;
  const receipt = compileLayeredProductionStyleProofApprovalReceipt(
    pending,
    styleProofApproval,
  );
  return applyLayeredProductionStyleProofApproval(pending, receipt);
}

export function registerArtProductionTools(server: McpServer): void {
  server.registerTool(
    "art_production_orchestrator_protocol",
    {
      description:
        "Describe the profile-driven 1990s game-art production loop for fixed camera grammar, dependency-safe batches, deterministic candidate review, bounded repair, animation continuity, exact named-human approval receipts, source-preserving packaging and approval-bound runtime assembly handoff. No provider, creative decision, assembly or activation is executed.",
      inputSchema: z.object({}),
    },
    async () => textResult(artProductionOrchestratorProtocolSummary()),
  );

  server.registerTool(
    "compile_art_production_loop",
    {
      description:
        "Compile a self-hashed iterative production loop from an exact layered-production request and reusable game/style/camera profile. It schedules only eligible one-image source units and does not call a provider.",
      inputSchema: z.object({
        productionRequest: z.unknown(),
        profile: z.unknown(),
        styleProofApproval: z.unknown().optional(),
      }),
    },
    async ({ productionRequest, profile, styleProofApproval }) => {
      try {
        const plan = compilePlan(productionRequest, styleProofApproval);
        return textResult({
          schemaVersion: "1.0",
          productionLoop: compileArtProductionLoop(plan, profile),
          executionBoundary:
            "Plan-only: no provider call, candidate admission, image mutation, creative approval, packaging execution, target-repository mutation, Git, deployment or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "evaluate_art_production_attempt",
    {
      description:
        "Ingest exact candidate and measured QA evidence, replay the current loop, score pixel/camera/style/animation continuity, and produce either a technical pass, a bounded repair prompt, or a blocked state. This tool does not inspect or alter image bytes itself.",
      inputSchema: z.object({
        productionRequest: z.unknown(),
        profile: z.unknown(),
        loop: z.unknown(),
        attempt: z.unknown(),
        styleProofApproval: z.unknown().optional(),
      }),
    },
    async ({ productionRequest, profile, loop, attempt, styleProofApproval }) => {
      try {
        const plan = compilePlan(productionRequest, styleProofApproval);
        const productionLoop = loop as ArtProductionLoop;
        verifyArtProductionLoopAgainstProfile(plan, profile, productionLoop);
        return textResult({
          schemaVersion: "1.0",
          productionLoop: evaluateArtProductionAttempt(
            plan,
            productionLoop,
            attempt as ArtProductionAttemptInput,
          ),
          executionBoundary:
            "Evidence evaluation only: no provider call, image mutation, automatic creative approval, target-repository mutation, Git, deployment or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_next_art_production_batch",
    {
      description:
        "Compile the next dependency-safe batch, prioritising bounded repairs before new source units and binding review-passed identity or previous-frame references. Every job still requests exactly one PNG and remains unexecuted.",
      inputSchema: z.object({
        productionRequest: z.unknown(),
        profile: z.unknown(),
        loop: z.unknown(),
        styleProofApproval: z.unknown().optional(),
      }),
    },
    async ({ productionRequest, profile, loop, styleProofApproval }) => {
      try {
        const plan = compilePlan(productionRequest, styleProofApproval);
        const productionLoop = loop as ArtProductionLoop;
        verifyArtProductionLoopAgainstProfile(plan, profile, productionLoop);
        return textResult({
          schemaVersion: "1.0",
          batch: compileNextArtProductionBatch(plan, productionLoop),
          executionBoundary:
            "Batch compilation only: provider execution, candidate admission, creative approval and image mutation remain separate.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "verify_art_production_loop",
    {
      description:
        "Semantically replay and verify an iterative production loop against the exact layered-production request and game profile, including all retained review and repair transitions.",
      inputSchema: z.object({
        productionRequest: z.unknown(),
        profile: z.unknown(),
        loop: z.unknown(),
        styleProofApproval: z.unknown().optional(),
      }),
    },
    async ({ productionRequest, profile, loop, styleProofApproval }) => {
      try {
        const plan = compilePlan(productionRequest, styleProofApproval);
        const productionLoop = loop as ArtProductionLoop;
        verifyArtProductionLoopAgainstProfile(plan, profile, productionLoop);
        return textResult({
          schemaVersion: "1.0",
          loopSha256: productionLoop.loopSha256,
          status: "passed",
          executionBoundary:
            "Verification-only: no provider call, approval, image mutation, packaging execution, repository write, Git or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_art_production_human_approval_receipt",
    {
      description:
        "Compile or verify a deterministic receipt for one explicit caller-supplied named-human approval decision. The receipt binds the exact plan, loop, profile, review-passed candidate, technical-review attempt and external decision-evidence identity. This tool records the decision but does not make it.",
      inputSchema: z.object({
        productionRequest: z.unknown(),
        profile: z.unknown(),
        loop: z.unknown(),
        approvalRequest: z.unknown(),
        styleProofApproval: z.unknown().optional(),
        approvalReceipt: z.unknown().optional(),
      }),
    },
    async ({
      productionRequest,
      profile,
      loop,
      approvalRequest,
      styleProofApproval,
      approvalReceipt,
    }) => {
      try {
        const plan = compilePlan(productionRequest, styleProofApproval);
        const productionLoop = loop as ArtProductionLoop;
        verifyArtProductionLoopAgainstProfile(plan, profile, productionLoop);
        const compiled = compileArtProductionHumanApprovalReceipt(
          plan,
          productionLoop,
          approvalRequest,
        );
        if (approvalReceipt !== undefined) {
          verifyArtProductionHumanApprovalReceiptAgainstRequest(
            plan,
            productionLoop,
            approvalRequest,
            approvalReceipt,
          );
        }
        return textResult({
          schemaVersion: "1.0",
          approvalReceipt: compiled,
          status: approvalReceipt === undefined ? "compiled" : "verified",
          executionBoundary:
            "Receipt-only: the named-human decision and decision evidence are caller supplied; no provider call, image mutation, creative decision, packaging execution, repository mutation, Git, deployment or publication is performed.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_art_production_packaging_plan",
    {
      description:
        "After every source passes deterministic review and exact candidate-bound named-human approval receipts are supplied, compile individual-PNG retention plus animation strip, grid and non-rotating atlas layouts. It emits metadata only and does not pack image bytes.",
      inputSchema: z.object({
        productionRequest: z.unknown(),
        profile: z.unknown(),
        loop: z.unknown(),
        approvals: z.unknown(),
        styleProofApproval: z.unknown().optional(),
        packagingPlan: z.unknown().optional(),
      }),
    },
    async ({
      productionRequest,
      profile,
      loop,
      approvals,
      styleProofApproval,
      packagingPlan,
    }) => {
      try {
        const plan = compilePlan(productionRequest, styleProofApproval);
        const productionLoop = loop as ArtProductionLoop;
        const humanApprovals =
          approvals as readonly ArtProductionHumanApprovalReceipt[];
        verifyArtProductionLoopAgainstProfile(plan, profile, productionLoop);
        const compiled = compileArtProductionPackagingPlan(
          plan,
          productionLoop,
          humanApprovals,
        );
        if (packagingPlan !== undefined) {
          verifyArtProductionPackagingPlan(
            plan,
            productionLoop,
            humanApprovals,
            packagingPlan as ArtProductionPackagingPlan,
          );
        }
        return textResult({
          schemaVersion: "1.0",
          packagingPlan: compiled,
          status: packagingPlan === undefined ? "compiled" : "verified",
          executionBoundary:
            "Metadata-only: individual PNGs remain authoritative; no sheet or atlas pixels are written, no creative decision is made, and no repository or Git authority is granted.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_art_production_runtime_assembly_handoff",
    {
      description:
        "Compile or verify the exact metadata handoff from a reviewed Art Production loop and candidate-bound approval receipts into one runtime-candidate layered assembly manifest. Every assembly source is cross-bound to the packaging plan, technical-review attempt and complete human-approval receipt. No assembly files are written and no runtime is activated.",
      inputSchema: z.object({
        productionRequest: z.unknown(),
        profile: z.unknown(),
        loop: z.unknown(),
        approvals: z.unknown(),
        packagingPlan: z.unknown(),
        assemblyRequest: z.unknown(),
        styleProofApproval: z.unknown().optional(),
        runtimeAssemblyHandoff: z.unknown().optional(),
      }),
    },
    async ({
      productionRequest,
      profile,
      loop,
      approvals,
      packagingPlan,
      assemblyRequest,
      styleProofApproval,
      runtimeAssemblyHandoff,
    }) => {
      try {
        const plan = compilePlan(productionRequest, styleProofApproval);
        const productionLoop = loop as ArtProductionLoop;
        const humanApprovals =
          approvals as readonly ArtProductionHumanApprovalReceipt[];
        const submittedPackagingPlan =
          packagingPlan as ArtProductionPackagingPlan;
        verifyArtProductionLoopAgainstProfile(plan, profile, productionLoop);
        const compiled = compileArtProductionRuntimeAssemblyHandoff(
          plan,
          productionLoop,
          humanApprovals,
          submittedPackagingPlan,
          assemblyRequest,
        );
        if (runtimeAssemblyHandoff !== undefined) {
          verifyArtProductionRuntimeAssemblyHandoff(
            plan,
            productionLoop,
            humanApprovals,
            submittedPackagingPlan,
            assemblyRequest,
            runtimeAssemblyHandoff as ArtProductionRuntimeAssemblyHandoff,
          );
        }
        return textResult({
          schemaVersion: "1.0",
          runtimeAssemblyHandoff: compiled,
          status:
            runtimeAssemblyHandoff === undefined ? "compiled" : "verified",
          executionBoundary:
            "Handoff metadata only: no artifact bytes are read, no image or package pixels are changed, no assembly files are written, no runtime is activated, and no repository, Git, deployment or publication authority is granted.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
