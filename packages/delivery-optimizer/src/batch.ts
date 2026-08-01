import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { deliveryBatchSha256 } from "./manifest.js";
import { optimizeDeliveryImage } from "./optimizer.js";
import {
  DELIVERY_OPTIMIZER_RECEIPT_SCHEMA,
  DELIVERY_OPTIMIZER_VERSION,
  PROFILE_CATALOG_VERSION,
  DeliveryOptimizerError,
  type DeliveryBatchManifest,
  type DeliveryBatchReceipt,
  type DeliveryBatchReceiptItem,
} from "./types.js";

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function regularSource(
  root: string,
  relativePath: string,
): Promise<string> {
  const lexical = path.resolve(root, ...relativePath.split("/"));
  if (!within(root, lexical)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_SOURCE_ESCAPE",
      `Source path escapes its root: ${relativePath}.`,
    );
  }
  const details = await lstat(lexical).catch(() => null);
  if (!details || !details.isFile() || details.isSymbolicLink()) {
    throw new DeliveryOptimizerError(
      "DELIVERY_SOURCE_NOT_REGULAR",
      `Source is missing, non-regular or symbolic: ${relativePath}.`,
    );
  }
  const resolved = await realpath(lexical);
  if (!within(root, resolved)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_SOURCE_ESCAPE",
      `Source resolves outside its root: ${relativePath}.`,
    );
  }
  return resolved;
}

async function requireAbsentOutputRoot(outputRoot: string): Promise<void> {
  if (await lstat(outputRoot).catch(() => null)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_OUTPUT_ROOT_EXISTS",
      `Output root already exists: ${outputRoot}.`,
    );
  }
}

function rejectRootOverlap(sourceRoot: string, outputRoot: string): void {
  if (within(sourceRoot, outputRoot) || within(outputRoot, sourceRoot)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_ROOTS_OVERLAP",
      "Source and output roots must not contain one another.",
    );
  }
}

export async function executeDeliveryBatch(options: Readonly<{
  manifest: DeliveryBatchManifest;
  sourceRoot: string;
  outputRoot: string;
  apply: boolean;
}>): Promise<DeliveryBatchReceipt> {
  const sourceRoot = await realpath(path.resolve(options.sourceRoot));
  const outputRoot = path.resolve(options.outputRoot);
  rejectRootOverlap(sourceRoot, outputRoot);
  await requireAbsentOutputRoot(outputRoot);
  const parent = path.dirname(outputRoot);
  await mkdir(parent, { recursive: true });
  const stagingRoot = options.apply
    ? await mkdtemp(path.join(parent, `.evavo-art-optimize-${randomUUID()}-`))
    : null;
  const receiptItems: DeliveryBatchReceiptItem[] = [];
  let sourceBytes = 0;
  let outputBytes = 0;

  try {
    for (const item of options.manifest.items) {
      const sourcePath = await regularSource(sourceRoot, item.sourcePath);
      const bytes = await readFile(sourcePath);
      if (bytes.byteLength !== item.sourceBytes) {
        throw new DeliveryOptimizerError(
          "DELIVERY_SOURCE_BYTES_MISMATCH",
          `${item.sourcePath} has ${bytes.byteLength} bytes, expected ${item.sourceBytes}.`,
        );
      }
      const actualSha256 = createHash("sha256").update(bytes).digest("hex");
      if (actualSha256 !== item.sourceSha256) {
        throw new DeliveryOptimizerError(
          "DELIVERY_SOURCE_SHA256_MISMATCH",
          `${item.sourcePath} SHA-256 does not match the manifest.`,
        );
      }
      const result = await optimizeDeliveryImage(bytes, {
        profileId: item.profileId,
        background: item.background,
      });
      sourceBytes += bytes.byteLength;
      outputBytes += result.bytes.byteLength;
      receiptItems.push({
        id: item.id,
        sourcePath: item.sourcePath,
        targetPath: item.targetPath,
        sourceSha256: item.sourceSha256,
        sourceBytes: item.sourceBytes,
        outputSha256: result.evidence.prepared.sha256,
        outputBytes: result.bytes.byteLength,
        profileId: item.profileId,
        transformations: result.evidence.transformations,
        selectedCandidateId: result.evidence.selectedCandidateId,
        evidence: result.evidence,
      });
      if (stagingRoot) {
        const target = path.join(stagingRoot, ...item.targetPath.split("/"));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, result.bytes, { flag: "wx" });
      }
    }

    const savedBytes = sourceBytes - outputBytes;
    const exactOutputPaths = Object.freeze([
      ...options.manifest.items.map((item) => item.targetPath).sort(),
      "optimization-receipt.json",
    ]);
    const receipt = {
      schema: DELIVERY_OPTIMIZER_RECEIPT_SCHEMA,
      optimizerVersion: DELIVERY_OPTIMIZER_VERSION,
      profileCatalogVersion: PROFILE_CATALOG_VERSION,
      batchId: options.manifest.batchId,
      batchSha256: deliveryBatchSha256(options.manifest),
      project: options.manifest.project,
      items: Object.freeze(receiptItems),
      totals: {
        files: receiptItems.length,
        sourceBytes,
        outputBytes,
        savedBytes,
        savedFraction: sourceBytes === 0 ? 0 : savedBytes / sourceBytes,
      },
      exactOutputPaths,
      mutationPerformed: options.apply,
    } satisfies DeliveryBatchReceipt;

    if (stagingRoot) {
      await writeFile(
        path.join(stagingRoot, "optimization-receipt.json"),
        `${JSON.stringify(receipt, null, 2)}\n`,
        { flag: "wx" },
      );
      await rename(stagingRoot, outputRoot);
    }
    return receipt;
  } catch (error: unknown) {
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}
