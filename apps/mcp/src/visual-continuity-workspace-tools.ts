import { ArtDirectionError } from "@evavo/art-direction";
import type {
  ApprovedVisualContinuityStudioHandoff,
  CompiledVisualContinuityBible,
  CompiledVisualContinuitySession,
  VisualContinuityApprovalReceipt,
} from "@evavo/art-direction";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  isVisualContinuityWorkspaceError,
  loadVisualContinuityArtifact,
  loadVisualContinuityWorkspace,
  persistApprovedVisualContinuityHandoff,
  persistVisualContinuityApproval,
  persistVisualContinuityBible,
  persistVisualContinuitySession,
} from "./visual-continuity-workspace-store.js";

const IDENTIFIER = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/u;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;
const identifierSchema = z.string().min(1).max(160).regex(IDENTIFIER);

function artifactRoot(): string {
  const root = process.env.EVAVO_ART_ARTIFACT_ROOT?.trim();
  if (!root) {
    throw Object.assign(
      new Error(
        "EVAVO_ART_ARTIFACT_ROOT must be configured by the server operator.",
      ),
      { code: "VISUAL_CONTINUITY_WORKSPACE_ROOT_MISSING" },
    );
  }
  return root;
}

function requireWrites(): void {
  if (process.env.EVAVO_ART_ALLOW_WRITES !== "true") {
    throw Object.assign(
      new Error(
        "Continuity persistence requires EVAVO_ART_ALLOW_WRITES=true.",
      ),
      { code: "VISUAL_CONTINUITY_WORKSPACE_WRITES_DISABLED" },
    );
  }
}

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function toolError(error: unknown) {
  const code =
    isVisualContinuityWorkspaceError(error) ||
    error instanceof ArtDirectionError ||
    (error && typeof error === "object" && "code" in error)
      ? String((error as { readonly code: unknown }).code)
      : "VISUAL_CONTINUITY_WORKSPACE_TOOL_REJECTED";
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

const persistOptionsSchema = z.object({
  expectedGeneration: z.number().int().min(0),
  actor: z.string().min(1).max(512),
});

export function registerVisualContinuityWorkspaceTools(
  server: McpServer,
): void {
  server.registerTool(
    "persist_visual_continuity_bible",
    {
      description:
        "Persist one verified continuity bible into the fixed content-addressed Art Studio store and atomically advance its named reference with an expected generation. Repeating the same bytes is idempotent.",
      inputSchema: z.object({
        bible: z.unknown(),
        persistence: persistOptionsSchema,
      }),
    },
    async ({ bible, persistence }) => {
      try {
        requireWrites();
        return textResult(
          await persistVisualContinuityBible(
            artifactRoot(),
            bible as CompiledVisualContinuityBible,
            persistence,
          ),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "persist_visual_continuity_session",
    {
      description:
        "Persist one verified continuity session only when its exact bible is already current, then atomically advance the session reference using stale-write generation protection.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        persistence: persistOptionsSchema,
      }),
    },
    async ({ bible, session, persistence }) => {
      try {
        requireWrites();
        return textResult(
          await persistVisualContinuitySession(
            artifactRoot(),
            bible as CompiledVisualContinuityBible,
            session as CompiledVisualContinuitySession,
            persistence,
          ),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "persist_visual_continuity_approval",
    {
      description:
        "Persist one canonical named-human approval receipt after verifying the current bible, current session, accepted candidate and exact persisted lineage.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        approval: z.unknown(),
        persistence: persistOptionsSchema,
      }),
    },
    async ({ bible, session, approval, persistence }) => {
      try {
        requireWrites();
        return textResult(
          await persistVisualContinuityApproval(
            artifactRoot(),
            bible as CompiledVisualContinuityBible,
            session as CompiledVisualContinuitySession,
            approval as VisualContinuityApprovalReceipt,
            persistence,
          ),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "persist_approved_visual_continuity_handoff",
    {
      description:
        "Persist one verified approved handoff only after its exact bible, current session and every source-bound approval receipt are already present in the immutable workspace lineage.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        handoff: z.unknown(),
        persistence: persistOptionsSchema,
      }),
    },
    async ({ bible, session, handoff, persistence }) => {
      try {
        requireWrites();
        return textResult(
          await persistApprovedVisualContinuityHandoff(
            artifactRoot(),
            bible as CompiledVisualContinuityBible,
            session as CompiledVisualContinuitySession,
            handoff as ApprovedVisualContinuityStudioHandoff,
            persistence,
          ),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "load_visual_continuity_workspace",
    {
      description:
        "Load and verify the current content-addressed visual bible, optional resumable session and named-reference generations from the fixed Art Studio artifact root.",
      inputSchema: z.object({
        projectId: identifierSchema,
        bibleId: identifierSchema,
        sessionId: identifierSchema.optional(),
      }),
    },
    async ({ projectId, bibleId, sessionId }) => {
      try {
        return textResult(
          await loadVisualContinuityWorkspace(
            artifactRoot(),
            projectId,
            bibleId,
            sessionId,
          ),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "load_visual_continuity_artifact",
    {
      description:
        "Read and verify one immutable continuity JSON artifact by its content-addressed artifact ID from the fixed server-side Art Studio store.",
      inputSchema: z.object({
        artifactId: z.string().regex(ARTIFACT_ID),
      }),
    },
    async ({ artifactId }) => {
      try {
        return textResult(
          await loadVisualContinuityArtifact(artifactRoot(), artifactId),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
