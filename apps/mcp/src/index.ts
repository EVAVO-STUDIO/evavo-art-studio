import path from "node:path";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import { validateArtBrief } from "@evavo/art-contracts";
import { CAPABILITY_CATALOG, createProductionPlan } from "@evavo/art-core";
import { writeGodotSpriteFramesImporter } from "@evavo/art-godot";
import { buildSpriteAtlasPackage } from "@evavo/art-media";
import {
  analyseDecodedSpriteFrame,
  analyseSpriteSequenceManifestFile,
  decodeSpriteFrame,
} from "@evavo/art-quality";
import { assertPathWithinAllowedRoots, inspectRepository } from "@evavo/art-repo-inspector";

import { registerBookArtTools } from "./book-art-tools.js";
import { registerProviderTools } from "./provider-tools.js";
import { registerRuntimeTools } from "./runtime-tools.js";
import { registerSelectionTools } from "./selection-tools.js";
import { registerSpriteFamilyTools } from "./sprite-family-tools.js";

const server = new McpServer({
  name: "evavo-art-studio",
  version: "0.1.0",
});

registerRuntimeTools(server);
registerProviderTools(server);
registerBookArtTools(server);
registerSelectionTools(server);
registerSpriteFamilyTools(server);

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function allowedRoots(): readonly string[] {
  const configured = (process.env.EVAVO_ART_ALLOWED_ROOTS ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : [process.cwd()];
}

function writesEnabled(): boolean {
  return process.env.EVAVO_ART_ALLOW_WRITES === "true";
}

function toolError(code: string, error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            code,
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      },
    ],
  };
}

server.registerTool(
  "art_studio_capabilities",
  {
    description:
      "List the governed capabilities currently declared by EVAVO Art Studio.",
    inputSchema: z.object({}),
  },
  async () =>
    textResult({
      schemaVersion: "1.0",
      capabilities: CAPABILITY_CATALOG,
      writesEnabled: writesEnabled(),
    }),
);

server.registerTool(
  "validate_art_brief",
  {
    description:
      "Validate an EVAVO Art Studio art brief without creating work or calling an art provider.",
    inputSchema: z.object({ brief: z.unknown() }),
  },
  async ({ brief }) => textResult(validateArtBrief(brief)),
);

server.registerTool(
  "compile_art_production_plan",
  {
    description:
      "Compile a validated art brief into a deterministic work-order graph, sprite continuity blueprints, quality gates and deliverables.",
    inputSchema: z.object({ brief: z.unknown() }),
  },
  async ({ brief }) => {
    const validation = validateArtBrief(brief);
    if (!validation.success) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { code: "INVALID_ART_BRIEF", issues: validation.issues },
              null,
              2,
            ),
          },
        ],
      };
    }
    return textResult(createProductionPlan(validation.value));
  },
);

server.registerTool(
  "inspect_art_repository",
  {
    description:
      "Inspect a configured local project root for engine context, existing art and likely asset gaps. Symlinks and paths outside configured roots are rejected.",
    inputSchema: z.object({ repositoryPath: z.string().min(1) }),
  },
  async ({ repositoryPath }) => {
    try {
      const safePath = assertPathWithinAllowedRoots(
        repositoryPath,
        allowedRoots(),
      );
      return textResult(await inspectRepository(safePath));
    } catch (error: unknown) {
      return toolError("REPOSITORY_INSPECTION_REJECTED", error);
    }
  },
);

server.registerTool(
  "inspect_sprite_frame_quality",
  {
    description:
      "Decode one local sprite frame and return deterministic alpha, fake-transparency, crop, edge-halo and transparent-RGB evidence. The path must remain inside EVAVO_ART_ALLOWED_ROOTS.",
    inputSchema: z.object({
      imagePath: z.string().min(1),
      expectations: z.unknown(),
    }),
  },
  async ({ imagePath, expectations }) => {
    try {
      const safePath = assertPathWithinAllowedRoots(
        imagePath,
        allowedRoots(),
      );
      return textResult(
        analyseDecodedSpriteFrame(
          await decodeSpriteFrame(safePath),
          expectations,
        ),
      );
    } catch (error: unknown) {
      return toolError("SPRITE_FRAME_QUALITY_REJECTED", error);
    }
  },
);

server.registerTool(
  "inspect_sprite_sequence_quality",
  {
    description:
      "Inspect a guarded local sprite sequence manifest and prove shared canvas, exact timing, pivots, baselines, ground contact, ordering and declared linked-cel duplicates.",
    inputSchema: z.object({ manifestPath: z.string().min(1) }),
  },
  async ({ manifestPath }) => {
    try {
      const roots = allowedRoots();
      const safePath = assertPathWithinAllowedRoots(manifestPath, roots);
      return textResult(
        await analyseSpriteSequenceManifestFile(safePath, {
          allowedRoots: roots,
        }),
      );
    } catch (error: unknown) {
      return toolError("SPRITE_SEQUENCE_QUALITY_REJECTED", error);
    }
  },
);

server.registerTool(
  "build_sprite_atlas_package",
  {
    description:
      "Build a deterministic PNG atlas, atlas JSON and evidence bundle from guarded local lossless source frames. Optionally generate a Godot 4.6.2 SpriteFrames descriptor and headless importer. Writes require EVAVO_ART_ALLOW_WRITES=true; this tool never executes Godot or another binary.",
    inputSchema: z.object({
      manifestPath: z.string().min(1),
      outputDirectory: z.string().min(1),
      godotProjectPath: z.string().min(1).optional(),
    }),
  },
  async ({ manifestPath, outputDirectory, godotProjectPath }) => {
    if (!writesEnabled()) {
      return toolError(
        "ART_STUDIO_WRITES_DISABLED",
        new Error("Atlas writes require EVAVO_ART_ALLOW_WRITES=true."),
      );
    }

    try {
      const roots = allowedRoots();
      const safeManifestPath = assertPathWithinAllowedRoots(
        manifestPath,
        roots,
      );
      const safeOutputDirectory = assertPathWithinAllowedRoots(
        outputDirectory,
        roots,
      );
      const atlas = await buildSpriteAtlasPackage(
        safeManifestPath,
        safeOutputDirectory,
        { allowedRoots: roots },
      );
      const safeGodotProject = godotProjectPath
        ? assertPathWithinAllowedRoots(godotProjectPath, roots)
        : undefined;
      const godot = safeGodotProject
        ? await writeGodotSpriteFramesImporter(atlas, safeGodotProject)
        : undefined;

      return textResult({
        schemaVersion: "1.0",
        atlasId: atlas.packageData.atlasId,
        atlas: {
          imagePath: atlas.imagePath,
          dataPath: atlas.dataPath,
          evidencePath: atlas.evidencePath,
          width: atlas.packageData.width,
          height: atlas.packageData.height,
          frameCount: atlas.packageData.frames.length,
          animationCount: atlas.packageData.animations.length,
          imageSha256: atlas.packageData.atlasImage.sha256,
          dataSha256: atlas.atlasDataSha256,
        },
        ...(godot
          ? {
              godot: {
                descriptorPath: godot.descriptorPath,
                importerPath: godot.importerPath,
                resourcePath: godot.resourcePath,
                headlessCommand: godot.headlessCommand,
              },
            }
          : {}),
        executionAvailable: false,
      });
    } catch (error: unknown) {
      return toolError("SPRITE_ATLAS_BUILD_REJECTED", error);
    }
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
