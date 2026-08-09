import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ArtWorkspaceWriterError,
  applyArtWorkspaceFilePlan,
  archiveArtWorkspaceFileToStorage,
  artWorkspaceWriterCapabilities,
  artWorkspaceWriterPolicyFromEnvironment,
  compileArtWorkspaceFilePlan,
  intakeArtWorkspaceFiles,
  readArtWorkspaceMediaPreview,
} from "@evavo/art-repo-inspector/workspace-writer";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const server = new McpServer({
  name: "evavo-art-studio-workspace-writer",
  version: "1.0.0",
});

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
              error instanceof ArtWorkspaceWriterError
                ? error.code
                : "ART_WORKSPACE_WRITER_REJECTED",
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
  "art_workspace_writer_capabilities",
  {
    description:
      "Describe the configured attachment intake, image preview, exact file organisation, reversible trash and EVAVO Storage handoff boundary. This tool performs no mutation.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      return textResult(
        artWorkspaceWriterCapabilities(
          artWorkspaceWriterPolicyFromEnvironment(),
        ),
      );
    } catch (error: unknown) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "art_workspace_preview_image",
  {
    description:
      "Read one bounded image inside an allowed art workspace and return exact SHA-256 metadata plus MCP image content. No file is changed.",
    inputSchema: z.object({
      workspaceRoot: z.string().min(1),
      path: z.string().min(1),
      maximumBytes: z.number().int().positive().max(32 * 1024 * 1024).optional(),
    }),
  },
  async (request) => {
    try {
      const preview = await readArtWorkspaceMediaPreview(
        request,
        artWorkspaceWriterPolicyFromEnvironment(),
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                schema: preview.schema,
                path: preview.path,
                sha256: preview.sha256,
                sizeBytes: preview.sizeBytes,
                media: preview.media,
                repositoryMutationPerformed: false,
                publicationAuthority: false,
              },
              null,
              2,
            ),
          },
          {
            type: "image" as const,
            data: preview.dataBase64,
            mimeType: preview.media.mimeType,
          },
        ],
      };
    } catch (error: unknown) {
      return toolError(error);
    }
  },
);

const intakeSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("path"),
    path: z.string().min(1),
    name: z.string().min(1).optional(),
    expectedSha256: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
  }),
  z.object({
    kind: z.literal("base64"),
    name: z.string().min(1),
    dataBase64: z.string().min(1),
    expectedSha256: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
  }),
]);

server.registerTool(
  "art_workspace_intake_files",
  {
    description:
      "Intake mounted ChatGPT/Claude attachments, generated files or bounded base64 art into a create-only private Art Studio workspace with SHA-256 and media evidence. Requires EVAVO_ART_ALLOW_WRITES=true.",
    inputSchema: z.object({
      workspaceRoot: z.string().min(1),
      projectId: z.string().min(1).max(128),
      idempotencyKey: z.string().min(1).max(128),
      sources: z.array(intakeSourceSchema).min(1).max(256),
    }),
  },
  async (request) => {
    try {
      return textResult(
        await intakeArtWorkspaceFiles(
          request,
          artWorkspaceWriterPolicyFromEnvironment(),
        ),
      );
    } catch (error: unknown) {
      return toolError(error);
    }
  },
);

const fileOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("copy"),
    source: z.string().min(1),
    target: z.string().min(1),
    expectedSourceSha256: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
  }),
  z.object({
    type: z.literal("move"),
    source: z.string().min(1),
    target: z.string().min(1),
    expectedSourceSha256: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
  }),
  z.object({
    type: z.literal("restore"),
    source: z.string().min(1),
    target: z.string().min(1),
    expectedSourceSha256: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
  }),
  z.object({
    type: z.literal("replace"),
    source: z.string().min(1),
    target: z.string().min(1),
    expectedSourceSha256: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
    expectedTargetSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }),
  z.object({
    type: z.literal("trash"),
    source: z.string().min(1),
    expectedSourceSha256: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
  }),
]);

server.registerTool(
  "art_workspace_compile_file_plan",
  {
    description:
      "Compile an exact stale-detecting plan for copy, move/rename, replace-with-backup, reversible trash or restore. Compilation performs no writes.",
    inputSchema: z.object({
      workspaceRoot: z.string().min(1),
      idempotencyKey: z.string().min(1).max(128),
      operations: z.array(fileOperationSchema).min(1).max(512),
    }),
  },
  async (request) => {
    try {
      return textResult(
        await compileArtWorkspaceFilePlan(
          request,
          artWorkspaceWriterPolicyFromEnvironment(),
        ),
      );
    } catch (error: unknown) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "art_workspace_apply_file_plan",
  {
    description:
      "Apply one exact Art Studio file plan after revalidating source and target hashes. Writes are no-overwrite, reversible where destructive, journaled and receipt-backed. Requires EVAVO_ART_ALLOW_WRITES=true.",
    inputSchema: z.object({ plan: z.unknown() }),
  },
  async ({ plan }) => {
    try {
      return textResult(
        await applyArtWorkspaceFilePlan(
          plan,
          artWorkspaceWriterPolicyFromEnvironment(),
        ),
      );
    } catch (error: unknown) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "art_workspace_archive_to_evavo_storage",
  {
    description:
      "Archive one exact workspace file through the fixed server-side EVAVO Storage operator. The caller cannot supply an executable, shell arguments, environment or provider credentials.",
    inputSchema: z.object({
      workspaceRoot: z.string().min(1),
      source: z.string().min(1),
      vault: z.string().min(1).max(128),
      logicalPath: z.string().min(1).max(1024),
      title: z.string().min(1).max(256),
      idempotencyKey: z.string().min(1).max(128),
      mode: z.enum(["put", "upload"]).optional(),
    }),
  },
  async (request) => {
    try {
      return textResult(
        await archiveArtWorkspaceFileToStorage(
          request,
          artWorkspaceWriterPolicyFromEnvironment(),
        ),
      );
    } catch (error: unknown) {
      return toolError(error);
    }
  },
);

export async function startArtWorkspaceWriterServer(): Promise<void> {
  artWorkspaceWriterPolicyFromEnvironment();
  await server.connect(new StdioServerTransport());
}

const invoked = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;
if (invoked) {
  startArtWorkspaceWriterServer().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
