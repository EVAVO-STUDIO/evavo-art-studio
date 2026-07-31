import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  SpritePlannerError,
  compileSpritePlanJob,
  compileSpriteProductionPlan,
  spritePlannerProtocolSummary,
  validateSpritePlanCompileRequest,
} from "@evavo/art-sprite-planner";

import { registerSpriteSupervisorTools } from "./sprite-supervisor-tools.js";

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
              error instanceof SpritePlannerError
                ? error.code
                : "SPRITE_PLAN_TOOL_REJECTED",
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof SpritePlannerError && error.details !== undefined
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

export function registerSpritePlanTools(server: McpServer): void {
  registerSpriteSupervisorTools(server);

  server.registerTool(
    "sprite_plan_protocol",
    {
      description:
        "Describe role and genre-aware animation coverage, authored and derived directions, frame timing, layer and variant workloads, sprite sheets, atlases, Aseprite source structure and Godot SpriteFrames planning.",
      inputSchema: z.object({}),
    },
    async () => textResult(spritePlannerProtocolSummary()),
  );

  server.registerTool(
    "validate_complete_sprite_plan",
    {
      description:
        "Validate one complete sprite-production planning request and its exact art-direction binding. This tool does not read image artifacts, generate frames or approve assets.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(validateSpritePlanCompileRequest(request));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_complete_sprite_plan",
    {
      description:
        "Compile every required direction, clip, key pose, frame, retained layer, variant strategy, per-clip sheet, family atlas, Aseprite tag and Godot SpriteFrames binding into one deterministic provider-free plan.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          compiledPlan: compileSpriteProductionPlan(request),
          compiledJob: compileSpritePlanJob(request),
          executionBoundary:
            "Compile-only: no provider execution, image generation, artifact reads, worker execution, promotion or named-reference mutation.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
