import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  SpriteSupervisorError,
  automaticSpriteFinalizationProtocolSummary,
  automaticSpriteWorkflowProtocolSummary,
  compileAutomaticSpriteFinalizationWorkflow,
  compileAutomaticSpriteWorkflow,
  compileSpriteSupervisorWorkflow,
  spriteSupervisorProtocolSummary,
} from "@evavo/art-sprite-supervisor";

const AUTOMATIC_FINALIZATION_INPUT_SECTIONS = [
  "background",
  "threeD",
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
              error instanceof SpriteSupervisorError
                ? error.code
                : "SPRITE_SUPERVISOR_TOOL_REJECTED",
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof SpriteSupervisorError &&
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

export function registerSpriteSupervisorTools(server: McpServer): void {
  server.registerTool(
    "sprite_production_supervisor_protocol",
    {
      description:
        "Describe closed-loop sprite production supervision, bounded retries, targeted repair routing, immutable state, human review and release-evidence rules without executing runtime work.",
      inputSchema: z.object({}),
    },
    async () => textResult(spriteSupervisorProtocolSummary()),
  );

  server.registerTool(
    "automatic_sprite_workflow_protocol",
    {
      description:
        "Describe automatic expansion of complete sprite plans into direction, frame, layer, mastering, selection, promotion and family-verification tasks.",
      inputSchema: z.object({}),
    },
    async () => textResult(automaticSpriteWorkflowProtocolSummary()),
  );

  server.registerTool(
    "automatic_sprite_finalization_protocol",
    {
      description:
        "Describe governed background selection, fake-transparency rejection, exact-size delivery mastering, optional EVAVO 3D Studio reference binding and family release evidence.",
      inputSchema: z.object({}),
    },
    async () =>
      textResult({
        protocol: automaticSpriteFinalizationProtocolSummary(),
        inputSections: AUTOMATIC_FINALIZATION_INPUT_SECTIONS,
      }),
  );

  server.registerTool(
    "validate_sprite_production_supervisor",
    {
      description:
        "Validate and normalize a closed-loop sprite workflow. A source sprite-plan request may be supplied and is compiled before supervision. This tool never calls providers or submits jobs.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(compileSpriteSupervisorWorkflow(request).request);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_sprite_production_supervisor",
    {
      description:
        "Compile a deterministic art.sprite-production.supervise root job and bounded child workflow. Runtime submission, provider execution, artifact inspection, promotion and deployment remain outside this tool.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          workflow: compileSpriteSupervisorWorkflow(request),
          executionBoundary:
            "Compile-only: no runtime submission, provider call, artifact read, shell execution, reference mutation, promotion or deployment.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "validate_automatic_sprite_workflow",
    {
      description:
        "Validate complete automatic direction, frame, retained-layer, selection, promotion and family-verification coverage without executing a worker.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        const workflow = compileAutomaticSpriteWorkflow(request);
        return textResult({
          request: workflow.request,
          analysis: workflow.analysis,
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_automatic_sprite_workflow",
    {
      description:
        "Compile the automatic sprite task matrix and durable supervisor root job without calling an image provider.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          workflow: compileAutomaticSpriteWorkflow(request),
          executionBoundary:
            "Compile-only: no provider, artifact-store, runtime, promotion, shell or deployment authority.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "validate_automatic_sprite_finalization",
    {
      description:
        "Validate background policy, hostile-matte proof, exact delivery profile, 3D repository revision and full family release requirements.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        const workflow = compileAutomaticSpriteFinalizationWorkflow(request);
        return textResult({
          request: workflow.request,
          analysis: workflow.analysis,
          inputSections: AUTOMATIC_FINALIZATION_INPUT_SECTIONS,
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_automatic_sprite_finalization",
    {
      description:
        "Compile a background-aware, 3D-reference-aware sprite finalization workflow with fake-transparency rejection and release-ready family evidence. No work is executed.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          workflow: compileAutomaticSpriteFinalizationWorkflow(request),
          inputSections: AUTOMATIC_FINALIZATION_INPUT_SECTIONS,
          executionBoundary:
            "Compile-only: no runtime submission, provider call, artifact read, repository mutation, promotion, shell execution or deployment.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
