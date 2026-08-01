import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  SpriteSupervisorError,
  compileSpriteSupervisorWorkflow,
  spriteSupervisorProtocolSummary,
} from "@evavo/art-sprite-supervisor";

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
}
