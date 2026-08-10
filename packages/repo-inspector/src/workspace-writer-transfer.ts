import path from "node:path";

import {
  assertArtWorkspaceRelativePath,
  assertUserSourcePath,
  assertUserTargetPath,
  canonicalJson,
  fail,
  isRecord,
  requiredString,
  sha256Bytes,
  validateIdentifier,
  validateSha256,
} from "./workspace-writer-foundation.js";
import {
  absoluteFromRelative,
  ensureSafeParent,
  existingFile,
  resolveWorkspaceRoot,
  writeJsonCreateOnly,
} from "./workspace-writer-filesystem.js";
import type { ArtWorkspaceWriterPolicy } from "./workspace-writer-types.js";

export const ART_WORKSPACE_TRANSFER_BUNDLE_VERSION =
  "evavo_art_workspace_transfer_bundle_v1" as const;
export const ART_WORKSPACE_TRANSFER_RECEIPT_VERSION =
  "evavo_art_workspace_transfer_receipt_v1" as const;
export const STORAGE_ART_INGEST_REQUEST_VERSION =
  "evavo.storage-art-ingest-request.v1" as const;
export const REPOSITORY_ASSET_WRITE_REQUEST_VERSION =
  "evavo.repository-asset-write-request.v1" as const;

export const DEFAULT_REPOSITORY_FILE_LIMIT_BYTES = 25 * 1024 * 1024;
export const DEFAULT_REPOSITORY_BATCH_LIMIT_BYTES = 250 * 1024 * 1024;
const SHA1_PATTERN = /^[0-9a-f]{40}$/u;
const BRANCH_PATTERN = /^(?:agent|automation)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,190}$/u;
const ROUTES = new Set(["auto", "repository", "storage", "both"]);

export type ArtWorkspaceTransferRoute =
  | "auto"
  | "repository"
  | "storage"
  | "both";

export interface ArtWorkspaceTransferAssetRequest {
  readonly assetId: string;
  readonly source: string;
  readonly route?: ArtWorkspaceTransferRoute;
  readonly expectedSha256?: string;
  readonly title?: string;
  readonly tags?: readonly string[];
  readonly repositoryTarget?: string;
  readonly expectedRepositoryTargetSha256?: string | null;
  readonly storageLogicalPath?: string;
}

export interface ArtWorkspaceRepositoryDestination {
  readonly repositoryRoot: string;
  readonly expectedHead: string;
  readonly branch: string;
  readonly commitMessage: string;
  readonly pushRequested?: boolean;
}

export interface ArtWorkspaceStorageDestination {
  readonly vaultId: string;
  readonly logicalPrefix?: string;
}

export interface ArtWorkspaceTransferRequest {
  readonly workspaceRoot: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly idempotencyKey: string;
  readonly assets: readonly ArtWorkspaceTransferAssetRequest[];
  readonly repository?: ArtWorkspaceRepositoryDestination;
  readonly storage?: ArtWorkspaceStorageDestination;
  readonly repositoryFileLimitBytes?: number;
  readonly repositoryBatchLimitBytes?: number;
}

export interface ArtWorkspaceTransferDecision {
  readonly assetId: string;
  readonly source: string;
  readonly sourceAbsolutePath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly requestedRoute: ArtWorkspaceTransferRoute;
  readonly selectedRoutes: readonly ("repository" | "storage")[];
  readonly repositoryTarget?: string;
  readonly storageLogicalPath?: string;
  readonly reason: string;
}

export interface ArtWorkspaceTransferBundle {
  readonly schema: typeof ART_WORKSPACE_TRANSFER_BUNDLE_VERSION;
  readonly bundleId: string;
  readonly requestFingerprint: string;
  readonly workspaceRoot: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly decisions: readonly ArtWorkspaceTransferDecision[];
  readonly storageRequest?: Record<string, unknown>;
  readonly repositoryRequest?: Record<string, unknown>;
  readonly handoffRelativeRoot: string;
  readonly repositoryBytes: number;
  readonly storageBytes: number;
  readonly compilePerformedWrites: false;
  readonly bytesFlowThroughMcp: false;
  readonly providerExecutionPerformed: false;
  readonly repositoryMutationPerformed: false;
  readonly storageMutationPerformed: false;
  readonly publicationAuthority: false;
}

