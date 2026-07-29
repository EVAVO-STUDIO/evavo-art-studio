import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  LocalArtifactStore,
  type ArtifactDescriptorInput,
  type ArtifactId,
} from "@evavo/art-artifacts";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { assertPathWithinAllowedRoots } from "@evavo/art-repo-inspector";
import {
  LocalRuntimeRepository,
  type RuntimeJobState,
  type RuntimeJobSubmission,
} from "@evavo/art-runtime";

const runtimeStates = [
  "waiting",
  "queued",
  "leased",
  "running",
  "retry-wait",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
  "dead-letter",
] as const;

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function toolError(fallbackCode: string, error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : fallbackCode;
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

function writesEnabled(): boolean {
  return process.env.EVAVO_ART_ALLOW_WRITES === "true";
}

function allowedRoots(): readonly string[] {
  const roots = (process.env.EVAVO_ART_ALLOWED_ROOTS ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return roots.length ? roots : [process.cwd()];
}

function runtimeRoot(): string {
  return path.resolve(
    process.env.EVAVO_ART_RUNTIME_ROOT ?? ".art-studio/runtime",
  );
}

function artifactRoot(): string {
  return path.resolve(
    process.env.EVAVO_ART_ARTIFACT_ROOT ?? ".art-studio/artifacts",
  );
}

function requireWrites() {
  return writesEnabled()
    ? null
    : toolError(
        "ART_STUDIO_WRITES_DISABLED",
        new Error(
          "Runtime and artifact MCP tools require EVAVO_ART_ALLOW_WRITES=true.",
        ),
      );
}

function actor(value: string | undefined): string {
  return value?.trim() || "mcp";
}

function artifactId(value: string): ArtifactId {
  if (!/^artifact_[a-f0-9]{64}$/.test(value)) {
    throw new Error("artifactId must use artifact_<sha256> format.");
  }
  return value as ArtifactId;
}

export function registerRuntimeTools(server: McpServer): void {
  server.registerTool(
    "submit_art_runtime_jobs",
    {
      description:
        "Submit one job or an atomic batch to the local durable Art Studio runtime. Idempotency, dependencies and capability requirements are enforced. Requires EVAVO_ART_ALLOW_WRITES=true.",
      inputSchema: z.object({
        jobs: z.unknown(),
        actor: z.string().min(1).max(256).optional(),
      }),
    },
    async ({ jobs, actor: actorInput }) => {
      const denied = requireWrites();
      if (denied) return denied;
      try {
        const runtime = new LocalRuntimeRepository({ root: runtimeRoot() });
        return textResult(
          Array.isArray(jobs)
            ? await runtime.submitBatch(
                jobs as unknown as readonly RuntimeJobSubmission[],
                actor(actorInput),
              )
            : await runtime.submit(
                jobs as unknown as RuntimeJobSubmission,
                actor(actorInput),
              ),
        );
      } catch (error: unknown) {
        return toolError("RUNTIME_SUBMISSION_REJECTED", error);
      }
    },
  );

  server.registerTool(
    "list_art_runtime_jobs",
    {
      description:
        "List durable Art Studio jobs by state, queue or kind. Operational reads are write-gated because job payloads may contain private repository paths.",
      inputSchema: z.object({
        states: z.array(z.enum(runtimeStates)).optional(),
        queues: z.array(z.string().min(1).max(128)).optional(),
        kinds: z.array(z.string().min(1).max(128)).optional(),
        limit: z.number().int().min(1).max(100000).optional(),
      }),
    },
    async ({ states, queues, kinds, limit }) => {
      const denied = requireWrites();
      if (denied) return denied;
      try {
        const runtime = new LocalRuntimeRepository({ root: runtimeRoot() });
        return textResult(
          await runtime.list({
            ...(states ? { states: states as readonly RuntimeJobState[] } : {}),
            ...(queues ? { queues } : {}),
            ...(kinds ? { kinds } : {}),
            ...(limit === undefined ? {} : { limit }),
          }),
        );
      } catch (error: unknown) {
        return toolError("RUNTIME_LIST_REJECTED", error);
      }
    },
  );

  server.registerTool(
    "get_art_runtime_job",
    {
      description: "Read one durable Art Studio job and its attempts, lease, outputs and failure evidence.",
      inputSchema: z.object({ jobId: z.string().min(1).max(128) }),
    },
    async ({ jobId }) => {
      const denied = requireWrites();
      if (denied) return denied;
      try {
        return textResult(
          await new LocalRuntimeRepository({ root: runtimeRoot() }).get(jobId),
        );
      } catch (error: unknown) {
        return toolError("RUNTIME_JOB_READ_REJECTED", error);
      }
    },
  );

  server.registerTool(
    "control_art_runtime_job",
    {
      description:
        "Cancel, pause, resume or redrive one durable Art Studio job through its governed state machine.",
      inputSchema: z.object({
        jobId: z.string().min(1).max(128),
        action: z.enum(["cancel", "pause", "resume", "redrive"]),
        force: z.boolean().optional(),
        additionalAttempts: z.number().int().min(1).max(50).optional(),
        actor: z.string().min(1).max(256).optional(),
      }),
    },
    async ({ jobId, action, force, additionalAttempts, actor: actorInput }) => {
      const denied = requireWrites();
      if (denied) return denied;
      try {
        const runtime = new LocalRuntimeRepository({ root: runtimeRoot() });
        const operator = actor(actorInput);
        if (action === "cancel") {
          return textResult(
            await runtime.cancel(jobId, operator, { force: force ?? false }),
          );
        }
        if (action === "pause") {
          return textResult(
            await runtime.pause(jobId, operator, { force: force ?? false }),
          );
        }
        if (action === "resume") {
          return textResult(await runtime.resume(jobId, operator));
        }
        return textResult(
          await runtime.redrive(
            jobId,
            additionalAttempts ?? 1,
            operator,
          ),
        );
      } catch (error: unknown) {
        return toolError("RUNTIME_CONTROL_REJECTED", error);
      }
    },
  );

  server.registerTool(
    "recover_art_runtime_leases",
    {
      description:
        "Recover expired local leases, execution timeouts and deadlines, scheduling retry or dead-letter transitions without losing attempt evidence.",
      inputSchema: z.object({
        actor: z.string().min(1).max(256).optional(),
      }),
    },
    async ({ actor: actorInput }) => {
      const denied = requireWrites();
      if (denied) return denied;
      try {
        return textResult(
          await new LocalRuntimeRepository({
            root: runtimeRoot(),
          }).recoverExpiredLeases(actor(actorInput)),
        );
      } catch (error: unknown) {
        return toolError("RUNTIME_RECOVERY_REJECTED", error);
      }
    },
  );

  server.registerTool(
    "read_art_runtime_events",
    {
      description:
        "Read immutable runtime events after a transaction sequence for audit, progress and recovery diagnostics.",
      inputSchema: z.object({
        afterTransactionSequence: z.number().int().min(0).optional(),
      }),
    },
    async ({ afterTransactionSequence }) => {
      const denied = requireWrites();
      if (denied) return denied;
      try {
        return textResult(
          await new LocalRuntimeRepository({ root: runtimeRoot() }).events(
            afterTransactionSequence ?? 0,
          ),
        );
      } catch (error: unknown) {
        return toolError("RUNTIME_EVENTS_REJECTED", error);
      }
    },
  );

  server.registerTool(
    "store_artifact_file",
    {
      description:
        "Ingest one guarded local file into immutable content-addressed artifact storage with lineage and metadata. The source path must remain inside EVAVO_ART_ALLOWED_ROOTS.",
      inputSchema: z.object({
        filePath: z.string().min(1),
        descriptor: z.unknown(),
      }),
    },
    async ({ filePath, descriptor }) => {
      const denied = requireWrites();
      if (denied) return denied;
      try {
        const safePath = assertPathWithinAllowedRoots(filePath, allowedRoots());
        return textResult(
          await new LocalArtifactStore({ root: artifactRoot() }).put(
            await readFile(safePath),
            descriptor as ArtifactDescriptorInput,
          ),
        );
      } catch (error: unknown) {
        return toolError("ARTIFACT_STORE_REJECTED", error);
      }
    },
  );

  server.registerTool(
    "inspect_artifact_record",
    {
      description:
        "Read or hash-verify one immutable artifact descriptor without returning its potentially large binary content.",
      inputSchema: z.object({
        artifactId: z.string().regex(/^artifact_[a-f0-9]{64}$/),
        verify: z.boolean().optional(),
      }),
    },
    async ({ artifactId: value, verify }) => {
      const denied = requireWrites();
      if (denied) return denied;
      try {
        const store = new LocalArtifactStore({ root: artifactRoot() });
        const id = artifactId(value);
        return textResult(verify ? await store.verify(id) : await store.get(id));
      } catch (error: unknown) {
        return toolError("ARTIFACT_READ_REJECTED", error);
      }
    },
  );

  server.registerTool(
    "manage_artifact_reference",
    {
      description:
        "Resolve or compare-and-swap an approved named artifact reference. Updates retain generation and previous-artifact history.",
      inputSchema: z.object({
        namespace: z.string().min(1).max(512),
        name: z.string().min(1).max(128),
        action: z.enum(["resolve", "set"]),
        artifactId: z.string().regex(/^artifact_[a-f0-9]{64}$/).optional(),
        expectedGeneration: z.number().int().min(0).optional(),
        actor: z.string().min(1).max(256).optional(),
      }),
    },
    async ({ namespace, name, action, artifactId: value, expectedGeneration, actor: actorInput }) => {
      const denied = requireWrites();
      if (denied) return denied;
      try {
        const store = new LocalArtifactStore({ root: artifactRoot() });
        if (action === "resolve") {
          return textResult(await store.resolveReference(namespace, name));
        }
        if (!value) throw new Error("artifactId is required when action is set.");
        return textResult(
          await store.updateReference(namespace, name, artifactId(value), {
            actor: actor(actorInput),
            ...(expectedGeneration === undefined ? {} : { expectedGeneration }),
          }),
        );
      } catch (error: unknown) {
        return toolError("ARTIFACT_REFERENCE_REJECTED", error);
      }
    },
  );
}
