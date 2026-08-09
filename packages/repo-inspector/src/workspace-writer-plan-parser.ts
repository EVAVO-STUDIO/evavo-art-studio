import {
  ART_WORKSPACE_FILE_PLAN_VERSION,
  MAXIMUM_OPERATIONS,
  type ArtWorkspaceFileOperationRequest,
  type ArtWorkspaceFilePlan,
  type ArtWorkspaceFilePlanOperation,
} from "./workspace-writer-types.js";
import {
  assertRestoreSourcePath,
  assertUserSourcePath,
  assertUserTargetPath,
  canonicalJson,
  fail,
  isRecord,
  optionalString,
  requiredString,
  sha256Bytes,
  validateSha256,
} from "./workspace-writer-foundation.js";

export function planFingerprintPayload(plan: Omit<ArtWorkspaceFilePlan, "compiledAt" | "planFingerprint" | "writesPerformed" | "publicationAuthority">): unknown {
  return {
    schema: plan.schema,
    planId: plan.planId,
    idempotencyKeySha256: plan.idempotencyKeySha256,
    workspaceRoot: plan.workspaceRoot,
    operations: plan.operations,
  };
}

export function parseFilePlan(value: unknown): ArtWorkspaceFilePlan {
  if (!isRecord(value) || value.schema !== ART_WORKSPACE_FILE_PLAN_VERSION) {
    fail("ART_WORKSPACE_FILE_PLAN_INVALID", "File plan has an invalid schema.");
  }
  const planId = requiredString(value.planId, "planId");
  if (!/^fileplan_[0-9a-f]{24}$/u.test(planId)) {
    fail("ART_WORKSPACE_FILE_PLAN_INVALID", "planId is invalid.");
  }
  const idempotencyKeySha256 = requiredString(
    value.idempotencyKeySha256,
    "idempotencyKeySha256",
  );
  const planFingerprint = requiredString(value.planFingerprint, "planFingerprint");
  validateSha256(idempotencyKeySha256, "idempotencyKeySha256");
  validateSha256(planFingerprint, "planFingerprint");
  if (!Array.isArray(value.operations) || value.operations.length < 1) {
    fail("ART_WORKSPACE_FILE_PLAN_INVALID", "operations are invalid.");
  }
  if (value.operations.length > MAXIMUM_OPERATIONS) {
    fail("ART_WORKSPACE_FILE_PLAN_INVALID", "operations exceed the configured limit.");
  }
  const targetKeys = new Set<string>();
  const mutatingSourceKeys = new Set<string>();
  const operations = value.operations.map((operation, index): ArtWorkspaceFilePlanOperation => {
    if (!isRecord(operation)) {
      fail("ART_WORKSPACE_FILE_PLAN_INVALID", `operations[${index}] is invalid.`);
    }
    const type = operation.type;
    if (!["copy", "move", "restore", "replace", "trash"].includes(String(type))) {
      fail("ART_WORKSPACE_FILE_PLAN_INVALID", `operations[${index}].type is invalid.`);
    }
    const operationType = type as ArtWorkspaceFileOperationRequest["type"];
    const rawSource = requiredString(operation.source, `operations[${index}].source`);
    const source =
      operationType === "restore"
        ? assertRestoreSourcePath(rawSource)
        : assertUserSourcePath(rawSource);
    if (source.startsWith(".art-studio/intake/") && operationType !== "copy") {
      fail(
        "ART_WORKSPACE_INTAKE_IMMUTABLE",
        "Intake originals are immutable; copy them into a working art path before mutation.",
      );
    }
    const sourceSha256 = requiredString(
      operation.sourceSha256,
      `operations[${index}].sourceSha256`,
    );
    validateSha256(sourceSha256, `operations[${index}].sourceSha256`);
    if (!Number.isSafeInteger(operation.sourceSizeBytes) || (operation.sourceSizeBytes as number) < 0) {
      fail("ART_WORKSPACE_FILE_PLAN_INVALID", `operations[${index}].sourceSizeBytes is invalid.`);
    }
    if (["move", "restore", "replace", "trash"].includes(operationType)) {
      const sourceKey = source.toLocaleLowerCase("en-US");
      if (mutatingSourceKeys.has(sourceKey)) {
        fail(
          "ART_WORKSPACE_SOURCE_OPERATION_CONFLICT",
          `Multiple mutating operations address ${source}.`,
        );
      }
      mutatingSourceKeys.add(sourceKey);
    }

    let target: string | undefined;
    if (operationType !== "trash") {
      target = assertUserTargetPath(
        requiredString(operation.target, `operations[${index}].target`),
      );
      if (source.toLocaleLowerCase("en-US") === target.toLocaleLowerCase("en-US")) {
        fail("ART_WORKSPACE_SOURCE_TARGET_EQUAL", "source and target must differ.");
      }
      const targetKey = target.toLocaleLowerCase("en-US");
      if (targetKeys.has(targetKey)) {
        fail(
          "ART_WORKSPACE_TARGET_OPERATION_CONFLICT",
          `Multiple operations address target ${target}.`,
        );
      }
      targetKeys.add(targetKey);
    } else if (operation.target !== undefined) {
      fail("ART_WORKSPACE_FILE_PLAN_INVALID", "Trash operation may not include target.");
    }

    const targetSha256 = optionalString(
      operation.targetSha256,
      `operations[${index}].targetSha256`,
    );
    validateSha256(targetSha256, `operations[${index}].targetSha256`);
    if (operationType === "replace" && targetSha256 === undefined) {
      fail("ART_WORKSPACE_FILE_PLAN_INVALID", "Replace targetSha256 is required.");
    }
    if (operationType !== "replace" && targetSha256 !== undefined) {
      fail(
        "ART_WORKSPACE_FILE_PLAN_INVALID",
        `${operationType} may not include targetSha256.`,
      );
    }

    const trashPath = optionalString(
      operation.trashPath,
      `operations[${index}].trashPath`,
    );
    const expectedTrashPath =
      operationType === "trash"
        ? `.art-studio/trash/${planId}/removed/${source}`
        : operationType === "replace" && target
          ? `.art-studio/trash/${planId}/replaced/${target}`
          : undefined;
    if (trashPath !== expectedTrashPath) {
      fail(
        "ART_WORKSPACE_FILE_PLAN_INVALID",
        `operations[${index}].trashPath is not the exact governed path.`,
      );
    }

    return {
      index,
      type: operationType,
      source,
      sourceSha256,
      sourceSizeBytes: operation.sourceSizeBytes as number,
      ...(target === undefined ? {} : { target }),
      ...(targetSha256 === undefined ? {} : { targetSha256 }),
      ...(trashPath === undefined ? {} : { trashPath }),
    };
  });
  const workspaceRoot = requiredString(value.workspaceRoot, "workspaceRoot");
  const planSeedOperations = operations.map(({ trashPath: _trashPath, ...operation }) =>
    operation,
  );
  const expectedPlanId = `fileplan_${sha256Bytes(
    canonicalJson({
      idempotencyKeySha256,
      workspaceRoot,
      operations: planSeedOperations,
    }),
  ).slice(0, 24)}`;
  if (expectedPlanId !== planId) {
    fail("ART_WORKSPACE_FILE_PLAN_TAMPERED", "File plan ID is invalid.");
  }
  const planBase = {
    schema: ART_WORKSPACE_FILE_PLAN_VERSION,
    planId,
    idempotencyKeySha256,
    workspaceRoot,
    operations,
  } as const;
  const expected = sha256Bytes(canonicalJson(planFingerprintPayload(planBase)));
  if (expected !== planFingerprint) {
    fail("ART_WORKSPACE_FILE_PLAN_TAMPERED", "File plan fingerprint is invalid.");
  }
  return {
    ...planBase,
    compiledAt: requiredString(value.compiledAt, "compiledAt"),
    planFingerprint,
    writesPerformed: false,
    publicationAuthority: false,
  };
}