export interface ArtWorkspaceTransferReceipt {
  readonly schema: typeof ART_WORKSPACE_TRANSFER_RECEIPT_VERSION;
  readonly bundleId: string;
  readonly requestFingerprint: string;
  readonly workspaceRoot: string;
  readonly bundleManifest: string;
  readonly bundleManifestSha256: string;
  readonly storageManifest?: string;
  readonly storageManifestSha256?: string;
  readonly repositoryManifest?: string;
  readonly repositoryManifestSha256?: string;
  readonly completedAt: string;
  readonly workspacePrivateStateMutated: true;
  readonly storageMutationPerformed: false;
  readonly repositoryMutationPerformed: false;
  readonly gitCommitCreated: false;
  readonly gitPushPerformed: false;
  readonly publicationAuthority: false;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  label: string,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || Number(result) < 1) {
    fail("ART_WORKSPACE_TRANSFER_LIMIT_INVALID", `${label} must be positive.`);
  }
  return Number(result);
}

function canonicalLogicalPath(value: string, label: string): string {
  const normalized = value.normalize("NFC");
  if (
    normalized !== value ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value === "." ||
    value === ".." ||
    value.startsWith("../") ||
    path.posix.normalize(value) !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail("ART_WORKSPACE_TRANSFER_LOGICAL_PATH_INVALID", `${label} is invalid.`);
  }
  return value;
}

