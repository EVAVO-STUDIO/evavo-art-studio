export const ART_WORKSPACE_INTAKE_RECEIPT_VERSION =
  "evavo_art_workspace_intake_receipt_v1" as const;
export const ART_WORKSPACE_FILE_PLAN_VERSION =
  "evavo_art_workspace_file_plan_v1" as const;
export const ART_WORKSPACE_FILE_RECEIPT_VERSION =
  "evavo_art_workspace_file_receipt_v1" as const;
export const ART_WORKSPACE_STORAGE_RECEIPT_VERSION =
  "evavo_art_workspace_storage_receipt_v1" as const;

export const DEFAULT_MAXIMUM_FILE_BYTES = 2 * 1024 * 1024 * 1024;
export const DEFAULT_MAXIMUM_BASE64_BYTES = 16 * 1024 * 1024;
export const DEFAULT_STORAGE_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_PROCESS_OUTPUT_BYTES = 1024 * 1024;
export const MAXIMUM_SOURCES = 256;
export const MAXIMUM_OPERATIONS = 512;
export const MAXIMUM_PREVIEW_BYTES = 32 * 1024 * 1024;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
export const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
export const PORTABLE_VAULT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
export const WINDOWS_RESERVED = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);
export const SUPPORTED_ART_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
  ".bmp",
  ".tga",
  ".tif",
  ".tiff",
  ".svg",
  ".exr",
  ".hdr",
  ".apng",
  ".psd",
  ".psb",
  ".kra",
  ".xcf",
  ".ase",
  ".aseprite",
  ".ai",
  ".afdesign",
  ".blend",
  ".zip",
  ".json",
  ".yaml",
  ".yml",
  ".atlas",
  ".tres",
  ".tscn",
  ".res",
  ".xml",
  ".toml",
]);
export const SIGNATURE_REQUIRED_EXTENSIONS = new Set([
  ".png",
  ".apng",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
  ".bmp",
  ".tif",
  ".tiff",
  ".svg",
  ".exr",
  ".hdr",
  ".psd",
  ".psb",
  ".zip",
]);
export const PRIVATE_SOURCE_PREFIXES = [
  ".art-studio/receipts/",
  ".art-studio/trash/",
  ".art-studio/.pending/",
] as const;

export class ArtWorkspaceWriterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ArtWorkspaceWriterError";
    this.code = code;
  }
}

export interface ArtWorkspaceWriterPolicy {
  readonly allowedWorkspaceRoots: readonly string[];
  readonly allowedImportRoots?: readonly string[];
  readonly allowWrites?: boolean;
  readonly allowStorageWrites?: boolean;
  readonly maximumFileBytes?: number;
  readonly maximumBase64Bytes?: number;
  readonly storageOperatorCommand?: readonly string[];
  readonly storageTimeoutMs?: number;
  readonly processOutputLimitBytes?: number;
}

export type ArtWorkspaceIntakeSource =
  | Readonly<{
      kind: "path";
      path: string;
      name?: string;
      expectedSha256?: string;
    }>
  | Readonly<{
      kind: "base64";
      name: string;
      dataBase64: string;
      expectedSha256?: string;
    }>;

export interface ArtWorkspaceIntakeRequest {
  readonly workspaceRoot: string;
  readonly projectId: string;
  readonly idempotencyKey: string;
  readonly sources: readonly ArtWorkspaceIntakeSource[];
}

export interface ArtWorkspaceMediaProbe {
  readonly extension: string;
  readonly format: string;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly hasAlphaChannel?: boolean;
  readonly signatureVerified: boolean;
}

export interface ArtWorkspaceIntakeFile {
  readonly index: number;
  readonly sourceKind: ArtWorkspaceIntakeSource["kind"];
  readonly originalName: string;
  readonly storedRelativePath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly media: ArtWorkspaceMediaProbe;
}

export interface ArtWorkspaceIntakeReceipt {
  readonly schema: typeof ART_WORKSPACE_INTAKE_RECEIPT_VERSION;
  readonly intakeId: string;
  readonly projectId: string;
  readonly idempotencyKeySha256: string;
  readonly requestFingerprint: string;
  readonly workspaceRoot: string;
  readonly intakeRelativeRoot: string;
  readonly files: readonly ArtWorkspaceIntakeFile[];
  readonly createdAt: string;
  readonly providerExecutionPerformed: false;
  readonly workspacePrivateStateMutated: true;
  readonly gitCommitCreated: false;
  readonly gitPushPerformed: false;
  readonly storageMutationPerformed: false;
  readonly publicationAuthority: false;
}

