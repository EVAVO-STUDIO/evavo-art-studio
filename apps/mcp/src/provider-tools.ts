import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  ProviderError,
  compileProviderCandidateRuntimeContract,
  providerProtocolSummary,
  validateProviderCandidateRequest,
} from "@evavo/art-providers";

import { registerArtDirectionTools } from "./art-direction-tools.js";
import { registerArtProductionTools } from "./art-production-tools.js";
import { registerLayeredGodotTools } from "./layered-godot-tools.js";
import { registerLocalGenerationTools } from "./local-generation-tools.js";
import { registerSelectionTools } from "./selection-tools.js";

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
              error instanceof ProviderError
                ? error.code
                : "PROVIDER_CONTRACT_REJECTED",
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function registerProviderTools(server: McpServer): void {
  registerArtDirectionTools(server);
  registerArtProductionTools(server);
  registerLayeredGodotTools(server);
  registerLocalGenerationTools(server);
  registerSelectionTools(server);

  server.registerTool(
    "provider_candidate_protocol",
    {
      description:
        "Describe the governed generation, edit and inpaint candidate protocol, continuity reference roles and non-final-output rules without calling a provider.",
      inputSchema: z.object({}),
    },
    async () => textResult(providerProtocolSummary()),
  );

  server.registerTool(
    "validate_provider_candidate_request",
    {
      description:
        "Validate and normalize one bounded provider candidate request. Continuity-locked sprite work requires canonical identity references; in-betweens require both neighbouring key poses; inpainting requires a base image and mask.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateProviderCandidateRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_provider_candidate_request",
    {
      description:
        "Compile a provider-neutral candidate request into its deterministic prompt, hashes and ready-to-submit durable runtime job. This tool never calls an external model.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(compileProviderCandidateRuntimeContract(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
