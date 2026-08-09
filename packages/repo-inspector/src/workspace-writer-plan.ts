import {
  ART_WORKSPACE_FILE_PLAN_VERSION,
  DEFAULT_MAXIMUM_FILE_BYTES,
  type ArtWorkspaceFilePlan,
  type ArtWorkspaceFilePlanOperation,
  type ArtWorkspaceWriterPolicy,
} from "./workspace-writer-types.js";
import {
  assertUserSourcePath,
  assertRestoreSourcePath,
  assertUserTargetPath,
  canonicalJson,
  fail,
  sha256Bytes,
  validatedLimit,
} from "./workspace-writer-foundation.js";
import {
  assertTargetAbsent,
  existingFile,
  resolveWorkspaceRoot,
} from "./workspace-writer-filesystem.js";
import { parseFilePlanRequest, planFingerprintPayload } from "./workspace-writer-requests.js";

export async function compileArtWorkspaceFilePlan(
  requestValue: unknown,
  policy: ArtWorkspaceWriterPolicy,
): Promise<ArtWorkspaceFilePlan> {
  const request = parseFilePlanRequest(requestValue);
  const workspaceRoot = await resolveWorkspaceRoot(request.workspaceRoot, policy);
  const maximumFileBytes = validatedLimit(
    policy.maximumFileBytes,
    DEFAULT_MAXIMUM_FILE_BYTES,
    "maximumFileBytes",
  );
  const idempotencyKeySha256 = sha256Bytes(request.idempotencyKey);
  const operations: ArtWorkspaceFilePlanOperation[] = [];
  const targetKeys = new Set<string>();
  const mutatingSourceKeys = new Set<string>();

  for (let index = 0; index < request.operations.length; index += 1) {
    const operation = request.operations[index];
    if (!operation) continue;
    const sourcePath =
      operation.type === "restore"
        ? assertRestoreSourcePath(operation.source)
        : assertUserSourcePath(operation.source);
    if (sourcePath.startsWith(".art-studio/intake/") && operation.type !== "copy") {
      fail(
        "ART_WORKSPACE_INTAKE_IMMUTABLE",
        "Intake originals are immutable; copy them into a working art path before mutation.",
      );
    }
    const source = await existingFile(workspaceRoot, sourcePath, maximumFileBytes);
    if (
      operation.expectedSourceSha256 !== undefined &&
      operation.expectedSourceSha256 !== source.sha256
    ) {
      fail(
        "ART_WORKSPACE_SOURCE_SHA256_MISMATCH",
        `${sourcePath} no longer matches expectedSourceSha256.`,
      );
    }
    if (["move", "restore", "replace", "trash"].includes(operation.type)) {
      const sourceKey = sourcePath.toLocaleLowerCase("en-US");
      if (mutatingSourceKeys.has(sourceKey)) {
        fail(
          "ART_WORKSPACE_SOURCE_OPERATION_CONFLICT",
          `Multiple mutating operations address ${sourcePath}.`,
        );
      }
      mutatingSourceKeys.add(sourceKey);
    }

    if (operation.type === "trash") {
      operations.push({
        index,
        type: operation.type,
        source: sourcePath,
        sourceSha256: source.sha256,
        sourceSizeBytes: source.sizeBytes,
      });
      continue;
    }

    const targetPath = assertUserTargetPath(operation.target);
    if (sourcePath.toLocaleLowerCase("en-US") === targetPath.toLocaleLowerCase("en-US")) {
      fail("ART_WORKSPACE_SOURCE_TARGET_EQUAL", "source and target must differ.");
    }
    const targetKey = targetPath.toLocaleLowerCase("en-US");
    if (targetKeys.has(targetKey)) {
      fail(
        "ART_WORKSPACE_TARGET_OPERATION_CONFLICT",
        `Multiple operations address target ${targetPath}.`,
      );
    }
    targetKeys.add(targetKey);

    if (operation.type === "replace") {
      const target = await existingFile(workspaceRoot, targetPath, maximumFileBytes);
      if (target.sha256 !== operation.expectedTargetSha256) {
        fail(
          "ART_WORKSPACE_TARGET_SHA256_MISMATCH",
          `${targetPath} no longer matches expectedTargetSha256.`,
        );
      }
      operations.push({
        index,
        type: operation.type,
        source: sourcePath,
        sourceSha256: source.sha256,
        sourceSizeBytes: source.sizeBytes,
        target: targetPath,
        targetSha256: target.sha256,
      });
      continue;
    }
    await assertTargetAbsent(workspaceRoot, targetPath);
    operations.push({
      index,
      type: operation.type,
      source: sourcePath,
      sourceSha256: source.sha256,
      sourceSizeBytes: source.sizeBytes,
      target: targetPath,
    });
  }

  const base = { idempotencyKeySha256, workspaceRoot, operations };
  const planId = `fileplan_${sha256Bytes(canonicalJson(base)).slice(0, 24)}`;
  const enriched = operations.map((operation) =>
    operation.type === "trash"
      ? {
          ...operation,
          trashPath: `.art-studio/trash/${planId}/removed/${operation.source}`,
        }
      : operation.type === "replace" && operation.target
        ? {
            ...operation,
            trashPath: `.art-studio/trash/${planId}/replaced/${operation.target}`,
          }
        : operation,
  );
  const planBase = {
    schema: ART_WORKSPACE_FILE_PLAN_VERSION,
    planId,
    idempotencyKeySha256,
    workspaceRoot,
    operations: enriched,
  } as const;
  return {
    ...planBase,
    compiledAt: new Date().toISOString(),
    planFingerprint: sha256Bytes(canonicalJson(planFingerprintPayload(planBase))),
    writesPerformed: false,
    publicationAuthority: false,
  };
}
