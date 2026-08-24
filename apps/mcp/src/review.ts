#!/usr/bin/env node

import { createHash } from "node:crypto";
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

import { reviewArtBatchDirectory } from "./batch-review.js";

export const BRASS_ART_REVIEW_PROFILE =
  "evavo_brass_art_review_mcp_v1";
export const BRASS_ART_REVIEW_TOOL_NAMES = Object.freeze([
  "art_review_capabilities",
  "validate_art_brief",
  "compile_art_production_plan",
  "inspect_art_repository",
  "inspect_sprite_frame_quality",
  "inspect_art_batch_quality",
  "inspect_sprite_sequence_quality",
] as const);
export const ART_REVIEW_SPECIALIST_RECEIPT =
  "evavo_art_studio_review_specialist_receipt_v1";

const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

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

function canonicalJson(value: unknown): string {
  const visit = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(visit);
    if (child && typeof child === "object") {
      return Object.fromEntries(
        Object.entries(child as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, visit(item)]),
      );
    }
    return child;
  };
  return JSON.stringify(visit(value));
}

function reviewReceipt(toolName: string, value: unknown) {
  const evidenceSha256 = createHash("sha256")
    .update(canonicalJson(value))
    .digest("hex");
  const receiptPayload = {
    contractVersion: ART_REVIEW_SPECIALIST_RECEIPT,
    authority: "EVAVO-STUDIO/evavo-art-studio",
    toolName,
    evidenceSha256,
    reviewOnly: true,
    creativeApprovalPerformed: false,
    artifactMutationPerformed: false,
    providerExecutionPerformed: false,
    publicationPerformed: false,
    completionAuthority: false,
    completionEvidenceEligible: false,
  };
  const receiptSha256 = createHash("sha256")
    .update(canonicalJson(receiptPayload))
    .digest("hex");
  return Object.freeze({
    ...receiptPayload,
    receiptId: `art-studio-review:${receiptSha256}`,
    receiptSha256,
  });
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
    batchReview: Object.freeze({
      schema: "evavo_brass_art_batch_review_v1",
      completeBatchDuplicateScope: true,
      perFileStableByteRead: true,
      gameOwnedRoleRequired: true,
      exactRelativePathSelection: true,
      deterministicSelectionIdentity: true,
      maximumFiles: 1_000,
      writesEvidenceFiles: false,
    }),
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
    specialistReceiptContract: ART_REVIEW_SPECIALIST_RECEIPT,
    completionAuthority: false,
    truthBoundaries: Object.freeze([
      "Repository, frame, batch and sequence inspection are evidence, not creative approval.",
      "A production plan is not provider execution or asset generation.",
      "Duplicate evidence does not authorise deletion or canonical selection.",
      "Only Development Studio may admit evidence and publish target changes.",
    ]),
  });
}

const server = new McpServer({
  name: "evavo-art-studio-brass-review",
  version: "1.3.0",
});

const textResult = (toolName: string, value: unknown) => ({
  content: [
    { type: "text" as const, text: JSON.stringify(value, null, 2) },
  ],
  structuredContent: {
    reviewEvidence: value,
    specialistEvidence: reviewReceipt(toolName, value),
    completionAuthority: false,
    completionEvidenceEligible: false,
  },
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
      "Describe the seven-tool Brass art-review profile and its permanent no-write authority.",
    inputSchema: z.object({}),
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async () => textResult("art_review_capabilities", reviewCapabilityDocument()),
);

server.registerTool(
  "validate_art_brief",
  {
    description:
      "Validate an EVAVO Art Studio art brief without creating work, writing files or calling an art provider.",
    inputSchema: z.object({ brief: z.unknown() }),
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async ({ brief }) => textResult("validate_art_brief", validateArtBrief(brief)),
);

server.registerTool(
  "compile_art_production_plan",
  {
    description:
      "Compile a valid art brief into deterministic roles, quality gates and deliverables without execution.",
    inputSchema: z.object({ brief: z.unknown() }),
    annotations: READ_ONLY_ANNOTATIONS,
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
    return textResult(
      "compile_art_production_plan",
      createProductionPlan(validation.value),
    );
  },
);

server.registerTool(
  "inspect_art_repository",
  {
    description:
      "Inspect one configured local project for engine context, current art and likely asset gaps. Paths and symlinks outside the explicit review roots are rejected.",
    inputSchema: z.object({ repositoryPath: z.string().min(1) }),
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async ({ repositoryPath }) => {
    try {
      const roots = reviewAllowedRoots();
      const safePath = assertPathWithinAllowedRoots(repositoryPath, roots);
      return textResult("inspect_art_repository", await inspectRepository(safePath));
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
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async ({ imagePath, expectations }) => {
    try {
      const roots = reviewAllowedRoots();
      const safePath = assertPathWithinAllowedRoots(imagePath, roots);
      return textResult(
        "inspect_sprite_frame_quality",
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
  "inspect_art_batch_quality",
  {
    description:
      "Review one role-consistent root-restricted image folder or an exact immutable path selection from a mixed corpus. Hash exact source bytes, decode every selected frame, report compact alpha/matte/crop/halo/transparent-RGB evidence, group exact and decoded-pixel duplicates, and return technical actions without writing or approving art.",
    inputSchema: z.object({
      directoryPath: z.string().min(1),
      roleId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
      expectations: z.unknown(),
      relativePaths: z
        .array(z.string().min(1).max(1_024))
        .min(1)
        .max(1_000)
        .optional(),
      recursive: z.boolean().optional(),
      maximumFiles: z.number().int().min(1).max(1_000).optional(),
      maximumDepth: z.number().int().min(0).max(32).optional(),
      maximumTotalBytes: z
        .number()
        .int()
        .min(1)
        .max(2 * 1024 * 1024 * 1024)
        .optional(),
      detail: z.enum(["summary", "failures", "all"]).optional(),
    }),
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async ({
    directoryPath,
    roleId,
    expectations,
    relativePaths,
    recursive,
    maximumFiles,
    maximumDepth,
    maximumTotalBytes,
    detail,
  }) => {
    try {
      return textResult(
        "inspect_art_batch_quality",
        await reviewArtBatchDirectory({
          directoryPath,
          roleId,
          allowedRoots: reviewAllowedRoots(),
          expectations,
          ...(relativePaths === undefined ? {} : { relativePaths }),
          ...(recursive === undefined ? {} : { recursive }),
          ...(maximumFiles === undefined ? {} : { maximumFiles }),
          ...(maximumDepth === undefined ? {} : { maximumDepth }),
          ...(maximumTotalBytes === undefined ? {} : { maximumTotalBytes }),
          ...(detail === undefined ? {} : { detail }),
        }),
      );
    } catch (error: unknown) {
      return toolError("ART_BATCH_REVIEW_REJECTED", error);
    }
  },
);

server.registerTool(
  "inspect_sprite_sequence_quality",
  {
    description:
      "Inspect one root-restricted sprite-sequence manifest for canvas, timing, ordering, pivots, baselines, ground contact and linked-cel identity without writing output.",
    inputSchema: z.object({ manifestPath: z.string().min(1) }),
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async ({ manifestPath }) => {
    try {
      const roots = reviewAllowedRoots();
      const safePath = assertPathWithinAllowedRoots(manifestPath, roots);
      return textResult(
        "inspect_sprite_sequence_quality",
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
