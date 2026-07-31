import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  ArtDirectionError,
  artDirectionProtocolSummary,
  compileArtDirectionContract,
  compileArtDirectionJob,
  listArtDirectionOutputProfiles,
  listArtDirectionPresets,
  validateArtDirectionCompileRequest,
} from "@evavo/art-direction";

import { registerSpritePlanTools } from "./sprite-plan-tools.js";

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
          executionBoundary:
            "Compile-only: no artifact reads, provider execution, media generation, worker execution, approval or named-reference mutation.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
