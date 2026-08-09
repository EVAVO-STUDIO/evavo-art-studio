import { lstat, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

import {
  ART_WORKSPACE_INTAKE_RECEIPT_VERSION,
  type ArtWorkspaceIntakeFile,
  type ArtWorkspaceIntakeReceipt,
  type ArtWorkspaceWriterPolicy,
} from "./workspace-writer-types.js";
import { canonicalJson, fail, sha256Bytes } from "./workspace-writer-foundation.js";
import {
  absoluteFromRelative,
  assertNoSymlinkSegments,
  copyCreateOnly,
  ensureSafeParent,
  resolveWorkspaceRoot,
  writeBufferCreateOnly,
  writeJsonCreateOnly,
} from "./workspace-writer-filesystem.js";
import { parseIntakeRequest } from "./workspace-writer-requests.js";
import { prepareIntakeSource } from "./workspace-writer-intake-source.js";

export async function intakeArtWorkspaceFiles(
  requestValue: unknown,
  policy: ArtWorkspaceWriterPolicy,
): Promise<ArtWorkspaceIntakeReceipt> {
  if (policy.allowWrites !== true) {
    fail(
      "ART_WORKSPACE_WRITES_DISABLED",
      "Attachment intake requires EVAVO_ART_ALLOW_WRITES=true.",
    );
  }
  const request = parseIntakeRequest(requestValue);
  const workspaceRoot = await resolveWorkspaceRoot(request.workspaceRoot, policy);
  const prepared = await Promise.all(
    request.sources.map((source) => prepareIntakeSource(source, policy)),
  );
  const seenNames = new Set<string>();
  for (const item of prepared) {
    const key = item.safeName.normalize("NFC").toLocaleLowerCase("en-US");
    if (seenNames.has(key)) {
      fail(
        "ART_WORKSPACE_INTAKE_NAME_COLLISION",
        `Multiple sources resolve to ${item.safeName}.`,
      );
    }
    seenNames.add(key);
  }
  const idempotencyKeySha256 = sha256Bytes(request.idempotencyKey);
  const requestFingerprint = sha256Bytes(
    canonicalJson({
      projectId: request.projectId,
      idempotencyKeySha256,
      sources: prepared.map((item) => ({
        sourceKind: item.sourceKind,
        originalName: item.originalName,
        safeName: item.safeName,
        sha256: item.sha256,
        sizeBytes: item.sizeBytes,
        media: item.media,
      })),
    }),
  );
  const intakeId = `intake_${requestFingerprint.slice(0, 24)}`;
  const intakeRelativeRoot = `.art-studio/intake/${request.projectId}/${intakeId}`;
  const finalDirectory = absoluteFromRelative(workspaceRoot, intakeRelativeRoot);
  const receiptPath = path.join(finalDirectory, "receipt.json");
  const existingReceipt = await readFile(receiptPath, "utf8").catch(() => undefined);
  if (existingReceipt !== undefined) {
    const parsed = JSON.parse(existingReceipt) as ArtWorkspaceIntakeReceipt;
    if (
      parsed.schema !== ART_WORKSPACE_INTAKE_RECEIPT_VERSION ||
      parsed.requestFingerprint !== requestFingerprint
    ) {
      fail(
        "ART_WORKSPACE_INTAKE_IDEMPOTENCY_CONFLICT",
        "Existing intake receipt does not match this request.",
      );
    }
    return parsed;
  }

  const pendingRelative = `.art-studio/.pending/${intakeId}`;
  const pendingDirectory = absoluteFromRelative(workspaceRoot, pendingRelative);
  await ensureSafeParent(workspaceRoot, pendingDirectory);
  await assertNoSymlinkSegments(workspaceRoot, path.dirname(pendingDirectory));
  if (await lstat(pendingDirectory).catch(() => undefined)) {
    fail(
      "ART_WORKSPACE_INTAKE_PENDING_EXISTS",
      `A pending intake already exists for ${intakeId}.`,
    );
  }
  if (await lstat(finalDirectory).catch(() => undefined)) {
    fail(
      "ART_WORKSPACE_INTAKE_IDEMPOTENCY_CONFLICT",
      `Intake directory exists without its matching receipt: ${intakeRelativeRoot}.`,
    );
  }

  await mkdir(pendingDirectory);
  try {
    const files: ArtWorkspaceIntakeFile[] = [];
    for (let index = 0; index < prepared.length; index += 1) {
      const source = prepared[index];
      if (!source) continue;
      const storedName = `${String(index + 1).padStart(3, "0")}-${source.safeName}`;
      const pendingTarget = path.join(pendingDirectory, storedName);
      if (source.bytes) {
        await writeBufferCreateOnly(pendingTarget, source.bytes, source.sha256);
      } else if (source.sourcePath) {
        await copyCreateOnly(source.sourcePath, pendingTarget, source.sha256);
      } else {
        fail("ART_WORKSPACE_INTAKE_INTERNAL_INVALID", "Prepared source has no bytes.");
      }
      files.push({
        index,
        sourceKind: source.sourceKind,
        originalName: source.originalName,
        storedRelativePath: `${intakeRelativeRoot}/${storedName}`,
        sha256: source.sha256,
        sizeBytes: source.sizeBytes,
        media: source.media,
      });
    }
    const receipt: ArtWorkspaceIntakeReceipt = {
      schema: ART_WORKSPACE_INTAKE_RECEIPT_VERSION,
      intakeId,
      projectId: request.projectId,
      idempotencyKeySha256,
      requestFingerprint,
      workspaceRoot,
      intakeRelativeRoot,
      files,
      createdAt: new Date().toISOString(),
      providerExecutionPerformed: false,
      workspacePrivateStateMutated: true,
      gitCommitCreated: false,
      gitPushPerformed: false,
      storageMutationPerformed: false,
      publicationAuthority: false,
    };
    await writeJsonCreateOnly(path.join(pendingDirectory, "receipt.json"), receipt);
    await ensureSafeParent(workspaceRoot, finalDirectory);
    await rename(pendingDirectory, finalDirectory);
    return receipt;
  } catch (error: unknown) {
    await rm(pendingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
