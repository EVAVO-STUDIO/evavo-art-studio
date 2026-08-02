import path from "node:path";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
  BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
  compileBookArtProviderShadowJob,
  submitBookArtProviderShadowJob,
  type BookArtProviderAdapterPolicyV1,
} from "@evavo/art-book-runtime";
import { inspectBookArtProviderShadowJob } from "@evavo/art-book-runtime/inspection";
import { LocalRuntimeRepository } from "@evavo/art-runtime";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

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

function envCsv(name: string): string[] {
  return [
    ...new Set(
      (process.env[name] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ].sort();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function providerPolicy(): BookArtProviderAdapterPolicyV1 | undefined {
  const allowedAdapterIds = envCsv("EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS");
  if (!allowedAdapterIds.length) return undefined;
  const preferredAdapterId = optionalEnv(
    "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
  );
  const preferredModel = optionalEnv("EVAVO_BOOK_ART_PROVIDER_MODEL");
  return {
    allowedAdapterIds,
    ...(preferredAdapterId === undefined ? {} : { preferredAdapterId }),
    ...(preferredModel === undefined ? {} : { preferredModel }),
  };
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

function writesEnabled(): boolean {
  return process.env.EVAVO_ART_ALLOW_WRITES === "true";
}

function configuredInput(
  request: unknown,
  policy: BookArtProviderAdapterPolicyV1,
): Record<string, unknown> {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Book Art provider request must be one object.");
  }
  const input = request as Record<string, unknown>;
  if (Object.hasOwn(input, "adapterPolicy")) {
    throw new Error(
      "Book Art provider request must not contain adapterPolicy; configure provider policy on the MCP host.",
    );
  }
  return { ...input, adapterPolicy: policy };
}

function protocol(policy: BookArtProviderAdapterPolicyV1 | undefined) {
  return {
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    contract: BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
    shadowOnly: true,
    providerPolicyConfigured: policy !== undefined,
    providerPolicyEnvironment: {
      allowedAdapterIds: "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
      preferredAdapterId: "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
      preferredModel: "EVAVO_BOOK_ART_PROVIDER_MODEL",
    },
    oneCandidate: true,
    maximumRuntimeAttempts: 1,
    providerFallbackAllowed: false,
    compilePerformsProviderCall: false,
    submitPerformsProviderCall: false,
    inspectPerformsProviderCall: false,
    inspectionWritesArtifacts: false,
    candidateApprovalState: "unapproved",
    candidateStorageClass: "intermediate",
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  } as const;
}

function requiredPolicy(): BookArtProviderAdapterPolicyV1 {
  const policy = providerPolicy();
  if (!policy) {
    throw new Error(
      "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS must configure at least one allowed adapter.",
    );
  }
  return policy;
}

function requireOperationalAccess(): void {
  if (!writesEnabled()) {
    throw new Error(
      "Book Art runtime submission and inspection require EVAVO_ART_ALLOW_WRITES=true on the trusted MCP host.",
    );
  }
}

export function registerBookArtTools(server: McpServer): void {
  server.registerTool(
    "book_art_provider_runtime_protocol",
    {
      description:
        "Report the shadow-only Book Art provider runtime contract, host policy readiness and non-authority guarantees without compiling, submitting or inspecting work.",
      inputSchema: z.object({}),
    },
    async () => textResult(protocol(providerPolicy())),
  );

  server.registerTool(
    "compile_book_art_provider_shadow_job",
    {
      description:
        "Compile one fingerprint-valid Book Art work order into a deterministic no-fallback, one-attempt provider job. The MCP host injects adapter policy. This tool performs no provider call and writes no artifact or runtime job.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(
          await compileBookArtProviderShadowJob(
            configuredInput(request, requiredPolicy()),
          ),
        );
      } catch (error: unknown) {
        return toolError("BOOK_ART_PROVIDER_COMPILATION_REJECTED", error);
      }
    },
  );

  server.registerTool(
    "submit_book_art_provider_shadow_job",
    {
      description:
        "Submit one compiled-equivalent Book Art request to the local durable runtime with no provider call during submission. Requires EVAVO_ART_ALLOW_WRITES=true; duplicate requests reuse the same one-attempt job.",
      inputSchema: z.object({
        request: z.unknown(),
        actor: z.string().min(1).max(256).optional(),
      }),
    },
    async ({ request, actor }) => {
      try {
        requireOperationalAccess();
        return textResult(
          await submitBookArtProviderShadowJob(
            configuredInput(request, requiredPolicy()),
            {
              runtime: new LocalRuntimeRepository({ root: runtimeRoot() }),
              actor: actor?.trim() || "mcp-book-art-shadow",
            },
          ),
        );
      } catch (error: unknown) {
        return toolError("BOOK_ART_PROVIDER_SUBMISSION_REJECTED", error);
      }
    },
  );

  server.registerTool(
    "inspect_book_art_provider_shadow_job",
    {
      description:
        "Read and verify the exact durable Book Art provider job, immutable candidate and provider evidence without calling a provider, writing artifacts, selecting, promoting, binding or publishing. Requires the trusted operational boundary.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        requireOperationalAccess();
        const compilation = await compileBookArtProviderShadowJob(
          configuredInput(request, requiredPolicy()),
        );
        return textResult(
          await inspectBookArtProviderShadowJob(compilation, {
            runtime: new LocalRuntimeRepository({ root: runtimeRoot() }),
            artifacts: new LocalArtifactStore({ root: artifactRoot() }),
          }),
        );
      } catch (error: unknown) {
        return toolError("BOOK_ART_PROVIDER_INSPECTION_REJECTED", error);
      }
    },
  );
}
