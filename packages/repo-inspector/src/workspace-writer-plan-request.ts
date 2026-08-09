import {
  MAXIMUM_OPERATIONS,
  type ArtWorkspaceFileOperationRequest,
  type ArtWorkspaceFilePlanRequest,
} from "./workspace-writer-types.js";
import {
  fail,
  isRecord,
  optionalString,
  requiredString,
  validateIdentifier,
  validateSha256,
} from "./workspace-writer-foundation.js";

function parseFileOperation(value: unknown, index: number): ArtWorkspaceFileOperationRequest {
  if (!isRecord(value)) {
    fail("ART_WORKSPACE_FILE_OPERATION_INVALID", `operations[${index}] is invalid.`);
  }
  const type = value.type;
  const expectedSourceSha256 = optionalString(
    value.expectedSourceSha256,
    `operations[${index}].expectedSourceSha256`,
  );
  validateSha256(expectedSourceSha256, `operations[${index}].expectedSourceSha256`);
  if (type === "trash") {
    return {
      type,
      source: requiredString(value.source, `operations[${index}].source`),
      ...(expectedSourceSha256 === undefined ? {} : { expectedSourceSha256 }),
    };
  }
  if (type === "replace") {
    const expectedTargetSha256 = requiredString(
      value.expectedTargetSha256,
      `operations[${index}].expectedTargetSha256`,
    );
    validateSha256(expectedTargetSha256, `operations[${index}].expectedTargetSha256`);
    return {
      type,
      source: requiredString(value.source, `operations[${index}].source`),
      target: requiredString(value.target, `operations[${index}].target`),
      expectedTargetSha256,
      ...(expectedSourceSha256 === undefined ? {} : { expectedSourceSha256 }),
    };
  }
  if (type === "copy" || type === "move" || type === "restore") {
    return {
      type,
      source: requiredString(value.source, `operations[${index}].source`),
      target: requiredString(value.target, `operations[${index}].target`),
      ...(expectedSourceSha256 === undefined ? {} : { expectedSourceSha256 }),
    };
  }
  fail("ART_WORKSPACE_FILE_OPERATION_INVALID", `operations[${index}].type is invalid.`);
}

export function parseFilePlanRequest(value: unknown): ArtWorkspaceFilePlanRequest {
  if (!isRecord(value) || !Array.isArray(value.operations)) {
    fail("ART_WORKSPACE_FILE_PLAN_REQUEST_INVALID", "File-plan request is invalid.");
  }
  if (value.operations.length < 1 || value.operations.length > MAXIMUM_OPERATIONS) {
    fail(
      "ART_WORKSPACE_FILE_OPERATION_COUNT_INVALID",
      `operations must contain 1-${MAXIMUM_OPERATIONS} entries.`,
    );
  }
  return {
    workspaceRoot: requiredString(value.workspaceRoot, "workspaceRoot"),
    idempotencyKey: validateIdentifier(
      requiredString(value.idempotencyKey, "idempotencyKey"),
      "idempotencyKey",
    ),
    operations: value.operations.map(parseFileOperation),
  };
}
