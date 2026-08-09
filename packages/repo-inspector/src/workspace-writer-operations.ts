import { lstat, rm, unlink } from "node:fs/promises";

import type {
  ArtWorkspaceFilePlan,
  ArtWorkspaceFilePlanOperation,
  ArtWorkspaceFileReceiptOperation,
} from "./workspace-writer-types.js";
import { fail, sha256File } from "./workspace-writer-foundation.js";
import {
  absoluteFromRelative,
  assertTargetAbsent,
  copyCreateOnly,
  ensureSafeParent,
  existingFile,
} from "./workspace-writer-filesystem.js";

export interface JournalRecord {
  readonly schema: "evavo_art_workspace_file_journal_v1";
  readonly planId: string;
  readonly planFingerprint: string;
  readonly state: "applying" | "rollback-required";
  readonly completedOperationIndices: readonly number[];
  readonly error?: string;
  readonly updatedAt: string;
}

export async function revalidatePlan(
  plan: ArtWorkspaceFilePlan,
  workspaceRoot: string,
  maximumFileBytes: number,
): Promise<void> {
  for (const operation of plan.operations) {
    const source = await existingFile(workspaceRoot, operation.source, maximumFileBytes);
    if (
      source.sha256 !== operation.sourceSha256 ||
      source.sizeBytes !== operation.sourceSizeBytes
    ) {
      fail(
        "ART_WORKSPACE_PLAN_SOURCE_STALE",
        `${operation.source} changed after planning.`,
      );
    }
    if (operation.type === "replace") {
      if (!operation.target || !operation.targetSha256 || !operation.trashPath) {
        fail("ART_WORKSPACE_FILE_PLAN_INVALID", "Replace operation is incomplete.");
      }
      const target = await existingFile(workspaceRoot, operation.target, maximumFileBytes);
      if (target.sha256 !== operation.targetSha256) {
        fail(
          "ART_WORKSPACE_PLAN_TARGET_STALE",
          `${operation.target} changed after planning.`,
        );
      }
      await assertTargetAbsent(workspaceRoot, operation.trashPath);
      continue;
    }
    if (operation.type === "trash") {
      if (!operation.trashPath) {
        fail("ART_WORKSPACE_FILE_PLAN_INVALID", "Trash operation is incomplete.");
      }
      await assertTargetAbsent(workspaceRoot, operation.trashPath);
      continue;
    }
    if (!operation.target) {
      fail("ART_WORKSPACE_FILE_PLAN_INVALID", "Target operation is incomplete.");
    }
    await assertTargetAbsent(workspaceRoot, operation.target);
  }
}

export async function moveCreateOnly(
  workspaceRoot: string,
  sourceRelative: string,
  targetRelative: string,
  expectedSha256: string,
): Promise<void> {
  const source = absoluteFromRelative(workspaceRoot, sourceRelative);
  const target = await assertTargetAbsent(workspaceRoot, targetRelative);
  await ensureSafeParent(workspaceRoot, target);
  await copyCreateOnly(source, target, expectedSha256);
  if (await sha256File(source) !== expectedSha256) {
    await rm(target, { force: true }).catch(() => undefined);
    fail(
      "ART_WORKSPACE_MOVE_SOURCE_DRIFTED",
      `${sourceRelative} changed before removal.`,
    );
  }
  try {
    await unlink(source);
  } catch (error: unknown) {
    await rm(target, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function applyOperation(
  workspaceRoot: string,
  operation: ArtWorkspaceFilePlanOperation,
): Promise<ArtWorkspaceFileReceiptOperation> {
  const sourceAbsolute = absoluteFromRelative(workspaceRoot, operation.source);
  if (operation.type === "copy") {
    if (!operation.target) fail("ART_WORKSPACE_FILE_PLAN_INVALID", "Copy target missing.");
    const targetAbsolute = await assertTargetAbsent(workspaceRoot, operation.target);
    await ensureSafeParent(workspaceRoot, targetAbsolute);
    await copyCreateOnly(sourceAbsolute, targetAbsolute, operation.sourceSha256);
    return {
      index: operation.index,
      type: operation.type,
      source: operation.source,
      sourceSha256: operation.sourceSha256,
      target: operation.target,
      targetSha256: operation.sourceSha256,
    };
  }
  if (operation.type === "move" || operation.type === "restore") {
    if (!operation.target) fail("ART_WORKSPACE_FILE_PLAN_INVALID", "Move target missing.");
    await moveCreateOnly(
      workspaceRoot,
      operation.source,
      operation.target,
      operation.sourceSha256,
    );
    return {
      index: operation.index,
      type: operation.type,
      source: operation.source,
      sourceSha256: operation.sourceSha256,
      target: operation.target,
      targetSha256: operation.sourceSha256,
    };
  }
  if (operation.type === "trash") {
    if (!operation.trashPath) fail("ART_WORKSPACE_FILE_PLAN_INVALID", "Trash path missing.");
    await moveCreateOnly(
      workspaceRoot,
      operation.source,
      operation.trashPath,
      operation.sourceSha256,
    );
    return {
      index: operation.index,
      type: operation.type,
      source: operation.source,
      sourceSha256: operation.sourceSha256,
      trashPath: operation.trashPath,
      targetSha256: operation.sourceSha256,
    };
  }
  if (!operation.target || !operation.targetSha256 || !operation.trashPath) {
    fail("ART_WORKSPACE_FILE_PLAN_INVALID", "Replace operation is incomplete.");
  }
  const targetAbsolute = absoluteFromRelative(workspaceRoot, operation.target);
  const backupAbsolute = await assertTargetAbsent(workspaceRoot, operation.trashPath);
  await ensureSafeParent(workspaceRoot, backupAbsolute);
  await copyCreateOnly(targetAbsolute, backupAbsolute, operation.targetSha256);
  if (await sha256File(targetAbsolute) !== operation.targetSha256) {
    await rm(backupAbsolute, { force: true }).catch(() => undefined);
    fail(
      "ART_WORKSPACE_REPLACE_TARGET_DRIFTED",
      `${operation.target} changed before replacement.`,
    );
  }
  await unlink(targetAbsolute);
  try {
    await copyCreateOnly(sourceAbsolute, targetAbsolute, operation.sourceSha256);
  } catch (error: unknown) {
    if (!(await lstat(targetAbsolute).catch(() => undefined))) {
      await copyCreateOnly(backupAbsolute, targetAbsolute, operation.targetSha256).catch(
        () => undefined,
      );
    }
    throw error;
  }
  return {
    index: operation.index,
    type: operation.type,
    source: operation.source,
    sourceSha256: operation.sourceSha256,
    target: operation.target,
    targetSha256: operation.sourceSha256,
    priorTargetSha256: operation.targetSha256,
    trashPath: operation.trashPath,
  };
}
