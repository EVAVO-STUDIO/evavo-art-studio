import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { audioBatchSha256 } from "./manifest.js";
import { optimizeAudioDelivery } from "./optimizer.js";
import {
  AUDIO_DELIVERY_RECEIPT_SCHEMA,
  AUDIO_DELIVERY_VERSION,
  AUDIO_PROFILE_CATALOG_VERSION,
  AudioDeliveryError,
  type AudioBatchManifest,
  type AudioBatchReceipt,
} from "./types.js";

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function regularSource(root: string, relativePath: string): string {
  const lexical = path.resolve(root, ...relativePath.split("/"));
  if (!within(root, lexical)) {
    throw new AudioDeliveryError(
      "AUDIO_SOURCE_ESCAPE",
      `Source path escapes root: ${relativePath}.`,
    );
  }
  const details = fs.lstatSync(lexical, { throwIfNoEntry: false });
  if (!details || !details.isFile() || details.isSymbolicLink()) {
    throw new AudioDeliveryError(
      "AUDIO_SOURCE_NOT_REGULAR",
      `Source is missing, non-regular or symbolic: ${relativePath}.`,
    );
  }
  const resolved = fs.realpathSync(lexical);
  if (!within(root, resolved)) {
    throw new AudioDeliveryError(
      "AUDIO_SOURCE_ESCAPE",
      `Source resolves outside root: ${relativePath}.`,
    );
  }
  return resolved;
}

export async function executeAudioBatch(options: Readonly<{
  manifest: AudioBatchManifest;
  sourceRoot: string;
  outputRoot: string;
  apply: boolean;
}>): Promise<AudioBatchReceipt> {
  const sourceRoot = fs.realpathSync(path.resolve(options.sourceRoot));
  const outputRoot = path.resolve(options.outputRoot);
  if (within(sourceRoot, outputRoot) || within(outputRoot, sourceRoot)) {
    throw new AudioDeliveryError(
      "AUDIO_ROOTS_OVERLAP",
      "Source and output roots must not contain one another.",
    );
  }
  if (fs.lstatSync(outputRoot, { throwIfNoEntry: false })) {
    throw new AudioDeliveryError(
      "AUDIO_OUTPUT_ROOT_EXISTS",
      `Output root already exists: ${outputRoot}.`,
    );
  }
  const parent = path.dirname(outputRoot);
  fs.mkdirSync(parent, { recursive: true });
  const staging = options.apply
    ? fs.mkdtempSync(
        path.join(parent, `.evavo-audio-delivery-${randomUUID()}-`),
      )
    : null;
  const items: AudioBatchReceipt["items"] extends readonly (infer Item)[]
    ? Item[]
    : never = [];
  let sourceBytes = 0;
  let outputBytes = 0;
  try {
    for (const item of options.manifest.items) {
      const sourcePath = regularSource(sourceRoot, item.sourcePath);
      const bytes = fs.readFileSync(sourcePath);
      if (bytes.byteLength !== item.sourceBytes) {
        throw new AudioDeliveryError(
          "AUDIO_SOURCE_BYTES_MISMATCH",
          `${item.sourcePath} byte count changed.`,
        );
      }
      const actualSha = createHash("sha256").update(bytes).digest("hex");
      if (actualSha !== item.sourceSha256) {
        throw new AudioDeliveryError(
          "AUDIO_SOURCE_SHA256_MISMATCH",
          `${item.sourcePath} SHA-256 changed.`,
        );
      }
      const result = await optimizeAudioDelivery(bytes, {
        profileId: item.profileId,
        loop: item.loop,
      });
      sourceBytes += bytes.byteLength;
      outputBytes += result.bytes.byteLength;
      items.push(
        Object.freeze({
          id: item.id,
          sourcePath: item.sourcePath,
          targetPath: item.targetPath,
          sourceSha256: item.sourceSha256,
          sourceBytes: item.sourceBytes,
          outputSha256: result.evidence.prepared.sha256,
          outputBytes: result.bytes.byteLength,
          profileId: item.profileId,
          evidence: result.evidence,
        }),
      );
      if (staging) {
        const target = path.join(staging, ...item.targetPath.split("/"));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, result.bytes, { flag: "wx" });
      }
    }
    const savedBytes = sourceBytes - outputBytes;
    const receipt: AudioBatchReceipt = Object.freeze({
      schema: AUDIO_DELIVERY_RECEIPT_SCHEMA,
      optimizerVersion: AUDIO_DELIVERY_VERSION,
      profileCatalogVersion: AUDIO_PROFILE_CATALOG_VERSION,
      batchId: options.manifest.batchId,
      batchSha256: audioBatchSha256(options.manifest),
      project: options.manifest.project,
      items: Object.freeze(items),
      totals: Object.freeze({
        files: items.length,
        sourceBytes,
        outputBytes,
        savedBytes,
        savedFraction: sourceBytes === 0 ? 0 : savedBytes / sourceBytes,
      }),
      exactOutputPaths: Object.freeze([
        ...options.manifest.items.map((item) => item.targetPath).sort(),
        "audio-delivery-receipt.json",
      ]),
      mutationPerformed: options.apply,
    });
    if (staging) {
      fs.writeFileSync(
        path.join(staging, "audio-delivery-receipt.json"),
        `${JSON.stringify(receipt, null, 2)}\n`,
        { flag: "wx" },
      );
      fs.renameSync(staging, outputRoot);
    }
    return receipt;
  } catch (error: unknown) {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
