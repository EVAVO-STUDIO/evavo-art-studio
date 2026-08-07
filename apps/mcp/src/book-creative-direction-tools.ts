import {
  BOOK_CREATIVE_DIRECTION_CONTRACT,
  BOOK_CREATIVE_DIRECTION_SCHEMA_VERSION,
  compileBookCreativeDirection,
  listBookCreativeDirectionCapabilities,
} from "@evavo/art-contracts";
import {
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION,
  compileBookArtCreativeCandidateProgramme,
} from "@evavo/art-book-runtime/creative-candidate-programme";
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

function providerPolicy() {
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

function requiredProviderPolicy() {
  const policy = providerPolicy();
  if (!policy) {
    throw new Error(
      "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS must configure at least one allowed adapter before compiling a creative candidate programme.",
    );
  }
  return policy;
}

function configuredProgrammeInput(request: unknown): Record<string, unknown> {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Creative candidate programme request must be one object.");
  }
  const input = request as Record<string, unknown>;
  if (Object.hasOwn(input, "adapterPolicy")) {
    throw new Error(
      "Creative candidate programme request must not contain adapterPolicy; configure provider policy on the trusted MCP host.",
    );
  }
  return {
    ...input,
    adapterPolicy: requiredProviderPolicy(),
  };
}

function creativeDirectionProtocol() {
  return {
    schemaVersion: BOOK_CREATIVE_DIRECTION_SCHEMA_VERSION,
    contract: BOOK_CREATIVE_DIRECTION_CONTRACT,
    capabilities: listBookCreativeDirectionCapabilities().capabilities,
    manuscriptEvidenceRequired: true,
    materiallyDistinctRoutesRequired: true,
    generatedTypographyAllowed: false,
    namedCreatorImitationAllowed: false,
    brandedFranchiseTransferAllowed: false,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    candidateArtifactsWritten: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
    readOnly: true,
  } as const;
}

function creativeCandidateProgrammeProtocol() {
  return {
    schemaVersion: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION,
    contract: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
    providerPolicyConfigured: providerPolicy() !== undefined,
    providerPolicyEnvironment: {
      allowedAdapterIds: "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
      preferredAdapterId: "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
      preferredModel: "EVAVO_BOOK_ART_PROVIDER_MODEL",
    },
    recompilesCreativeDirectionFromManuscriptEvidence: true,
    routeSpecificBriefRequired: true,
    routeSpecificWorkOrderRequired: true,
    routeSpecificProviderPlanRequired: true,
    exactlyOneCandidatePerCreativeRoute: true,
    materiallyDistinctRoutesRequired: true,
    bulkSubmissionAllowed: false,
    partialProgrammeExecutionAllowed: false,
    providerFallbackAllowed: false,
    providerCallPerformed: false,
    runtimeJobsSubmitted: false,
    candidateArtifactsWritten: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  } as const;
}

export function registerBookCreativeDirectionTools(server: McpServer): void {
  server.registerTool(
    "book_creative_direction_protocol",
    {
      description:
        "Report the manuscript-led Book Art creative-direction contract and its read-only, compile-only authority boundary.",
      inputSchema: z.object({}),
    },
    async () => textResult(creativeDirectionProtocol()),
  );

  server.registerTool(
    "compile_book_creative_direction",
    {
      description:
        "Compile manuscript evidence into two to four materially distinct, fingerprinted Book Art creative routes and governed text-free briefs. This tool calls no provider, submits no runtime job, writes no artifact, selects nothing, promotes nothing and publishes nothing.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(await compileBookCreativeDirection(request));
      } catch (error: unknown) {
        return toolError("BOOK_CREATIVE_DIRECTION_COMPILATION_REJECTED", error);
      }
    },
  );

  server.registerTool(
    "book_creative_candidate_programme_protocol",
    {
      description:
        "Report the route-aware Book candidate programme contract. Each manuscript-led creative route becomes its own exact brief, work order and one-candidate no-fallback provider plan; this protocol submits nothing.",
      inputSchema: z.object({}),
    },
    async () => textResult(creativeCandidateProgrammeProtocol()),
  );

  server.registerTool(
    "compile_book_creative_candidate_programme",
    {
      description:
        "Recompile manuscript-led creative direction and turn every distinct route into its own fingerprinted Book Art work order and one-candidate provider job plan. Provider policy is injected by the trusted MCP host. This tool intentionally stops before runtime submission so an untrusted caller cannot partially execute the programme.",
      inputSchema: z.object({ request: z.unknown() }),
    },
    async ({ request }) => {
      try {
        return textResult(
          await compileBookArtCreativeCandidateProgramme(
            configuredProgrammeInput(request),
          ),
        );
      } catch (error: unknown) {
        return toolError(
          "BOOK_CREATIVE_CANDIDATE_PROGRAMME_COMPILATION_REJECTED",
          error,
        );
      }
    },
  );
}
