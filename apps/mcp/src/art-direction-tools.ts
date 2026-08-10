import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  ArtDirectionError,
  artDirectionProtocolSummary,
  compileArtDirectionContract,
  compileArtDirectionJob,
  compileLayeredProductionPlan,
  compileLayeredProviderCandidateRequest,
  getLayeredProductionUnit,
  layeredProductionProtocolSummary,
  listArtDirectionOutputProfiles,
  listArtDirectionPresets,
  validateArtDirectionCompileRequest,
  validateLayeredProductionRequest,
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
        "Describe the runtime-source boundary for layered game art: one exclusive source image per provider job, style-proof approval before expansion, approval-gated assembly and anti-collage/anti-generic rules.",
      inputSchema: z.object({}),
    },
    async () => textResult(layeredProductionProtocolSummary()),
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
        "Validate a scene or district source plan before any image generation. It rejects concept collages, multi-image provider calls, mixed layer ownership, loose pixel style, unsafe paths and incomplete style-proof coverage.",
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
    "compile_layered_production_plan",
    {
      description:
        "Compile a deterministic layered runtime-source plan. Every unit becomes one provider-ready image job with exclusive layer ownership, exact dimensions, alpha policy, anti-generic style locks, review gates and approval-gated assembly metadata. This tool does not execute a provider.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          compiledPlan: compileLayeredProductionPlan(request),
          executionBoundary:
            "Plan-only: no image generation, composite assembly, approval, target-repository mutation, commit, push or publication.",
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
        "Compile a layered plan and return one exact one-image provider job by unit ID. Use this instead of asking a provider for a concept sheet or flattened scene.",
      inputSchema: z.object({ request: z.unknown(), unitId: z.string().min(1).max(160) }),
    },
    async ({ request, unitId }) => {
      try {
        const plan = compileLayeredProductionPlan(request);
        return textResult({
          schemaVersion: "1.0",
          planId: plan.planId,
          planSha256: plan.planSha256,
          styleProofStatus: plan.styleProof.status,
          unit: getLayeredProductionUnit(plan, unitId),
          executionBoundary:
            "Retrieval-only: this is one candidate source job, not provider execution or approval.",
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
        "Bind approved continuity artifact references to one layered source unit and compile it through the existing provider-neutral candidate contract. Candidate count remains one; this tool does not call an image provider.",
      inputSchema: z.object({
        request: z.unknown(),
        unitId: z.string().min(1).max(160),
        references: z.unknown(),
      }),
    },
    async ({ request, unitId, references }) => {
      try {
        const plan = compileLayeredProductionPlan(request);
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
          layeredProviderRequest: bridge,
          compiledProviderContract: compileProviderCandidateRuntimeContract(
            bridge.request,
          ),
          executionBoundary:
            "Compile-only: no provider call, candidate bytes, approval, assembly, target-repository mutation, commit, push or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
