import path from "node:path";

import {
  DEFAULT_MAXIMUM_BASE64_BYTES,
  DEFAULT_MAXIMUM_FILE_BYTES,
  DEFAULT_PROCESS_OUTPUT_BYTES,
  DEFAULT_STORAGE_TIMEOUT_MS,
  MAXIMUM_OPERATIONS,
  MAXIMUM_SOURCES,
  type ArtWorkspaceWriterPolicy,
} from "./workspace-writer-types.js";
import { fail, validatedLimit } from "./workspace-writer-foundation.js";

function parsePathList(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePositiveEnvironmentInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    fail("ART_WORKSPACE_ENVIRONMENT_INVALID", `Invalid positive integer: ${value}`);
  }
  return parsed;
}

function parseStorageCommand(value: string | undefined): readonly string[] | undefined {
  if (!value?.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail(
      "ART_WORKSPACE_STORAGE_COMMAND_INVALID",
      "EVAVO_STORAGE_OPERATOR_COMMAND_JSON must be a JSON string array.",
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.length > 32 ||
    parsed.some(
      (item) =>
        typeof item !== "string" ||
        !item ||
        item.length > 4096 ||
        /[\u0000\r\n]/u.test(item),
    )
  ) {
    fail(
      "ART_WORKSPACE_STORAGE_COMMAND_INVALID",
      "Storage operator command must be a bounded non-empty string array.",
    );
  }
  return parsed as readonly string[];
}

export function artWorkspaceWriterPolicyFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ArtWorkspaceWriterPolicy {
  const allowedWorkspaceRoots = parsePathList(environment.EVAVO_ART_ALLOWED_ROOTS);
  const allowedImportRoots = parsePathList(environment.EVAVO_ART_IMPORT_ROOTS);
  const storageOperatorCommand = parseStorageCommand(
    environment.EVAVO_STORAGE_OPERATOR_COMMAND_JSON,
  );
  return {
    allowedWorkspaceRoots:
      allowedWorkspaceRoots.length > 0 ? allowedWorkspaceRoots : [process.cwd()],
    ...(allowedImportRoots.length > 0 ? { allowedImportRoots } : {}),
    allowWrites: environment.EVAVO_ART_ALLOW_WRITES === "true",
    allowStorageWrites: environment.EVAVO_ART_ALLOW_STORAGE_WRITES === "true",
    maximumFileBytes: parsePositiveEnvironmentInteger(
      environment.EVAVO_ART_WORKSPACE_MAX_FILE_BYTES,
      DEFAULT_MAXIMUM_FILE_BYTES,
    ),
    maximumBase64Bytes: parsePositiveEnvironmentInteger(
      environment.EVAVO_ART_WORKSPACE_MAX_BASE64_BYTES,
      DEFAULT_MAXIMUM_BASE64_BYTES,
    ),
    ...(storageOperatorCommand === undefined ? {} : { storageOperatorCommand }),
    storageTimeoutMs: parsePositiveEnvironmentInteger(
      environment.EVAVO_ART_STORAGE_TIMEOUT_MS,
      DEFAULT_STORAGE_TIMEOUT_MS,
    ),
    processOutputLimitBytes: parsePositiveEnvironmentInteger(
      environment.EVAVO_ART_STORAGE_OUTPUT_LIMIT_BYTES,
      DEFAULT_PROCESS_OUTPUT_BYTES,
    ),
  };
}

export function artWorkspaceWriterCapabilities(
  policy: ArtWorkspaceWriterPolicy,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schema: "evavo_art_workspace_writer_capabilities_v1",
    intake: Object.freeze({
      mountedPaths: true,
      boundedBase64: true,
      maximumSources: MAXIMUM_SOURCES,
      maximumFileBytes: validatedLimit(
        policy.maximumFileBytes,
        DEFAULT_MAXIMUM_FILE_BYTES,
        "maximumFileBytes",
      ),
      maximumBase64Bytes: validatedLimit(
        policy.maximumBase64Bytes,
        DEFAULT_MAXIMUM_BASE64_BYTES,
        "maximumBase64Bytes",
      ),
      signatureVerification: true,
      createOnly: true,
    }),
    preview: Object.freeze({ imageContent: true, sha256Bound: true }),
    fileOperations: Object.freeze([
      "copy",
      "move",
      "rename",
      "replace-with-exact-backup",
      "reversible-trash",
      "exact-restore",
    ]),
    storage: Object.freeze({
      evavoStorageHandoff: Boolean(policy.storageOperatorCommand),
      writesEnabled: policy.allowStorageWrites === true,
      physicalPurge: false,
    }),
    writesEnabled: policy.allowWrites === true,
    providerExecutionConnected: false,
    arbitraryShellAllowed: false,
    arbitraryGitArgumentsAllowed: false,
    gitCommitCreated: false,
    gitPushPerformed: false,
    deploymentMutationConnected: false,
    publicationAuthority: false,
  });
}
