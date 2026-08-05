#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DELIVERY_OPTIMIZER_RECEIPT_SCHEMA,
  DELIVERY_OPTIMIZER_SCHEMA,
  DeliveryOptimizerError,
  PROFILE_CATALOG_VERSION,
  deliveryBatchSha256,
  deliveryProfileSha256,
  executeDeliveryBatch,
  listDeliveryImageProfiles,
  type DeliveryBatchReceipt,
} from "@evavo/art-delivery-optimizer";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import {
  BRASS_ART_PRODUCTION_MODE,
  BRASS_ART_PRODUCTION_PROFILE,
  BRASS_ART_PRODUCTION_TOOL_NAMES,
  BrassArtProductionMcpConfig,
  BrassArtProductionMcpError,
} from "./production-contract.js";
import { loadDeliveryManifestStrict } from "./production-manifest.js";

export {
  BRASS_ART_PRODUCTION_MODE,
  BRASS_ART_PRODUCTION_PROFILE,
  BRASS_ART_PRODUCTION_TOOL_NAMES,
  BrassArtProductionMcpConfig,
  BrassArtProductionMcpError,
} from "./production-contract.js";
export {
  loadDeliveryManifestStrict,
  parseStrictJson,
} from "./production-manifest.js";

export function productionCapabilityDocument(
  config: BrassArtProductionMcpConfig,
): Readonly<Record<string, unknown>> {
  const profiles = listDeliveryImageProfiles().map((profile) =>
    Object.freeze({
      id: profile.id,
      title: profile.title,
      target: profile.target,
      outputFormat: profile.outputFormat,
      maxWidth: profile.maxWidth,
      maxHeight: profile.maxHeight,
      transparencyPolicy: profile.transparencyPolicy,
      requireMeaningfulTransparency: profile.requireMeaningfulTransparency,
      profileSha256: deliveryProfileSha256(profile),
    }),
  );
  return Object.freeze({
    schemaVersion: "1.0",
    profile: BRASS_ART_PRODUCTION_PROFILE,
    mode: BRASS_ART_PRODUCTION_MODE,
    tools: BRASS_ART_PRODUCTION_TOOL_NAMES,
    sourceRoots: config.sourceRoots,
    evidenceRoot: config.evidenceRoot,
    manifestSchema: DELIVERY_OPTIMIZER_SCHEMA,
    receiptSchema: DELIVERY_OPTIMIZER_RECEIPT_SCHEMA,
    profileCatalogVersion: PROFILE_CATALOG_VERSION,
    profiles: Object.freeze(profiles),
    supportedBackgroundPolicies: Object.freeze([
      "preserve",
      "remove-border-matte",
      "luminance-alpha",
    ]),
    stagingWritesEnabled: true,
    createOnlyOutputs: true,
    atomicOutputPublication: true,
    sourceMutationAllowed: false,
    targetRepositoryMutationAllowed: false,
    deletionAuthority: false,
    providerExecutionAllowed: false,
    runtimeJobSubmissionAllowed: false,
    artifactReferenceMutationAllowed: false,
    promotionAuthority: false,
    publicationAuthority: false,
    arbitraryShellAllowed: false,
    arbitraryGitArgumentsAllowed: false,
    arbitraryExecutablePathsAllowed: false,
    executionPerformed: false,
    mutationPerformed: false,
    truthBoundaries: Object.freeze([
      "A staged derivative and receipt are not human creative approval.",
      "Staging does not modify the Brass & Brine checkout or publish Git changes.",
      "Development Studio must independently admit exact receipts and selected paths before publication.",
    ]),
  });
}