export interface ArtWorkspaceMediaPreviewRequest {
  readonly workspaceRoot: string;
  readonly path: string;
  readonly maximumBytes?: number;
}

export interface ArtWorkspaceMediaPreview {
  readonly schema: "evavo_art_workspace_media_preview_v1";
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly media: ArtWorkspaceMediaProbe;
  readonly dataBase64: string;
  readonly repositoryMutationPerformed: false;
  readonly publicationAuthority: false;
}

export type ArtWorkspaceFileOperationRequest =
  | Readonly<{
      type: "copy" | "move";
      source: string;
      target: string;
      expectedSourceSha256?: string;
    }>
  | Readonly<{
      type: "restore";
      source: string;
      target: string;
      expectedSourceSha256?: string;
    }>
  | Readonly<{
      type: "replace";
      source: string;
      target: string;
      expectedSourceSha256?: string;
      expectedTargetSha256: string;
    }>
  | Readonly<{
      type: "trash";
      source: string;
      expectedSourceSha256?: string;
    }>;

export interface ArtWorkspaceFilePlanRequest {
  readonly workspaceRoot: string;
  readonly idempotencyKey: string;
  readonly operations: readonly ArtWorkspaceFileOperationRequest[];
}

export interface ArtWorkspaceFilePlanOperation {
  readonly index: number;
  readonly type: ArtWorkspaceFileOperationRequest["type"];
  readonly source: string;
  readonly sourceSha256: string;
  readonly sourceSizeBytes: number;
  readonly target?: string;
  readonly targetSha256?: string;
  readonly trashPath?: string;
}

export interface ArtWorkspaceFilePlan {
  readonly schema: typeof ART_WORKSPACE_FILE_PLAN_VERSION;
  readonly planId: string;
  readonly idempotencyKeySha256: string;
  readonly workspaceRoot: string;
  readonly operations: readonly ArtWorkspaceFilePlanOperation[];
  readonly compiledAt: string;
  readonly planFingerprint: string;
  readonly writesPerformed: false;
  readonly publicationAuthority: false;
}

export interface ArtWorkspaceFileReceiptOperation {
  readonly index: number;
  readonly type: ArtWorkspaceFileOperationRequest["type"];
  readonly source: string;
  readonly sourceSha256: string;
  readonly target?: string;
  readonly targetSha256?: string;
  readonly priorTargetSha256?: string;
  readonly trashPath?: string;
}

export interface ArtWorkspaceFileReceipt {
  readonly schema: typeof ART_WORKSPACE_FILE_RECEIPT_VERSION;
  readonly planId: string;
  readonly planFingerprint: string;
  readonly workspaceRoot: string;
  readonly operations: readonly ArtWorkspaceFileReceiptOperation[];
  readonly appliedAt: string;
  readonly repositoryWorkingTreeMutated: true;
  readonly gitCommitCreated: false;
  readonly gitPushPerformed: false;
  readonly publicationAuthority: false;
}

export interface ArtWorkspaceStorageArchiveRequest {
  readonly workspaceRoot: string;
  readonly source: string;
  readonly vault: string;
  readonly logicalPath: string;
  readonly title: string;
  readonly idempotencyKey: string;
  readonly mode?: "put" | "upload";
}

export interface ArtWorkspaceStorageArchiveReceipt {
  readonly schema: typeof ART_WORKSPACE_STORAGE_RECEIPT_VERSION;
  readonly archiveId: string;
  readonly idempotencyKeySha256: string;
  readonly requestFingerprint: string;
  readonly source: string;
  readonly sourceSha256: string;
  readonly sourceSizeBytes: number;
  readonly vault: string;
  readonly logicalPath: string;
  readonly mode: "put" | "upload";
  readonly operatorResult: unknown;
  readonly completedAt: string;
  readonly providerCredentialExposed: false;
  readonly repositoryMutationPerformed: false;
  readonly publicationAuthority: false;
}
