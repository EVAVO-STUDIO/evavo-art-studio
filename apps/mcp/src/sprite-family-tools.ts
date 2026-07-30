import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  SpriteFamilyError,
  spriteFamilyManifestSha256,
  spriteFamilyProtocolSummary,
  validateSpriteFamilyManifest,
} from "@evavo/art-sprite-family";

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
              error instanceof SpriteFamilyError
                ? error.code
                : "SPRITE_FAMILY_TOOL_REJECTED",
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof SpriteFamilyError && error.details !== undefined
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

function inputArtifacts(
  manifest: ReturnType<typeof validateSpriteFamilyManifest>,
) {
  return [
    ...new Set(
      manifest.frames.flatMap((frame) => [
        ...frame.layers.map((layer) => layer.artifactId),
        ...(frame.declaredCompositeArtifactId
          ? [frame.declaredCompositeArtifactId]
          : []),
      ]),
    ),
  ].sort();
}

export function registerSpriteFamilyTools(server: McpServer): void {
  server.registerTool(
    "sprite_family_protocol",
    {
      description:
        "List layered sprite roles, source policies, blend modes, composite parity and family-consistency rules without reading artifacts.",
      inputSchema: z.object({}),
    },
    async () => textResult(spriteFamilyProtocolSummary()),
  );

  server.registerTool(
    "validate_sprite_family_manifest",
    {
      description:
        "Validate one layered sprite-family manifest, including required layers, linked cels, family-static layers, z-order, sidecars and source-parity policy.",
      inputSchema: z.object({ manifest: z.unknown() }),
    },
    async ({ manifest }) => {
      try {
        return textResult(validateSpriteFamilyManifest(manifest));
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_sprite_family_verification_job",
    {
      description:
        "Compile a layered sprite-family manifest into a capability-scoped durable verification job. This tool does not read image artifacts, composite frames or approve outputs.",
      inputSchema: z.object({ manifest: z.unknown() }),
    },
    async ({ manifest: input }) => {
      try {
        const manifest = validateSpriteFamilyManifest(input);
        const manifestSha256 = spriteFamilyManifestSha256(manifest);
        return textResult({
          schemaVersion: "1.0",
          manifest,
          manifestSha256,
          executionMode: "durable-worker-only",
          runtimeJob: {
            queue: "selection",
            kind: "sprite.family.verify",
            idempotencyKey: `sprite-family:${manifest.familyId}:${manifestSha256}`,
            payload: manifest,
            inputArtifacts: inputArtifacts(manifest),
            requiredCapabilities: [
              "sprite.family.verify",
              "media.layer-compose",
              "selection.compare",
              "evidence.bundle",
            ],
            maximumAttempts: 1,
            leaseDurationMs: 120_000,
            timeoutMs: 1_800_000,
            labels: {
              familyId: manifest.familyId,
              stage: "sprite-family-verification",
            },
          },
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
