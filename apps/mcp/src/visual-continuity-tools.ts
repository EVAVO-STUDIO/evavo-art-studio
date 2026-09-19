import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  ArtDirectionError,
  compileNextVisualContinuityWorkPacket,
  compileVisualContinuityBible,
  compileVisualContinuitySession,
  compileVisualContinuityStudioHandoff,
  evaluateVisualContinuityWorkPacket,
  verifyVisualContinuityBible,
  verifyVisualContinuitySession,
  verifyVisualContinuityWorkPacket,
  visualContinuityProtocolSummary,
} from "@evavo/art-direction";
import type {
  CompiledVisualContinuityBible,
  CompiledVisualContinuitySession,
  VisualContinuityWorkPacket,
} from "@evavo/art-direction";

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
                : "VISUAL_CONTINUITY_TOOL_REJECTED",
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

export function registerVisualContinuityTools(server: McpServer): void {
  server.registerTool(
    "visual_continuity_protocol",
    {
      description:
        "Describe the deterministic cross-studio visual-memory protocol for consistent art, maps, sprite animation, storyboards, video, 3D, textures and runtime delivery. This read-only tool grants no provider, mutation, approval or publication authority.",
      inputSchema: z.object({}),
    },
    async () => textResult(visualContinuityProtocolSummary()),
  );

  server.registerTool(
    "compile_visual_continuity_bible",
    {
      description:
        "Compile and hash one canonical project visual bible containing style signature, colour tokens, immutable references, entities, locations, map grammar, shot templates, continuity locks, anti-generic rules and QA thresholds. No image or repository is changed.",
      inputSchema: z.object({ bible: z.unknown() }),
    },
    async ({ bible }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          bible: compileVisualContinuityBible(bible),
          executionBoundary:
            "Contract compilation only: no provider call, file read, image mutation, creative approval, canon change, repository write, Git operation or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "verify_visual_continuity_bible",
    {
      description:
        "Semantically rebuild and verify an existing visual continuity bible and deterministic SHA-256 before it is used by another agent or studio.",
      inputSchema: z.object({ bible: z.unknown() }),
    },
    async ({ bible }) => {
      try {
        const compiled = bible as CompiledVisualContinuityBible;
        verifyVisualContinuityBible(compiled);
        return textResult({
          schemaVersion: "1.0",
          status: "passed",
          bibleId: compiled.bibleId,
          bibleSha256: compiled.bibleSha256,
          executionBoundary: "Verification only; no source or target is changed.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_visual_continuity_session",
    {
      description:
        "Compile a long-running, resumable, dependency-safe visual production session from an exact continuity bible. Each work item receives explicit references, inherited locks, metrics, blocking detections and a context hash so ChatGPT, Claude or Codex never depends on hidden chat memory.",
      inputSchema: z.object({ bible: z.unknown(), session: z.unknown() }),
    },
    async ({ bible, session }) => {
      try {
        const compiledBible = bible as CompiledVisualContinuityBible;
        return textResult({
          schemaVersion: "1.0",
          session: compileVisualContinuitySession(compiledBible, session),
          executionBoundary:
            "Session compilation only: no provider call, image mutation, creative approval, canon change, repository write, Git operation or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "verify_visual_continuity_session",
    {
      description:
        "Verify the current session, work-item context hashes, attempt chain, accepted candidates and totals against the exact continuity bible.",
      inputSchema: z.object({ bible: z.unknown(), session: z.unknown() }),
    },
    async ({ bible, session }) => {
      try {
        const compiledBible = bible as CompiledVisualContinuityBible;
        const compiledSession = session as CompiledVisualContinuitySession;
        verifyVisualContinuitySession(compiledBible, compiledSession);
        return textResult({
          schemaVersion: "1.0",
          status: "passed",
          bibleSha256: compiledBible.bibleSha256,
          sessionSha256: compiledSession.sessionSha256,
          totals: compiledSession.totals,
          executionBoundary: "Verification only; no source or target is changed.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_next_visual_continuity_packet",
    {
      description:
        "Compile the next self-contained work packet, prioritising repairs before new work and restating exact style, palette, entity, location, map, shot, sequence-neighbour and lock context. No provider is called.",
      inputSchema: z.object({ bible: z.unknown(), session: z.unknown() }),
    },
    async ({ bible, session }) => {
      try {
        const compiledBible = bible as CompiledVisualContinuityBible;
        const compiledSession = session as CompiledVisualContinuitySession;
        return textResult({
          schemaVersion: "1.0",
          packet: compileNextVisualContinuityWorkPacket(
            compiledBible,
            compiledSession,
          ),
          executionBoundary:
            "Packet compilation only: generation, editing, candidate admission and approval remain external and evidence-gated.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "verify_visual_continuity_packet",
    {
      description:
        "Verify a work packet against the exact current bible and session, including every job hash and work-item context hash.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        packet: z.unknown(),
      }),
    },
    async ({ bible, session, packet }) => {
      try {
        const compiledBible = bible as CompiledVisualContinuityBible;
        const compiledSession = session as CompiledVisualContinuitySession;
        const compiledPacket = packet as VisualContinuityWorkPacket;
        verifyVisualContinuityWorkPacket(
          compiledBible,
          compiledSession,
          compiledPacket,
        );
        return textResult({
          schemaVersion: "1.0",
          status: "passed",
          packetSha256: compiledPacket.packetSha256,
          jobCount: compiledPacket.jobs.length,
          executionBoundary: "Verification only; no provider or mutation is executed.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "evaluate_visual_continuity_candidate",
    {
      description:
        "Evaluate one externally produced candidate against the exact current packet using caller-supplied measured evidence. The deterministic result is accepted, bounded repair-required or blocked; gates are never weakened and image bytes are not changed.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        packet: z.unknown(),
        attempt: z.unknown(),
      }),
    },
    async ({ bible, session, packet, attempt }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          session: evaluateVisualContinuityWorkPacket(
            bible as CompiledVisualContinuityBible,
            session as CompiledVisualContinuitySession,
            packet as VisualContinuityWorkPacket,
            attempt,
          ),
          executionBoundary:
            "Evidence evaluation only: no provider call, image inspection, image mutation, automatic creative approval, canon mutation, repository write, Git operation or publication.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compile_visual_continuity_handoff",
    {
      description:
        "Compile an exact accepted-source handoff to Art Studio, Video Studio, Animation Studio, 3D Studio, Texture Studio, Godot, web or print. The handoff carries source hashes, selected canon, colour tokens, references, locks and receiver-specific checks without mutating either studio.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        handoff: z.unknown(),
      }),
    },
    async ({ bible, session, handoff }) => {
      try {
        return textResult({
          schemaVersion: "1.0",
          handoff: compileVisualContinuityStudioHandoff(
            bible as CompiledVisualContinuityBible,
            session as CompiledVisualContinuitySession,
            handoff,
          ),
          executionBoundary:
            "Metadata handoff only: source mutation, canon mutation, automatic approval, target-repository mutation, runtime activation and publication remain forbidden.",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
