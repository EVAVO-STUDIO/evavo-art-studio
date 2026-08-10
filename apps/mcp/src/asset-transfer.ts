import {
  artWorkspaceWriterPolicyFromEnvironment,
  compileArtWorkspaceTransferBundle,
  writeArtWorkspaceTransferBundle,
} from "@evavo/art-repo-inspector/workspace-writer";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const server = new McpServer({
  name: "evavo-art-studio-asset-transfer",
  version: "1.0.0",
});

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function errorResult(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            code:
              error &&
              typeof error === "object" &&
              "code" in error &&
              typeof error.code === "string"
                ? error.code
                : "ART_WORKSPACE_TRANSFER_REJECTED",
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      },
    ],
  };
}

const requestSchema = z.object({
  workspaceRoot: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  assets: z
    .array(
      z.object({
        assetId: z.string().min(1),
        source: z.string().min(1),
        route: z
          .enum(["auto", "repository", "storage", "both"])
          .optional(),
        expectedSha256: z.string().length(64).optional(),
        title: z.string().min(1).optional(),
        tags: z.array(z.string().min(1)).max(64).optional(),
        repositoryTarget: z.string().min(1).optional(),
        expectedRepositoryTargetSha256: z
          .union([z.string().length(64), z.null()])
          .optional(),
        storageLogicalPath: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(256),
  repository: z
    .object({
      repositoryRoot: z.string().min(1),
      expectedHead: z.string().length(40),
      branch: z.string().min(1),
      commitMessage: z.string().min(1).max(256),
      pushRequested: z.boolean().optional(),
    })
    .optional(),
  storage: z
    .object({
      vaultId: z.string().min(1),
      logicalPrefix: z.string().min(1).optional(),
    })
    .optional(),
  repositoryFileLimitBytes: z.number().int().positive().optional(),
  repositoryBatchLimitBytes: z.number().int().positive().optional(),
});

server.registerTool(
  "art_workspace_transfer_capabilities",
  {
    description:
      "Describe the path-only handoff from reviewed Art Studio workspace files to EVAVO Storage and the governed Git repository asset writer. No bytes, storage writes or repository writes are performed.",
    inputSchema: z.object({}),
  },
  async () =>
    textResult({
      schema: "evavo_art_workspace_transfer_capabilities_v1",
      compileTool: "art_workspace_compile_transfer_bundle",
      writeTool: "art_workspace_write_transfer_bundle",
      inputRoutes: ["auto", "repository", "storage", "both"],
      ordinaryGitFileLimitBytes: 25 * 1024 * 1024,
      ordinaryGitBatchLimitBytes: 250 * 1024 * 1024,
      bytesFlowThroughMcp: false,
      storageWritePerformed: false,
      repositoryWritePerformed: false,
      gitCommitCreated: false,
      gitPushPerformed: false,
      publicationAuthority: false,
      downstream: {
        storage:
          "storage_verify_art_handoff then storage_ingest_art_handoff",
        repository:
          "evavo_git_compile_asset_write then evavo_git_apply_asset_write",
      },
    }),
);

server.registerTool(
  "art_workspace_compile_transfer_bundle",
  {
    description:
      "Read exact workspace files, verify optional SHA-256 preconditions and compile Storage/repository handoffs with automatic large-file routing. This tool performs no writes.",
    inputSchema: requestSchema,
  },
  async (request) => {
    try {
      return textResult(
        await compileArtWorkspaceTransferBundle(
          request,
          artWorkspaceWriterPolicyFromEnvironment(),
        ),
      );
    } catch (error: unknown) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "art_workspace_write_transfer_bundle",
  {
    description:
      "Recompile and reverify exact workspace files, then create private create-only Storage and repository handoff manifests. It does not execute either downstream write.",
    inputSchema: requestSchema,
  },
  async (request) => {
    try {
      const policy = artWorkspaceWriterPolicyFromEnvironment();
      const bundle = await compileArtWorkspaceTransferBundle(request, policy);
      return textResult(await writeArtWorkspaceTransferBundle(bundle, policy));
    } catch (error: unknown) {
      return errorResult(error);
    }
  },
);

await server.connect(new StdioServerTransport());
