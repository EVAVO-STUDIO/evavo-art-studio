import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  ArtDirectionError,
  applyLayeredProductionStyleProofApproval,
  artDirectionProtocolSummary,
  compileArtDirectionContract,
  compileArtDirectionJob,
  compileLayeredAssemblyManifest,
  compileLayeredProductionPlan,
  compileLayeredProductionStyleProofApprovalReceipt,
  compileLayeredProviderCandidateRequest,
  getLayeredProductionUnit,
  layeredAssemblyProtocolSummary,
  layeredProductionProtocolSummary,
  listArtDirectionOutputProfiles,
  listArtDirectionPresets,
  validateArtDirectionCompileRequest,
  validateLayeredProductionRequest,
  verifyLayeredAssemblyManifest,
} from "@evavo/art-direction";
import type { LayeredProviderReferenceInput } from "@evavo/art-direction";
import {
  ProviderError,
  compileProviderCandidateRuntimeContract,
} from "@evavo/art-providers";

import { registerSpritePlanTools } from "./sprite-plan-tools.js";

const ART_DIRECTION_COMPILE_JOB_KINDS = [
  "art.direction.compile",
  "art-direction.compile",
  "style.preset.resolve",
  "output-profile.compile",
] as const;

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
                : error instanceof ProviderError
                  ? error.code
                  : "ART_DIRECTION_TOOL_REJECTED",
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

