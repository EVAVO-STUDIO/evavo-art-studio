import path from "node:path";

import type { BookArtProviderAdapterPolicyV1 } from "@evavo/art-book-runtime";
import {
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION,
  compileBookArtCreativeCandidateProgramme,
} from "@evavo/art-book-runtime/creative-candidate-programme";
import {
  BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
  BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
  submitBookArtCreativeProgrammeDispatch,
} from "@evavo/art-book-runtime/creative-candidate-programme-dispatch";
import { LocalRuntimeRepository } from "@evavo/art-runtime";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
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
  if (allowedAdapterIds.length === 0) return undefined;
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

function requiredProviderPolicy(): BookArtProviderAdapterPolicyV1 {
  const policy = providerPolicy();
  if (!policy) {
    throw new Error(
      "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS must configure at least one allowed adapter before submitting a creative candidate programme.",
    );
  }
  return policy;
}

function runtimeRoot(): string {
  return path.resolve(
    process.env.EVAVO_ART_RUNTIME_ROOT ?? ".art-studio/runtime",
  );
}

function writesEnabled(): boolean {
  return process.env.EVAVO_ART_ALLOW_WRITES === "true";
}

function requireOperationalAccess(): void {
  if (!writesEnabled()) {
    throw new Error(
      "Book Art creative programme runtime submission requires EVAVO_ART_ALLOW_WRITES=true on the trusted MCP host.",
    );
  }
}

function configuredProgrammeInput(request: unknown): Record<string, unknown> {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Creative candidate programme request must be one object.");
  }
  const input = request as Record<string, unknown>;
  if (Object.hasOwn(input, "adapterPolicy")) {
    throw new Error(
      "Creative candidate programme request must not contain adapterPolicy; provider policy is injected by the trusted MCP host.",
    );
  }
  return {
    ...input,
    adapterPolicy: requiredProviderPolicy(),
  };
}

function programmeRuntimeProtocol() {
  return {
    programmeSchemaVersion:
      BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION,
    programmeContract: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
    dispatchSchemaVersion: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
    dispatchContract: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
    writesEnabled: writesEnabled(),
    providerPolicyConfigured: providerPolicy() !== undefined,
    providerPolicyEnvironment: {
      allowedAdapterIds: "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
      preferredAdapterId: "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
      preferredModel: "EVAVO_BOOK_ART_PROVIDER_MODEL",
    },
    runtimeRootEnvironment: "EVAVO_ART_RUNTIME_ROOT",
    writeAuthorityEnvironment: "EVAVO_ART_ALLOW_WRITES",
    trustedHostRecompilesProgramme: true,
    callerSuppliedProgrammeAccepted: false,
    callerSuppliedAdapterPolicyAccepted: false,
    completeRouteSetRequired: true,
    singleRuntimeBatchRequired: true,
    partialProgrammeExecutionAllowed: false,
    exactlyOneCandidatePerCreativeRoute: true,
    maximumProviderAttemptsPerRoute: 1,
    providerFallbackAllowed: false,
    submitPerformsProviderCall: false,
    providerCallsRequireSeparateWorkerLease: true,
    candidateArtifactsWrittenBySubmission: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  } as const;
}

export function registerBookCreativeProgrammeRuntimeTools(
  server: McpServer,
): void {
  server.registerTool(
    "book_creative_candidate_programme_runtime_protocol",
    {
      description:
        "Report the trusted Book Art creative-programme runtime boundary. The MCP host recompiles the complete manuscript-led programme with host-owned provider policy and can submit it only as one durable batch; submission itself calls no provider and grants no selection, promotion, Book-use or publication authority.",
      inputSchema: z.object({}),
    },
    async () => textResult(programmeRuntimeProtocol()),
  );

  server.registerTool(
    "submit_book_creative_candidate_programme",
    {
      description:
        "Recompile a complete manuscript-led creative candidate programme with trusted host provider policy and submit every route together through the governed durable runtime batch. Requires EVAVO_ART_ALLOW_WRITES=true. The caller cannot provide a precompiled programme, adapter policy, partial route set or execution authority flags. Submission itself performs no provider call, candidate selection, promotion, Book-use binding or publication.",
      inputSchema: z.object({
        request: z.unknown(),
        actor: z.string().min(1).max(256).optional(),
      }),
    },
    async ({ request, actor }) => {
      try {
        requireOperationalAccess();
        const compilation = await compileBookArtCreativeCandidateProgramme(
          configuredProgrammeInput(request),
        );
        if (compilation.status !== "ready" || !compilation.programme) {
          return textResult({
            stage: "programme_compilation",
            ...compilation,
          });
        }

        const programme = compilation.programme;
        return textResult(
          await submitBookArtCreativeProgrammeDispatch(
            {
              outputKind:
                "evavo_book_art_creative_candidate_programme_dispatch_input",
              schemaVersion:
                BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
              contract: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
              programme,
              expectedProgrammeFingerprintSha256:
                programme.programmeFingerprintSha256,
              partialProgrammeSubmissionAllowed: false,
              providerFallbackAllowed: false,
              automaticSelectionAllowed: false,
              automaticPromotionAllowed: false,
              publicationAllowed: false,
            },
            {
              runtime: new LocalRuntimeRepository({ root: runtimeRoot() }),
              actor:
                actor?.trim() || "mcp-book-creative-candidate-programme",
            },
          ),
        );
      } catch (error: unknown) {
        return toolError("BOOK_CREATIVE_PROGRAMME_SUBMISSION_REJECTED", error);
      }
    },
  );
}
