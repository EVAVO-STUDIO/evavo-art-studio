#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import { validateArtBrief } from "@evavo/art-contracts";
import { CAPABILITY_CATALOG, createProductionPlan } from "@evavo/art-core";
import {
  analyseDecodedSpriteFrame,
  analyseSpriteSequenceManifestFile,
  decodeSpriteFrame,
} from "@evavo/art-quality";
import {
  assertPathWithinAllowedRoots,
  inspectRepository,
} from "@evavo/art-repo-inspector";

export const BRASS_ART_REVIEW_PROFILE =
  "evavo_brass_art_review_mcp_v1";
export const BRASS_ART_REVIEW_TOOL_NAMES = Object.freeze([
  "art_review_capabilities",
  "validate_art_brief",
  "compile_art_production_plan",
  "inspect_art_repository",
  "inspect_sprite_frame_quality",
  "inspect_sprite_sequence_quality",
] as const);

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const candidate = path.normalize(value);
    return process.platform === "win32"
      ? candidate.toLocaleLowerCase("en-US")
      : candidate;
  };
  return normalize(left) === normalize(right);
}

function canonicalDirectory(value: string, label: string): string {
  const requested = path.resolve(value);
  const state = fs.lstatSync(requested);
  if (!state.isDirectory() || state.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink directory.`);
  }
  const resolved = fs.realpathSync.native(requested);
  if (!samePath(requested, resolved)) {
    throw new Error(`${label} must use its canonical path.`);
  }
  return resolved;
}

export function reviewAllowedRoots(
  configured = process.env.EVAVO_ART_REVIEW_ALLOWED_ROOTS,
): readonly string[] {
  const values = String(configured ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error(
      "EVAVO_ART_REVIEW_ALLOWED_ROOTS must declare at least one explicit root.",
    );
  }
  const result: string[] = [];
  for (const [index, value] of values.entries()) {
    const resolved = canonicalDirectory(value, `Review root ${index}`);
    if (!result.some((candidate) => samePath(candidate, resolved))) {
      result.push(resolved);
    }
  }
  return Object.freeze(result);
}

export function reviewCapabilityDocument(
  configured = process.env.EVAVO_ART_REVIEW_ALLOWED_ROOTS,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: "1.0",
    profile: BRASS_ART_REVIEW_PROFILE,
    server: "evavo-art-studio-brass-review",
    allowedRoots: reviewAllowedRoots(configured),
    tools: BRASS_ART_REVIEW_TOOL_NAMES,
    declaredArtStudioCapabilities: CAPABILITY_CATALOG,
    writesEnabled: false,
    providerExecutionAllowed: false,
    runtimeJobSubmissionAllowed: false,
    runtimeJobControlAllowed: false,
    artifactMutationAllowed: false,
    targetRepositoryMutationAllowed: false,
    deletionAuthority: false,
    promotionAuthority: false,
    publicationAuthority: false,
    arbitraryShellAllowed: false,
    arbitraryGitArgumentsAllowed: false,
    truthBoundaries: Object.freeze([
      "Repository and pixel inspection are evidence, not creative approval.",
      "A production plan is not provider execution or asset generation.",
      "Frame and sequence metrics are not human visual approval.",
      "Only Development Studio may admit evidence and publish target changes.",
    ]),
  });
}

const server = new McpServer({
  name: "evavo-art-studio-brass-review",
  version: "1.0.0",
});

const textResult = (value: unknown) => ({
  content: [
    { type: "text" as const, text: JSON.stringify(value, null, 2) },
  ],
});

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
  "art_review_capabilities",
  {
    description:
      "Describe the six-tool Brass art-review profile and its permanent no-write authority.",
    inputSchema: z.object({}),
  },
  async () => textResult(reviewCapabilityDocument()),
);

server.registerTool(
  "validate_art_brief",
  {
    description:
      "Validate an EVAVO Art Studio art brief without creating work, writing files or calling an art provider.",
    inputSchema: z.object({ brief: z.unknown() }),
  },
  async ({ brief }) => textResult(validateArtBrief(brief)),
);

server.registerTool(
  "compile_art_production_plan",
  {
    description:
      "Compile a valid art brief into deterministic roles, quality gates and deliverables without execution.",
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
      "Inspect one configured local project for engine context, current art and likely asset gaps. Paths and symlinks outside the explicit review roots are rejected.",
    inputSchema: z.object({ repositoryPath: z.string().min(1) }),
  },
  async ({ repositoryPath }) => {
    try {
      const roots = reviewAllowedRoots();
      const safePath = assertPathWithinAllowedRoots(repositoryPath, roots);
      return textResult(await inspectRepository(safePath));
    } catch (error: unknown) {
      return toolError("ART_REPOSITORY_REVIEW_REJECTED", error);
    }
  },
);

server.registerTool(
  "inspect_sprite_frame_quality",
  {
    description:
      "Decode one root-restricted sprite or image frame and report alpha, fake transparency, crop, edge halo and transparent-RGB evidence without changing the file.",
    inputSchema: z.object({
      imagePath: z.string().min(1),
      expectations: z.unknown(),
    }),
  },
  async ({ imagePath, expectations }) => {
    try {
      const roots = reviewAllowedRoots();
      const safePath = assertPathWithinAllowedRoots(imagePath, roots);
      return textResult(
        analyseDecodedSpriteFrame(
          await decodeSpriteFrame(safePath),
          expectations,
        ),
      );
    } catch (error: unknown) {
      return toolError("SPRITE_FRAME_REVIEW_REJECTED", error);
    }
  },
);

server.registerTool(
  "inspect_sprite_sequence_quality",
  {
    description:
      "Inspect one root-restricted sprite-sequence manifest for canvas, timing, ordering, pivots, baselines, ground contact and linked-cel identity without writing output.",
    inputSchema: z.object({ manifestPath: z.string().min(1) }),
  },
  async ({ manifestPath }) => {
    try {
      const roots = reviewAllowedRoots();
      const safePath = assertPathWithinAllowedRoots(manifestPath, roots);
      return textResult(
        await analyseSpriteSequenceManifestFile(safePath, {
          allowedRoots: roots,
        }),
      );
    } catch (error: unknown) {
      return toolError("SPRITE_SEQUENCE_REVIEW_REJECTED", error);
    }
  },
);

export async function startBrassArtReviewServer(): Promise<void> {
  reviewAllowedRoots();
  await server.connect(new StdioServerTransport());
}

const invoked = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;
if (invoked) {
  startBrassArtReviewServer().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