async function execute(
  config: BrassArtProductionMcpConfig,
  argumentsValue: Readonly<{
    sourceRoot: unknown;
    manifest: unknown;
    outputDirectory?: unknown;
    apply: boolean;
  }>,
): Promise<Readonly<Record<string, unknown>>> {
  const sourceRoot = config.resolveSourceRoot(argumentsValue.sourceRoot);
  const manifestPath = config.resolveManifest(argumentsValue.manifest);
  const loaded = loadDeliveryManifestStrict(manifestPath);
  const outputRoot = argumentsValue.apply
    ? config.resolveOutput(argumentsValue.outputDirectory)
    : path.join(
        config.evidenceRoot,
        `.evavo-art-preview-${loaded.manifest.batchId}-${randomUUID()}`,
      );
  const receipt = await executeDeliveryBatch({
    manifest: loaded.manifest,
    sourceRoot,
    outputRoot,
    apply: argumentsValue.apply,
  });
  return Object.freeze({
    schemaVersion: "1.0",
    operation: argumentsValue.apply
      ? "evavo_brass_art_delivery_staging_v1"
      : "evavo_brass_art_delivery_validation_v1",
    profile: BRASS_ART_PRODUCTION_PROFILE,
    sourceRoot,
    manifestPath,
    manifestFileSha256: loaded.manifestSha256,
    manifestBytes: loaded.bytes,
    canonicalBatchSha256: deliveryBatchSha256(loaded.manifest),
    ...(argumentsValue.apply ? { outputRoot } : {}),
    receipt: receipt satisfies DeliveryBatchReceipt,
    executionPerformed: true,
    stagingMutationPerformed: argumentsValue.apply,
    sourceMutationPerformed: false,
    targetRepositoryMutationPerformed: false,
    deletionPerformed: false,
    publicationAuthority: false,
    humanCreativeApproval: false,
  });
}

export async function validateArtDeliveryBatch(
  config: BrassArtProductionMcpConfig,
  argumentsValue: Readonly<{ sourceRoot: unknown; manifest: unknown }>,
): Promise<Readonly<Record<string, unknown>>> {
  return execute(config, { ...argumentsValue, apply: false });
}

export async function stageArtDeliveryBatch(
  config: BrassArtProductionMcpConfig,
  argumentsValue: Readonly<{
    sourceRoot: unknown;
    manifest: unknown;
    outputDirectory: unknown;
    apply: true;
  }>,
): Promise<Readonly<Record<string, unknown>>> {
  return execute(config, { ...argumentsValue, apply: true });
}

const server = new McpServer({
  name: "evavo-art-studio-brass-production",
  version: "1.0.0",
});

const textResult = (value: unknown) => ({
  content: [
    { type: "text" as const, text: JSON.stringify(value, null, 2) },
  ],
});

function toolError(error: unknown) {
  const code =
    error instanceof BrassArtProductionMcpError ||
    error instanceof DeliveryOptimizerError
      ? error.code
      : "ART_PRODUCTION_TOOL_REJECTED";
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

server.registerTool(
  "art_production_capabilities",
  {
    description:
      "Describe the bounded Brass art staging profile, governed delivery formats and permanent source/target/publication boundaries.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      return textResult(
        productionCapabilityDocument(
          BrassArtProductionMcpConfig.fromEnvironment(),
        ),
      );
    } catch (error: unknown) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "validate_art_delivery_batch",
  {
    description:
      "Read an exact delivery manifest, revalidate every selected source byte and execute the deterministic optimizer in memory without writing output.",
    inputSchema: z.object({
      sourceRoot: z.string().min(1),
      manifest: z.string().min(1),
    }),
  },
  async (argumentsValue) => {
    try {
      return textResult(
        await validateArtDeliveryBatch(
          BrassArtProductionMcpConfig.fromEnvironment(),
          argumentsValue,
        ),
      );
    } catch (error: unknown) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "stage_art_delivery_batch",
  {
    description:
      "Create one atomic, create-only derivative batch and optimization receipt below the external evidence root. The game checkout is never modified.",
    inputSchema: z.object({
      sourceRoot: z.string().min(1),
      manifest: z.string().min(1),
      outputDirectory: z.string().min(1).max(128),
      apply: z.literal(true),
    }),
  },
  async (argumentsValue) => {
    try {
      return textResult(
        await stageArtDeliveryBatch(
          BrassArtProductionMcpConfig.fromEnvironment(),
          argumentsValue,
        ),
      );
    } catch (error: unknown) {
      return toolError(error);
    }
  },
);

export async function startBrassArtProductionServer(): Promise<void> {
  BrassArtProductionMcpConfig.fromEnvironment();
  await server.connect(new StdioServerTransport());
}

const invoked = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;
if (invoked) {
  startBrassArtProductionServer().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