export function registerArtDirectionTools(server: McpServer): void {
  registerSpritePlanTools(server);

  server.registerTool(
    "art_direction_protocol",
    {
      description:
        "List governed 1990s, isometric, pre-rendered 2.5D and historical style rules, sprite-layer decisions, Godot output profiles and the provider-free compilation boundary.",
      inputSchema: z.object({}),
    },
    async () => textResult(artDirectionProtocolSummary()),
  );

  server.registerTool(
    "layered_production_protocol",
    {
      description:
        "Describe the runtime-source boundary for layered game art: one exclusive source image per provider job, content-addressed style-proof approval before expansion, approval-gated assembly and anti-collage/anti-generic rules.",
      inputSchema: z.object({}),
    },
    async () => textResult(layeredProductionProtocolSummary()),
  );

  server.registerTool(
    "layered_assembly_protocol",
    {
      description:
        "Describe the logical district-assembly boundary for separate source layers, route graphs, placements, Y-sort, animation sets, foreground occlusion and integer camera zoom. This tool has no provider, approval, image mutation or repository-write authority.",
      inputSchema: z.object({}),
    },
    async () => textResult(layeredAssemblyProtocolSummary()),
  );

  server.registerTool(
    "list_art_direction_presets",
    {
      description:
        "List production-method presets that describe rendering, camera, palette, motion and anti-generic constraints without using a named game or artist as a style shortcut.",
      inputSchema: z.object({}),
    },
    async () =>
      textResult({ schemaVersion: "1.0", presets: listArtDirectionPresets() }),
  );

  server.registerTool(
    "list_art_direction_output_profiles",
    {
      description:
        "List Godot 4.6.2, web, cinematic and print delivery profiles including source retention, atlas policy, metadata and import recommendations.",
      inputSchema: z.object({}),
    },
    async () =>
      textResult({
        schemaVersion: "1.0",
        outputProfiles: listArtDirectionOutputProfiles(),
      }),
  );

  server.registerTool(
    "validate_art_direction_request",
    {
      description:
        "Validate one style-bible request, including preset locks, isometric 2:1 geometry, direction ownership, layer overrides and output compatibility. This tool does not read artifacts or call a provider.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateArtDirectionCompileRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_art_direction_contract",
    {
      description:
        "Compile a deterministic style bible, sprite-shot grammar, layer ownership plan, quality gates, output profiles and an art.direction.compile control job. Candidate generation, QA, selection and promotion remain separate.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          compiledContract: compileArtDirectionContract(request),
          compiledJob: compileArtDirectionJob(request),
          compileJobKinds: ART_DIRECTION_COMPILE_JOB_KINDS,
          executionBoundary:
            "Compile-only: no artifact reads, provider execution, media generation, worker execution, approval or named-reference mutation.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "validate_layered_production_request",
    {
      description:
        "Validate a scene or district source plan before any image generation. It rejects concept collages, multi-image provider calls, mixed layer ownership, loose pixel style, unsafe paths, incomplete style-proof coverage and insecure inline approval.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateLayeredProductionRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_layered_style_proof_approval",
    {
      description:
        "Seal an already-made named human style-proof decision into a deterministic receipt bound to the exact pending plan, source PNG artifact hashes, provider jobs, sealed per-unit review receipts, review bundles and cross-unit style evidence. This tool does not inspect images or make the creative decision itself.",
      inputSchema: z.object({
        request: z.unknown(),
        approvalEvidence: z.unknown(),
      }),
    },
    async ({ request, approvalEvidence }) => {
      try {
        const pendingPlan = compileLayeredProductionPlan(request);
        const approvalReceipt =
          compileLayeredProductionStyleProofApprovalReceipt(
            pendingPlan,
            approvalEvidence,
          );
        const approvedPlan = applyLayeredProductionStyleProofApproval(
          pendingPlan,
          approvalReceipt,
        );
        return textResult({
          schemaVersion: "1.0",
          pendingPlanSha256: pendingPlan.planSha256,
          approvalReceipt,
          approvedPlan,
          executionBoundary:
            "Evidence-sealing only: the named human decision and external review hashes must already exist. No image inspection, creative approval, provider call, assembly, promotion, repository mutation, commit, push or publication is performed.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_layered_production_plan",
    {
      description:
        "Compile a deterministic layered runtime-source plan. Every unit becomes one provider-ready image job with exclusive layer ownership, exact dimensions, alpha policy, anti-generic style locks, review gates and approval-gated assembly metadata. Optional style-proof approval evidence is sealed into a verified receipt; this tool does not execute a provider.",
      inputSchema: z.object({
        request: z.unknown(),
        styleProofApproval: z.unknown().optional(),
      }),
    },
    async ({ request, styleProofApproval }) => {
      try {
        const { plan, approvalReceipt } = compileLayeredPlan(
          request,
          styleProofApproval,
        );
        return textResult({
          schemaVersion: "1.0",
          compiledPlan: plan,
          ...(approvalReceipt === null ? {} : { approvalReceipt }),
          executionBoundary:
            "Plan-only: no image generation, image inspection, creative approval, composite assembly, target-repository mutation, commit, push or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_layered_assembly_manifest",
    {
      description:
        "Compile and self-verify a logical district assembly from an exact layered-production plan plus candidate or approved source bindings. It validates native placement, route reachability, travel costs, animation completeness, Y-sort, occlusion and integer camera zoom without reading or combining image bytes.",
      inputSchema: z.object({
        productionRequest: z.unknown(),
        assemblyRequest: z.unknown(),
        styleProofApproval: z.unknown().optional(),
      }),
    },
    async ({ productionRequest, assemblyRequest, styleProofApproval }) => {
      try {
        const { plan, approvalReceipt } = compileLayeredPlan(
          productionRequest,
          styleProofApproval,
        );
        const manifest = compileLayeredAssemblyManifest(plan, assemblyRequest);
        verifyLayeredAssemblyManifest(manifest, plan);
        return textResult({
          schemaVersion: "1.0",
          planId: plan.planId,
          planSha256: plan.planSha256,
          styleProofStatus: plan.styleProof.status,
          ...(approvalReceipt === null ? {} : { approvalReceipt }),
          assemblyManifest: manifest,
          executionBoundary:
            "Manifest-only: no provider call, image reads, image mutation, creative approval, composite rendering, Godot scene write, target-repository mutation, commit, push or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "verify_layered_assembly_manifest",
    {
      description:
        "Semantically verify a retained self-hashed layered assembly manifest against the exact production plan. It does not read source artifacts or grant runtime approval.",
      inputSchema: z.object({
        productionRequest: z.unknown(),
        assemblyManifest: z.unknown(),
        styleProofApproval: z.unknown().optional(),
      }),
    },
    async ({ productionRequest, assemblyManifest, styleProofApproval }) => {
      try {
        const { plan, approvalReceipt } = compileLayeredPlan(
          productionRequest,
          styleProofApproval,
        );
        verifyLayeredAssemblyManifest(
          assemblyManifest as ReturnType<typeof compileLayeredAssemblyManifest>,
          plan,
        );
        return textResult({
          schemaVersion: "1.0",
          planId: plan.planId,
          planSha256: plan.planSha256,
          ...(approvalReceipt === null ? {} : { approvalReceipt }),
          manifestSha256: (
            assemblyManifest as ReturnType<typeof compileLayeredAssemblyManifest>
          ).manifestSha256,
          status: "passed",
          executionBoundary:
            "Verification-only: no source artifact reads, provider call, image mutation, creative approval, scene assembly, target-repository mutation, commit, push or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_layered_production_unit",
    {
      description:
        "Compile a layered plan and return one exact one-image provider job by unit ID. Expansion beyond the proof set requires exact content-addressed style-proof approval evidence. Use this instead of asking a provider for a concept sheet or flattened scene.",
      inputSchema: z.object({
        request: z.unknown(),
        unitId: z.string().min(1).max(160),
        styleProofApproval: z.unknown().optional(),
      }),
    },
    async ({ request, unitId, styleProofApproval }) => {
      try {
        const { plan, approvalReceipt } = compileLayeredPlan(
          request,
          styleProofApproval,
        );
        return textResult({
          schemaVersion: "1.0",
          planId: plan.planId,
          planSha256: plan.planSha256,
          styleProofStatus: plan.styleProof.status,
          ...(approvalReceipt === null ? {} : { approvalReceipt }),
          unit: getLayeredProductionUnit(plan, unitId),
          executionBoundary:
            "Retrieval-only: this is one candidate source job, not provider execution, image inspection or creative approval.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_layered_production_provider_request",
    {
      description:
        "Bind approved continuity artifact references to one layered source unit and compile it through the existing provider-neutral candidate contract. Candidate count remains one; expansion requires exact content-addressed style-proof approval evidence. This tool does not call an image provider.",
      inputSchema: z.object({
        request: z.unknown(),
        unitId: z.string().min(1).max(160),
        references: z.unknown(),
        styleProofApproval: z.unknown().optional(),
      }),
    },
    async ({ request, unitId, references, styleProofApproval }) => {
      try {
        const { plan, approvalReceipt } = compileLayeredPlan(
          request,
          styleProofApproval,
        );
        const bridge = compileLayeredProviderCandidateRequest(
          plan,
          unitId,
          references as readonly LayeredProviderReferenceInput[],
        );
        return textResult({
          schemaVersion: "1.0",
          planId: plan.planId,
          planSha256: plan.planSha256,
          styleProofStatus: plan.styleProof.status,
          ...(approvalReceipt === null ? {} : { approvalReceipt }),
          layeredProviderRequest: bridge,
          compiledProviderContract: compileProviderCandidateRuntimeContract(
            bridge.request,
          ),
          executionBoundary:
            "Compile-only: no provider call, candidate bytes, image inspection, creative approval, assembly, target-repository mutation, commit, push or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
