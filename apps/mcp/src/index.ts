
import path from "node:path";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import { validateArtBrief } from "@evavo/art-contracts";
import { CAPABILITY_CATALOG, createProductionPlan } from "@evavo/art-core";
import { assertPathWithinAllowedRoots, inspectRepository } from "@evavo/art-repo-inspector";

const server = new McpServer({
  name: "evavo-art-studio",
  version: "0.1.0",
});

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function allowedRoots(): readonly string[] {
  const configured = (process.env.EVAVO_ART_ALLOWED_ROOTS ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : [process.cwd()];
}

server.registerTool(
  "art_studio_capabilities",
  {
    description: "List the governed capabilities currently declared by EVAVO Art Studio.",
    inputSchema: z.object({}),
  },
  async () => textResult({ schemaVersion: "1.0", capabilities: CAPABILITY_CATALOG }),
);

server.registerTool(
  "validate_art_brief",
  {
    description: "Validate an EVAVO Art Studio art brief without creating work or calling an art provider.",
    inputSchema: z.object({ brief: z.unknown() }),
  },
  async ({ brief }) => textResult(validateArtBrief(brief)),
);

server.registerTool(
  "compile_art_production_plan",
  {
    description: "Compile a validated art brief into a deterministic work-order graph, quality gates and deliverables.",
    inputSchema: z.object({ brief: z.unknown() }),
  },
  async ({ brief }) => {
    const validation = validateArtBrief(brief);
    if (!validation.success) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify({ code: "INVALID_ART_BRIEF", issues: validation.issues }, null, 2) }],
      };
    }
    return textResult(createProductionPlan(validation.value));
  },
);

server.registerTool(
  "inspect_art_repository",
  {
    description: "Inspect a configured local project root for engine context, existing art and likely asset gaps. Symlinks and paths outside configured roots are rejected.",
    inputSchema: z.object({ repositoryPath: z.string().min(1) }),
  },
  async ({ repositoryPath }) => {
    try {
      const safePath = assertPathWithinAllowedRoots(repositoryPath, allowedRoots());
      return textResult(await inspectRepository(safePath));
    } catch (error: unknown) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify({ code: "REPOSITORY_INSPECTION_REJECTED", message: error instanceof Error ? error.message : String(error) }, null, 2) }],
      };
    }
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
