import {
  BOOK_CREATIVE_DIRECTION_CONTRACT,
  BOOK_CREATIVE_DIRECTION_SCHEMA_VERSION,
  compileBookCreativeDirection,
  listBookCreativeDirectionCapabilities,
} from "@evavo/art-contracts";
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
}
