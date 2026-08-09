import {
  MAXIMUM_PREVIEW_BYTES,
  MAXIMUM_SOURCES,
  type ArtWorkspaceIntakeRequest,
  type ArtWorkspaceIntakeSource,
  type ArtWorkspaceMediaPreviewRequest,
} from "./workspace-writer-types.js";
import {
  fail,
  isRecord,
  optionalString,
  requiredString,
  validateIdentifier,
  validateSha256,
} from "./workspace-writer-foundation.js";

export function parseIntakeRequest(value: unknown): ArtWorkspaceIntakeRequest {
  if (!isRecord(value) || !Array.isArray(value.sources)) {
    fail("ART_WORKSPACE_INTAKE_REQUEST_INVALID", "Intake request is invalid.");
  }
  if (value.sources.length < 1 || value.sources.length > MAXIMUM_SOURCES) {
    fail(
      "ART_WORKSPACE_INTAKE_SOURCE_COUNT_INVALID",
      `sources must contain 1-${MAXIMUM_SOURCES} entries.`,
    );
  }
  const sources = value.sources.map((source, index): ArtWorkspaceIntakeSource => {
    if (!isRecord(source)) {
      fail("ART_WORKSPACE_INTAKE_SOURCE_INVALID", `sources[${index}] is invalid.`);
    }
    const kind = source.kind;
    if (kind === "path") {
      const expectedSha256 = optionalString(
        source.expectedSha256,
        `sources[${index}].expectedSha256`,
      );
      validateSha256(expectedSha256, `sources[${index}].expectedSha256`);
      return {
        kind,
        path: requiredString(source.path, `sources[${index}].path`),
        ...(source.name === undefined
          ? {}
          : { name: requiredString(source.name, `sources[${index}].name`) }),
        ...(expectedSha256 === undefined ? {} : { expectedSha256 }),
      };
    }
    if (kind === "base64") {
      const expectedSha256 = optionalString(
        source.expectedSha256,
        `sources[${index}].expectedSha256`,
      );
      validateSha256(expectedSha256, `sources[${index}].expectedSha256`);
      return {
        kind,
        name: requiredString(source.name, `sources[${index}].name`),
        dataBase64: requiredString(source.dataBase64, `sources[${index}].dataBase64`),
        ...(expectedSha256 === undefined ? {} : { expectedSha256 }),
      };
    }
    fail("ART_WORKSPACE_INTAKE_SOURCE_INVALID", `sources[${index}].kind is invalid.`);
  });
  return {
    workspaceRoot: requiredString(value.workspaceRoot, "workspaceRoot"),
    projectId: validateIdentifier(requiredString(value.projectId, "projectId"), "projectId"),
    idempotencyKey: validateIdentifier(
      requiredString(value.idempotencyKey, "idempotencyKey"),
      "idempotencyKey",
    ),
    sources,
  };
}

export function parsePreviewRequest(value: unknown): ArtWorkspaceMediaPreviewRequest {
  if (!isRecord(value)) {
    fail("ART_WORKSPACE_PREVIEW_REQUEST_INVALID", "Preview request is invalid.");
  }
  const maximumBytes = value.maximumBytes;
  if (
    maximumBytes !== undefined &&
    (!Number.isSafeInteger(maximumBytes) ||
      (maximumBytes as number) < 1 ||
      (maximumBytes as number) > MAXIMUM_PREVIEW_BYTES)
  ) {
    fail(
      "ART_WORKSPACE_PREVIEW_LIMIT_INVALID",
      `maximumBytes must be an integer from 1 to ${MAXIMUM_PREVIEW_BYTES}.`,
    );
  }
  return {
    workspaceRoot: requiredString(value.workspaceRoot, "workspaceRoot"),
    path: requiredString(value.path, "path"),
    ...(maximumBytes === undefined ? {} : { maximumBytes: maximumBytes as number }),
  };
}