function mediaTypeFor(fileName: string): string {
  switch (path.extname(fileName).toLowerCase()) {
    case ".png":
    case ".apng":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

function tagsFor(value: unknown, projectId: string): readonly string[] {
  if (value === undefined) return Object.freeze(["art", projectId]);
  if (
    !Array.isArray(value) ||
    value.length > 64 ||
    value.some(
      (item) =>
        typeof item !== "string" ||
        !item.trim() ||
        item !== item.trim() ||
        item.length > 128,
    )
  ) {
    fail("ART_WORKSPACE_TRANSFER_TAGS_INVALID", "tags are invalid.");
  }
  return Object.freeze([...new Set(value as string[])]);
}

function routeFor(value: unknown): ArtWorkspaceTransferRoute {
  const route = value ?? "auto";
  if (typeof route !== "string" || !ROUTES.has(route)) {
    fail("ART_WORKSPACE_TRANSFER_ROUTE_INVALID", "route is invalid.");
  }
  return route as ArtWorkspaceTransferRoute;
}

function parseRequest(value: unknown): ArtWorkspaceTransferRequest {
  if (!isRecord(value)) {
    fail("ART_WORKSPACE_TRANSFER_REQUEST_INVALID", "Transfer request is invalid.");
  }
  const assets = value.assets;
  if (!Array.isArray(assets) || assets.length < 1 || assets.length > 256) {
    fail(
      "ART_WORKSPACE_TRANSFER_ASSETS_INVALID",
      "assets must contain between 1 and 256 entries.",
    );
  }
  const repository = value.repository;
  const storage = value.storage;
  return {
    workspaceRoot: requiredString(value.workspaceRoot, "workspaceRoot"),
    projectId: validateIdentifier(
      requiredString(value.projectId, "projectId"),
      "projectId",
    ),
    sessionId: validateIdentifier(
      requiredString(value.sessionId, "sessionId"),
      "sessionId",
    ),
    idempotencyKey: validateIdentifier(
      requiredString(value.idempotencyKey, "idempotencyKey"),
      "idempotencyKey",
    ),
    assets: assets.map((item, index) => {
      if (!isRecord(item)) {
        fail(
          "ART_WORKSPACE_TRANSFER_ASSET_INVALID",
          `assets[${index}] is invalid.`,
        );
      }
      const expectedSha256 =
        typeof item.expectedSha256 === "string"
          ? item.expectedSha256
          : undefined;
      validateSha256(expectedSha256, `assets[${index}].expectedSha256`);
      const expectedTarget =
        item.expectedRepositoryTargetSha256 === null
          ? null
          : typeof item.expectedRepositoryTargetSha256 === "string"
            ? item.expectedRepositoryTargetSha256
            : undefined;
      if (typeof expectedTarget === "string") {
        validateSha256(
          expectedTarget,
          `assets[${index}].expectedRepositoryTargetSha256`,
        );
      }
      return {
        assetId: validateIdentifier(
          requiredString(item.assetId, `assets[${index}].assetId`),
          `assets[${index}].assetId`,
        ),
        source: assertUserSourcePath(
          requiredString(item.source, `assets[${index}].source`),
        ),
        route: routeFor(item.route),
        expectedSha256,
        title:
          typeof item.title === "string"
            ? requiredString(item.title, `assets[${index}].title`).trim()
            : undefined,
        tags: tagsFor(item.tags, String(value.projectId)),
        repositoryTarget:
          typeof item.repositoryTarget === "string"
            ? assertUserTargetPath(item.repositoryTarget)
            : undefined,
        expectedRepositoryTargetSha256: expectedTarget,
        storageLogicalPath:
          typeof item.storageLogicalPath === "string"
            ? canonicalLogicalPath(
                item.storageLogicalPath,
                `assets[${index}].storageLogicalPath`,
              )
            : undefined,
      };
    }),
    repository: isRecord(repository)
      ? {
          repositoryRoot: requiredString(
            repository.repositoryRoot,
            "repository.repositoryRoot",
          ),
          expectedHead: requiredString(
            repository.expectedHead,
            "repository.expectedHead",
          ),
          branch: requiredString(repository.branch, "repository.branch"),
          commitMessage: requiredString(
            repository.commitMessage,
            "repository.commitMessage",
          ),
          pushRequested: repository.pushRequested === true,
        }
      : undefined,
    storage: isRecord(storage)
      ? {
          vaultId: validateIdentifier(
            requiredString(storage.vaultId, "storage.vaultId"),
            "storage.vaultId",
          ),
          logicalPrefix:
            typeof storage.logicalPrefix === "string"
              ? canonicalLogicalPath(
                  storage.logicalPrefix,
                  "storage.logicalPrefix",
                )
              : undefined,
        }
      : undefined,
    repositoryFileLimitBytes:
      typeof value.repositoryFileLimitBytes === "number"
        ? value.repositoryFileLimitBytes
        : undefined,
    repositoryBatchLimitBytes:
      typeof value.repositoryBatchLimitBytes === "number"
        ? value.repositoryBatchLimitBytes
        : undefined,
  };
}

function validateDestinations(request: ArtWorkspaceTransferRequest): void {
  if (request.repository) {
    if (!SHA1_PATTERN.test(request.repository.expectedHead)) {
      fail(
        "ART_WORKSPACE_TRANSFER_REPOSITORY_HEAD_INVALID",
        "repository.expectedHead must be a lowercase 40-character Git SHA.",
      );
    }
    if (
      !BRANCH_PATTERN.test(request.repository.branch) ||
      request.repository.branch.endsWith("/") ||
      request.repository.branch.includes("//")
    ) {
      fail(
        "ART_WORKSPACE_TRANSFER_BRANCH_INVALID",
        "repository.branch must be a portable agent/* or automation/* branch.",
      );
    }
    if (request.repository.commitMessage.length > 256) {
      fail(
        "ART_WORKSPACE_TRANSFER_COMMIT_MESSAGE_INVALID",
        "repository.commitMessage is too long.",
      );
    }
  }
  for (const asset of request.assets) {
    const route = asset.route ?? "auto";
    if (
      (route === "repository" || route === "both") &&
      (!request.repository || !asset.repositoryTarget)
    ) {
      fail(
        "ART_WORKSPACE_TRANSFER_REPOSITORY_DESTINATION_MISSING",
        `${asset.assetId} requires repository destination data.`,
      );
    }
    if (
      (route === "storage" || route === "both") &&
      !request.storage
    ) {
      fail(
        "ART_WORKSPACE_TRANSFER_STORAGE_DESTINATION_MISSING",
        `${asset.assetId} requires storage destination data.`,
      );
    }
  }
}

function withSelfHash(
  value: Record<string, unknown>,
  hashField: string,
): Record<string, unknown> {
  const unsigned = { ...value };
  delete unsigned[hashField];
  return {
    ...unsigned,
    [hashField]: sha256Bytes(canonicalJson(unsigned)),
  };
}

export async function compileArtWorkspaceTransferBundle(
  requestValue: unknown,
  policy: ArtWorkspaceWriterPolicy,
): Promise<ArtWorkspaceTransferBundle> {
  const request = parseRequest(requestValue);
  validateDestinations(request);
  const workspaceRoot = await resolveWorkspaceRoot(
    request.workspaceRoot,
    policy,
  );
  const fileLimit = boundedInteger(
    request.repositoryFileLimitBytes,
    DEFAULT_REPOSITORY_FILE_LIMIT_BYTES,
    "repositoryFileLimitBytes",
  );
  const batchLimit = boundedInteger(
    request.repositoryBatchLimitBytes,
    DEFAULT_REPOSITORY_BATCH_LIMIT_BYTES,
    "repositoryBatchLimitBytes",
  );
  if (fileLimit > batchLimit) {
    fail(
      "ART_WORKSPACE_TRANSFER_LIMIT_INVALID",
      "repositoryFileLimitBytes may not exceed repositoryBatchLimitBytes.",
    );
  }

  const seenAssets = new Set<string>();
  const seenRepositoryTargets = new Set<string>();
  const seenStorageTargets = new Set<string>();
  const evidence = [];
  for (const asset of request.assets) {
    if (seenAssets.has(asset.assetId)) {
      fail(
        "ART_WORKSPACE_TRANSFER_DUPLICATE_ASSET",
        `Duplicate assetId: ${asset.assetId}`,
      );
    }
    seenAssets.add(asset.assetId);
    const source = await existingFile(workspaceRoot, asset.source);
    if (
      asset.expectedSha256 !== undefined &&
      asset.expectedSha256 !== source.sha256
    ) {
      fail(
        "ART_WORKSPACE_TRANSFER_SOURCE_DRIFTED",
        `${asset.assetId} no longer matches expectedSha256.`,
      );
    }
    evidence.push({ asset, source });
  }

  const preliminary = evidence.map(({ asset, source }) => {
    const requestedRoute = asset.route ?? "auto";
    let selectedRoutes: ("repository" | "storage")[];
    let reason: string;
    if (requestedRoute === "repository") {
      if (source.sizeBytes > fileLimit) {
        fail(
          "ART_WORKSPACE_TRANSFER_REPOSITORY_FILE_TOO_LARGE",
          `${asset.assetId} exceeds the ${fileLimit}-byte repository limit.`,
        );
      }
      selectedRoutes = ["repository"];
      reason = "explicit repository route";
    } else if (requestedRoute === "storage") {
      selectedRoutes = ["storage"];
      reason = "explicit storage route";
    } else if (requestedRoute === "both") {
      if (source.sizeBytes > fileLimit) {
        fail(
          "ART_WORKSPACE_TRANSFER_REPOSITORY_FILE_TOO_LARGE",
          `${asset.assetId} exceeds the repository limit for route=both.`,
        );
      }
      selectedRoutes = ["repository", "storage"];
      reason = "explicit repository and immutable-storage route";
    } else if (
      request.repository &&
      asset.repositoryTarget &&
      source.sizeBytes <= fileLimit
    ) {
      selectedRoutes = ["repository"];
      reason = "auto-selected repository within ordinary Git file limit";
    } else {
      if (!request.storage) {
        fail(
          "ART_WORKSPACE_TRANSFER_NO_SAFE_ROUTE",
          `${asset.assetId} has no safe repository or storage route.`,
        );
      }
      selectedRoutes = ["storage"];
      reason =
        source.sizeBytes > fileLimit
          ? "auto-routed to EVAVO Storage because the file exceeds ordinary Git limits"
          : "auto-routed to EVAVO Storage because no repository target was supplied";
    }
    return { asset, source, selectedRoutes, reason };
  });

  const preliminaryRepositoryBytes = preliminary
    .filter((item) => item.selectedRoutes.includes("repository"))
    .reduce((total, item) => total + item.source.sizeBytes, 0);
  if (preliminaryRepositoryBytes > batchLimit) {
    for (const item of preliminary) {
      if (
        item.selectedRoutes.includes("repository") &&
        item.asset.route === "auto" &&
        request.storage
      ) {
        item.selectedRoutes = ["storage"];
        item.reason =
          "auto-routed to EVAVO Storage because the repository batch limit was exceeded";
      }
    }
  }
  const repositoryBytes = preliminary
    .filter((item) => item.selectedRoutes.includes("repository"))
    .reduce((total, item) => total + item.source.sizeBytes, 0);
  if (repositoryBytes > batchLimit) {
    fail(
      "ART_WORKSPACE_TRANSFER_REPOSITORY_BATCH_TOO_LARGE",
      `Repository transfer exceeds the ${batchLimit}-byte batch limit.`,
    );
  }

  const decisions: ArtWorkspaceTransferDecision[] = preliminary.map(
    ({ asset, source, selectedRoutes, reason }) => {
      const sourceName = path.basename(source.relativePath);
      const repositoryTarget = selectedRoutes.includes("repository")
        ? asset.repositoryTarget
        : undefined;
      const storageLogicalPath = selectedRoutes.includes("storage")
        ? canonicalLogicalPath(
            asset.storageLogicalPath ??
              [
                request.storage?.logicalPrefix,
                request.projectId,
                request.sessionId,
                sourceName,
              ]
                .filter(Boolean)
                .join("/"),
            `${asset.assetId}.storageLogicalPath`,
          )
        : undefined;
      if (repositoryTarget) {
        const key = repositoryTarget.toLocaleLowerCase("en-US");
        if (seenRepositoryTargets.has(key)) {
          fail(
            "ART_WORKSPACE_TRANSFER_DUPLICATE_REPOSITORY_TARGET",
            `Duplicate repository target: ${repositoryTarget}`,
          );
        }
        seenRepositoryTargets.add(key);
      }
      if (
        storageLogicalPath &&
        path.posix.basename(storageLogicalPath) !== sourceName
      ) {
        fail(
          "ART_WORKSPACE_TRANSFER_STORAGE_BASENAME_MISMATCH",
          `${asset.assetId} storageLogicalPath must preserve the source basename.`,
        );
      }
      if (storageLogicalPath) {
        const key = storageLogicalPath.toLocaleLowerCase("en-US");
        if (seenStorageTargets.has(key)) {
          fail(
            "ART_WORKSPACE_TRANSFER_DUPLICATE_STORAGE_TARGET",
            `Duplicate storage target: ${storageLogicalPath}`,
          );
        }
        seenStorageTargets.add(key);
      }
      return Object.freeze({
        assetId: asset.assetId,
        source: source.relativePath,
        sourceAbsolutePath: source.absolutePath,
        sha256: source.sha256,
        sizeBytes: source.sizeBytes,
        requestedRoute: asset.route ?? "auto",
        selectedRoutes: Object.freeze([...selectedRoutes]),
        repositoryTarget,
        storageLogicalPath,
        reason,
      });
    },
  );

  const requestFingerprint = sha256Bytes(
    canonicalJson({
      request,
      decisions: decisions.map((decision) => ({
        assetId: decision.assetId,
        source: decision.source,
        sha256: decision.sha256,
        sizeBytes: decision.sizeBytes,
        selectedRoutes: decision.selectedRoutes,
        repositoryTarget: decision.repositoryTarget,
        storageLogicalPath: decision.storageLogicalPath,
      })),
    }),
  );
  const bundleId = `transfer_${requestFingerprint.slice(0, 24)}`;
  const handoffRelativeRoot = `.art-studio/handoffs/${bundleId}`;
  const storageItems = decisions
    .filter((decision) => decision.selectedRoutes.includes("storage"))
    .map((decision) => {
      const sourceAsset = request.assets.find(
        (asset) => asset.assetId === decision.assetId,
      )!;
      const sourceName = path.basename(decision.sourceAbsolutePath);
      return {
        assetId: decision.assetId,
        sourcePath: decision.sourceAbsolutePath,
        logicalPath: decision.storageLogicalPath,
        fileName: sourceName,
        mediaType: mediaTypeFor(sourceName),
        title: sourceAsset.title ?? sourceName,
        tags: tagsFor(sourceAsset.tags, request.projectId),
        sha256: decision.sha256,
        bytes: decision.sizeBytes,
        provenance: {
          projectId: request.projectId,
          sessionId: request.sessionId,
          artWorkspaceTransferBundleId: bundleId,
          sourceRelativePath: decision.source,
          sourceSha256: decision.sha256,
        },
      };
    });
  const storageRequest = storageItems.length
    ? withSelfHash(
        {
          schema: STORAGE_ART_INGEST_REQUEST_VERSION,
          enabled: true,
          projectId: request.projectId,
          sessionId: request.sessionId,
          vaultId: request.storage!.vaultId,
          workspaceRoot,
          allowedSourceRoots: [workspaceRoot],
          sourceIntakePlanSha256: requestFingerprint,
          idempotencyKeyPrefix: request.idempotencyKey,
          items: storageItems,
          authority: {
            sourceRead: true,
            storageWrite: false,
            repositoryMutation: false,
            sourceDeletion: false,
            physicalPurge: false,
            publication: false,
          },
          bytesFlowThroughMcp: false,
        },
        "requestSha256",
      )
    : undefined;

  const repositoryOperations = decisions
    .filter((decision) => decision.selectedRoutes.includes("repository"))
    .map((decision) => {
      const sourceAsset = request.assets.find(
        (asset) => asset.assetId === decision.assetId,
      )!;
      return {
        id: `put-${decision.assetId}`,
        kind: "put",
        sourcePath: decision.sourceAbsolutePath,
        sourceSha256: decision.sha256,
        sourceBytes: decision.sizeBytes,
        targetPath: decision.repositoryTarget,
        expectedTargetSha256:
          sourceAsset.expectedRepositoryTargetSha256 ?? null,
      };
    });
  const repositoryRequest = repositoryOperations.length
    ? withSelfHash(
        {
          schema: REPOSITORY_ASSET_WRITE_REQUEST_VERSION,
          repositoryRoot: request.repository!.repositoryRoot,
          expectedHead: request.repository!.expectedHead,
          branch: request.repository!.branch,
          commitMessage: request.repository!.commitMessage,
          pushRequested: request.repository!.pushRequested === true,
          operations: repositoryOperations,
          authority: {
            repositoryRead: true,
            sourceRead: true,
            repositoryWrite: false,
            commit: false,
            push: false,
            merge: false,
            mainMutation: false,
            forcePush: false,
            sourceDeletion: false,
          },
          bytesFlowThroughMcp: false,
        },
        "requestSha256",
      )
    : undefined;

  return Object.freeze({
    schema: ART_WORKSPACE_TRANSFER_BUNDLE_VERSION,
    bundleId,
    requestFingerprint,
    workspaceRoot,
    projectId: request.projectId,
    sessionId: request.sessionId,
    decisions: Object.freeze(decisions),
    storageRequest,
    repositoryRequest,
    handoffRelativeRoot,
    repositoryBytes,
    storageBytes: decisions
      .filter((decision) => decision.selectedRoutes.includes("storage"))
      .reduce((total, decision) => total + decision.sizeBytes, 0),
    compilePerformedWrites: false,
    bytesFlowThroughMcp: false,
    providerExecutionPerformed: false,
    repositoryMutationPerformed: false,
    storageMutationPerformed: false,
    publicationAuthority: false,
  });
}

export async function writeArtWorkspaceTransferBundle(
  bundle: ArtWorkspaceTransferBundle,
  policy: ArtWorkspaceWriterPolicy,
): Promise<ArtWorkspaceTransferReceipt> {
  if (
    !isRecord(bundle) ||
    bundle.schema !== ART_WORKSPACE_TRANSFER_BUNDLE_VERSION
  ) {
    fail(
      "ART_WORKSPACE_TRANSFER_BUNDLE_INVALID",
      "Transfer bundle schema is invalid.",
    );
  }
  if (policy.allowWrites !== true) {
    fail(
      "ART_WORKSPACE_WRITES_DISABLED",
      "Transfer manifest writes require EVAVO_ART_ALLOW_WRITES=true.",
    );
  }
  const workspaceRoot = await resolveWorkspaceRoot(bundle.workspaceRoot, policy);
  for (const decision of bundle.decisions) {
    const current = await existingFile(workspaceRoot, decision.source);
    if (
      current.sha256 !== decision.sha256 ||
      current.sizeBytes !== decision.sizeBytes ||
      current.absolutePath !== decision.sourceAbsolutePath
    ) {
      fail(
        "ART_WORKSPACE_TRANSFER_SOURCE_DRIFTED",
        `${decision.assetId} changed after transfer compilation.`,
      );
    }
  }

  const rootRelative = assertArtWorkspaceRelativePath(bundle.handoffRelativeRoot);
  const bundleRelative = `${rootRelative}/bundle.json`;
  const storageRelative = bundle.storageRequest
    ? `${rootRelative}/storage-ingest-request.json`
    : undefined;
  const repositoryRelative = bundle.repositoryRequest
    ? `${rootRelative}/repository-asset-write-request.json`
    : undefined;
  for (const relative of [
    bundleRelative,
    storageRelative,
    repositoryRelative,
  ].filter((value): value is string => Boolean(value))) {
    const absolute = absoluteFromRelative(workspaceRoot, relative);
    await ensureSafeParent(workspaceRoot, absolute);
    await writeJsonCreateOnly(
      absolute,
      relative === bundleRelative
        ? bundle
        : relative === storageRelative
          ? bundle.storageRequest
          : bundle.repositoryRequest,
    );
  }
  const bundleManifestSha256 = sha256Bytes(canonicalJson(bundle));
  const receipt: ArtWorkspaceTransferReceipt = {
    schema: ART_WORKSPACE_TRANSFER_RECEIPT_VERSION,
    bundleId: bundle.bundleId,
    requestFingerprint: bundle.requestFingerprint,
    workspaceRoot,
    bundleManifest: bundleRelative,
    bundleManifestSha256,
    storageManifest: storageRelative,
    storageManifestSha256: bundle.storageRequest
      ? sha256Bytes(canonicalJson(bundle.storageRequest))
      : undefined,
    repositoryManifest: repositoryRelative,
    repositoryManifestSha256: bundle.repositoryRequest
      ? sha256Bytes(canonicalJson(bundle.repositoryRequest))
      : undefined,
    completedAt: new Date().toISOString(),
    workspacePrivateStateMutated: true,
    storageMutationPerformed: false,
    repositoryMutationPerformed: false,
    gitCommitCreated: false,
    gitPushPerformed: false,
    publicationAuthority: false,
  };
  const receiptRelative = `${rootRelative}/receipt.json`;
  const receiptAbsolute = absoluteFromRelative(workspaceRoot, receiptRelative);
  await writeJsonCreateOnly(receiptAbsolute, receipt);
  return receipt;
}
