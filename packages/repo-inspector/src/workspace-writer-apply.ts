import { lstat, readFile, rm, writeFile } from "node:fs/promises";

import {
  ART_WORKSPACE_FILE_RECEIPT_VERSION,
  DEFAULT_MAXIMUM_FILE_BYTES,
  type ArtWorkspaceFileReceipt,
  type ArtWorkspaceFileReceiptOperation,
  type ArtWorkspaceWriterPolicy,
} from "./workspace-writer-types.js";
import { fail, validatedLimit } from "./workspace-writer-foundation.js";
import {
  absoluteFromRelative,
  ensureSafeParent,
  resolveWorkspaceRoot,
  writeJsonCreateOnly,
} from "./workspace-writer-filesystem.js";
import { parseFilePlan } from "./workspace-writer-requests.js";
import {
  applyOperation,
  revalidatePlan,
  type JournalRecord,
} from "./workspace-writer-operations.js";
import { rollbackReceiptOperation } from "./workspace-writer-rollback.js";

async function writeJournal(filePath: string, journal: JournalRecord): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(journal, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w",
    mode: 0o600,
  });
}

export async function applyArtWorkspaceFilePlan(
  planValue: unknown,
  policy: ArtWorkspaceWriterPolicy,
): Promise<ArtWorkspaceFileReceipt> {
  if (policy.allowWrites !== true) {
    fail(
      "ART_WORKSPACE_WRITES_DISABLED",
      "File operations require EVAVO_ART_ALLOW_WRITES=true.",
    );
  }
  const plan = parseFilePlan(planValue);
  const workspaceRoot = await resolveWorkspaceRoot(plan.workspaceRoot, policy);
  if (workspaceRoot !== plan.workspaceRoot) {
    fail(
      "ART_WORKSPACE_FILE_PLAN_ROOT_DRIFTED",
      "File plan workspaceRoot no longer resolves to the same directory.",
    );
  }
  const maximumFileBytes = validatedLimit(
    policy.maximumFileBytes,
    DEFAULT_MAXIMUM_FILE_BYTES,
    "maximumFileBytes",
  );
  const receiptRelative = `.art-studio/receipts/file-plans/${plan.planId}.json`;
  const receiptAbsolute = absoluteFromRelative(workspaceRoot, receiptRelative);
  const existingReceipt = await readFile(receiptAbsolute, "utf8").catch(() => undefined);
  if (existingReceipt !== undefined) {
    const parsed = JSON.parse(existingReceipt) as ArtWorkspaceFileReceipt;
    if (
      parsed.schema !== ART_WORKSPACE_FILE_RECEIPT_VERSION ||
      parsed.planFingerprint !== plan.planFingerprint
    ) {
      fail(
        "ART_WORKSPACE_FILE_PLAN_IDEMPOTENCY_CONFLICT",
        "Existing receipt does not match this file plan.",
      );
    }
    return parsed;
  }

  const journalRelative = `.art-studio/.pending/${plan.planId}.json`;
  const journalAbsolute = absoluteFromRelative(workspaceRoot, journalRelative);
  await ensureSafeParent(workspaceRoot, journalAbsolute);
  if (await lstat(journalAbsolute).catch(() => undefined)) {
    fail(
      "ART_WORKSPACE_FILE_PLAN_RECOVERY_REQUIRED",
      `Pending journal exists: ${journalRelative}.`,
    );
  }
  await revalidatePlan(plan, workspaceRoot, maximumFileBytes);
  const initialJournal: JournalRecord = {
    schema: "evavo_art_workspace_file_journal_v1",
    planId: plan.planId,
    planFingerprint: plan.planFingerprint,
    state: "applying",
    completedOperationIndices: [],
    updatedAt: new Date().toISOString(),
  };
  await writeJsonCreateOnly(journalAbsolute, initialJournal);

  const completed: ArtWorkspaceFileReceiptOperation[] = [];
  try {
    for (const operation of plan.operations) {
      completed.push(await applyOperation(workspaceRoot, operation));
      await writeJournal(journalAbsolute, {
        ...initialJournal,
        completedOperationIndices: completed.map((item) => item.index),
        updatedAt: new Date().toISOString(),
      });
    }
    const receipt: ArtWorkspaceFileReceipt = {
      schema: ART_WORKSPACE_FILE_RECEIPT_VERSION,
      planId: plan.planId,
      planFingerprint: plan.planFingerprint,
      workspaceRoot,
      operations: completed,
      appliedAt: new Date().toISOString(),
      repositoryWorkingTreeMutated: true,
      gitCommitCreated: false,
      gitPushPerformed: false,
      publicationAuthority: false,
    };
    await ensureSafeParent(workspaceRoot, receiptAbsolute);
    await writeJsonCreateOnly(receiptAbsolute, receipt);
    await rm(journalAbsolute, { force: true });
    return receipt;
  } catch (error: unknown) {
    let rollbackFailure: unknown;
    for (const operation of [...completed].reverse()) {
      try {
        await rollbackReceiptOperation(workspaceRoot, operation);
      } catch (caught: unknown) {
        rollbackFailure ??= caught;
      }
    }
    await writeJournal(journalAbsolute, {
      ...initialJournal,
      state: "rollback-required",
      completedOperationIndices: completed.map((item) => item.index),
      error: `${error instanceof Error ? error.message : String(error)}${
        rollbackFailure
          ? `; rollback: ${rollbackFailure instanceof Error ? rollbackFailure.message : String(rollbackFailure)}`
          : ""
      }`,
      updatedAt: new Date().toISOString(),
    }).catch(() => undefined);
    throw error;
  }
}
