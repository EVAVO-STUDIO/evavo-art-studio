import { lstat, unlink } from "node:fs/promises";

import type { ArtWorkspaceFileReceiptOperation } from "./workspace-writer-types.js";
import { absoluteFromRelative, copyCreateOnly, existingFile } from "./workspace-writer-filesystem.js";
import { moveCreateOnly } from "./workspace-writer-operations.js";

export async function rollbackReceiptOperation(
  workspaceRoot: string,
  operation: ArtWorkspaceFileReceiptOperation,
): Promise<void> {
  if (operation.type === "copy" && operation.target) {
    const target = await existingFile(workspaceRoot, operation.target).catch(() => undefined);
    if (target && target.sha256 === operation.targetSha256) await unlink(target.absolutePath);
    return;
  }
  if (
    (operation.type === "move" || operation.type === "restore") &&
    operation.target
  ) {
    const target = await existingFile(workspaceRoot, operation.target).catch(() => undefined);
    const source = await lstat(absoluteFromRelative(workspaceRoot, operation.source)).catch(
      () => undefined,
    );
    if (target?.sha256 === operation.targetSha256 && !source) {
      await moveCreateOnly(
        workspaceRoot,
        operation.target,
        operation.source,
        operation.sourceSha256,
      );
    }
    return;
  }
  if (operation.type === "trash" && operation.trashPath) {
    const trashed = await existingFile(workspaceRoot, operation.trashPath).catch(
      () => undefined,
    );
    const source = await lstat(absoluteFromRelative(workspaceRoot, operation.source)).catch(
      () => undefined,
    );
    if (trashed?.sha256 === operation.sourceSha256 && !source) {
      await moveCreateOnly(
        workspaceRoot,
        operation.trashPath,
        operation.source,
        operation.sourceSha256,
      );
    }
    return;
  }
  if (
    operation.type === "replace" &&
    operation.target &&
    operation.trashPath &&
    operation.priorTargetSha256
  ) {
    const target = await existingFile(workspaceRoot, operation.target).catch(() => undefined);
    if (target && target.sha256 === operation.targetSha256) await unlink(target.absolutePath);
    const backup = await existingFile(workspaceRoot, operation.trashPath).catch(() => undefined);
    if (
      backup?.sha256 === operation.priorTargetSha256 &&
      !(await lstat(absoluteFromRelative(workspaceRoot, operation.target)).catch(() => undefined))
    ) {
      await copyCreateOnly(
        backup.absolutePath,
        absoluteFromRelative(workspaceRoot, operation.target),
        operation.priorTargetSha256,
      );
    }
  }
}
