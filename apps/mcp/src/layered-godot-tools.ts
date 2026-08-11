import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  ArtDirectionError,
  applyLayeredProductionStyleProofApproval,
  compileLayeredAssemblyManifest,
  compileLayeredGodotIntegrationPlan,
  compileLayeredProductionPlan,
  compileLayeredProductionStyleProofApprovalReceipt,
  layeredGodotIntegrationProtocolSummary,
  verifyLayeredAssemblyManifest,
  verifyLayeredGodotIntegrationPlan,
} from "@evavo/art-direction";
import type {
  CompiledLayeredAssemblyManifest,
  CompiledLayeredGodotIntegrationPlan,
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
                : "LAYERED_GODOT_TOOL_REJECTED",
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

function compileLayeredPlan(
  request: unknown,
  styleProofApproval: unknown | undefined,
) {
  const pendingPlan = compileLayeredProductionPlan(request);
  if (styleProofApproval === undefined) {
    return { plan: pendingPlan, approvalReceipt: null };
  }
  const approvalReceipt =
    compileLayeredProductionStyleProofApprovalReceipt(
      pendingPlan,
      styleProofApproval,
    );
  return {
    plan: applyLayeredProductionStyleProofApproval(
      pendingPlan,
      approvalReceipt,
    ),
    approvalReceipt,
  };
}

export function registerLayeredGodotTools(server: McpServer): void {
  server.registerTool(
    "layered_godot_integration_protocol",
    {
      description:
        "Describe the deterministic Godot 4.6.2 integration boundary for verified layered districts, exact TSCN and JSON drafts, pixel policy, bounded write intents and separate repository-writer/runtime-activation authority.",
      inputSchema: z.object({}),
    },
    async () => textResult(layeredGodotIntegrationProtocolSummary()),
  );

  server.registerTool(
    "compile_layered_godot_integration_plan",
    {
      description:
        "Compile and self-verify exact Godot 4.6.2 scene, route, placement, animation, camera, import-policy and handoff-manifest drafts from one verified production plan and assembly request. It returns write intents as data but never executes them.",
      inputSchema: z.object({
        productionRequest: z.unknown(),
        assemblyRequest: z.unknown(),
        godotIntegrationRequest: z.unknown(),
        styleProofApproval: z.unknown().optional(),
      }),
    },
    async ({
      productionRequest,
      assemblyRequest,
      godotIntegrationRequest,
      styleProofApproval,
    }) => {
      try {
        const { plan, approvalReceipt } = compileLayeredPlan(
          productionRequest,
          styleProofApproval,
        );
        const assemblyManifest = compileLayeredAssemblyManifest(
          plan,
          assemblyRequest,
        );
        verifyLayeredAssemblyManifest(assemblyManifest, plan);
        const godotIntegrationPlan = compileLayeredGodotIntegrationPlan(
          plan,
          assemblyManifest,
          godotIntegrationRequest,
        );
        verifyLayeredGodotIntegrationPlan(
          godotIntegrationPlan,
          plan,
          assemblyManifest,
        );
        return textResult({
          schemaVersion: "1.0",
          planId: plan.planId,
          planSha256: plan.planSha256,
          styleProofStatus: plan.styleProof.status,
          ...(approvalReceipt === null ? {} : { approvalReceipt }),
          assemblyManifest,
          godotIntegrationPlan,
          executionBoundary:
            "Draft-only: no source image reads, provider call, image mutation, creative approval, file write, target-repository mutation, Godot execution, runtime activation, commit, push, deployment or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "verify_layered_godot_integration_plan",
    {
      description:
        "Independently verify a retained Godot integration plan against the exact production plan and assembly manifest, including deterministic recompilation. It does not apply write intents or run Godot.",
      inputSchema: z.object({
        productionRequest: z.unknown(),
        assemblyManifest: z.unknown(),
        godotIntegrationPlan: z.unknown(),
        styleProofApproval: z.unknown().optional(),
      }),
    },
    async ({
      productionRequest,
      assemblyManifest,
      godotIntegrationPlan,
      styleProofApproval,
    }) => {
      try {
        const { plan, approvalReceipt } = compileLayeredPlan(
          productionRequest,
          styleProofApproval,
        );
        const assembly = assemblyManifest as CompiledLayeredAssemblyManifest;
        const integration =
          godotIntegrationPlan as CompiledLayeredGodotIntegrationPlan;
        verifyLayeredAssemblyManifest(assembly, plan);
        verifyLayeredGodotIntegrationPlan(integration, plan, assembly);
        return textResult({
          schemaVersion: "1.0",
          planId: plan.planId,
          planSha256: plan.planSha256,
          ...(approvalReceipt === null ? {} : { approvalReceipt }),
          assemblyManifestSha256: assembly.manifestSha256,
          integrationSha256: integration.integrationSha256,
          status: "passed",
          executionBoundary:
            "Verification-only: no source image reads, provider call, image mutation, creative approval, file write, target-repository mutation, Godot execution, runtime activation, commit, push, deployment or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
