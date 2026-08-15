import {
  analyseDecodedSpriteFrame,
  decodeSpriteFrame,
} from "@evavo/art-quality";

import {
  BRASS_ART_BATCH_REVIEW_SCHEMA,
  DEFAULT_MAXIMUM_DEPTH,
  DEFAULT_MAXIMUM_FILES,
  DEFAULT_MAXIMUM_TOTAL_BYTES,
  HARD_MAXIMUM_DEPTH,
  HARD_MAXIMUM_FILES,
  HARD_MAXIMUM_TOTAL_BYTES,
  MAXIMUM_FILE_BYTES,
  MAXIMUM_PIXELS,
  ArtBatchReviewError,
  type ArtBatchReviewInput,
  type StableFile,
  boundedInteger,
  canonicalJsonValue,
  normalizeExpectations,
  sha256,
} from "./batch-review-contract.js";
import {
  canonicalDirectory,
  discoverImageFiles,
  selectImageFiles,
  stableFileBytes,
} from "./batch-review-files.js";
import {
  duplicateGroups,
  errorCode,
  errorMessage,
  failedGateIds,
  technicalActions,
  warningGateIds,
} from "./batch-review-gates.js";

export * from "./batch-review-contract.js";

export async function reviewArtBatchDirectory(
  input: ArtBatchReviewInput,
): Promise<Readonly<Record<string, unknown>>> {
  const roleId = String(input.roleId ?? "").normalize("NFC").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(roleId)) {
    throw new ArtBatchReviewError(
      "ART_BATCH_ROLE_ID_INVALID",
      "roleId must be one explicit lowercase kebab-case game-owned media role.",
    );
  }
  const maximumFiles = boundedInteger(
    input.maximumFiles,
    DEFAULT_MAXIMUM_FILES,
    1,
    HARD_MAXIMUM_FILES,
    "maximumFiles",
  );
  const maximumDepth = boundedInteger(
    input.maximumDepth,
    DEFAULT_MAXIMUM_DEPTH,
    0,
    HARD_MAXIMUM_DEPTH,
    "maximumDepth",
  );
  const maximumTotalBytes = boundedInteger(
    input.maximumTotalBytes,
    DEFAULT_MAXIMUM_TOTAL_BYTES,
    1,
    HARD_MAXIMUM_TOTAL_BYTES,
    "maximumTotalBytes",
  );
  const detail = input.detail ?? "failures";
  if (!(["summary", "failures", "all"] as const).includes(detail)) {
    throw new ArtBatchReviewError(
      "ART_BATCH_DETAIL_INVALID",
      "detail must be summary, failures or all.",
    );
  }
  const expectations = normalizeExpectations(input.expectations);
  const canonicalExpectations = canonicalJsonValue(expectations);
  const root = await canonicalDirectory(input.directoryPath, input.allowedRoots);
  const selectionMode =
    input.relativePaths === undefined ? "directory" : "exact-relative-paths";
  const discovered =
    input.relativePaths === undefined
      ? await discoverImageFiles({
          root,
          allowedRoots: input.allowedRoots,
          recursive: input.recursive ?? true,
          maximumFiles,
          maximumDepth,
        })
      : await selectImageFiles({
          root,
          allowedRoots: input.allowedRoots,
          relativePaths: input.relativePaths,
          maximumFiles,
        });
  const selectedRelativePaths = discovered.files.map((file) => file.relativePath);
  const selectionSha256 = sha256(
    Buffer.from(
      JSON.stringify(canonicalJsonValue(selectedRelativePaths)),
      "utf8",
    ),
  );
  const declaredBytes = discovered.files.reduce(
    (total, file) => total + file.sizeBytes,
    0,
  );
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumTotalBytes) {
    throw new ArtBatchReviewError(
      "ART_BATCH_TOTAL_BYTES_EXCEEDED",
      `Batch declares ${declaredBytes} bytes, exceeding maximumTotalBytes=${maximumTotalBytes}.`,
    );
  }

  const items: Readonly<Record<string, unknown>>[] = [];
  let reviewedBytes = 0;
  for (const file of discovered.files) {
    let stable: StableFile | undefined;
    try {
      stable = await stableFileBytes(file, input.allowedRoots);
      reviewedBytes += stable.sizeBytes;
      if (reviewedBytes > maximumTotalBytes) {
        throw new ArtBatchReviewError(
          "ART_BATCH_TOTAL_BYTES_EXCEEDED",
          `Stable reviewed bytes exceed maximumTotalBytes=${maximumTotalBytes}.`,
        );
      }
      const report = analyseDecodedSpriteFrame(
        await decodeSpriteFrame(stable.bytes, {
          maximumInputBytes: MAXIMUM_FILE_BYTES,
          maximumPixels: MAXIMUM_PIXELS,
        }),
        { ...expectations, frameId: file.relativePath },
      );
      const blockingGateIds = failedGateIds(report);
      const warnings = warningGateIds(report);
      const includeReport =
        detail === "all" || (detail === "failures" && !report.passed);
      items.push(
        Object.freeze({
          path: file.relativePath,
          sourceSha256: stable.sha256,
          bytes: stable.sizeBytes,
          rawRgbaSha256: report.rawRgbaSha256,
          passed: report.passed,
          source: report.source,
          alpha: Object.freeze({
            transparentFraction: report.alpha.transparentFraction,
            partialFraction: report.alpha.partialFraction,
            opaqueFraction: report.alpha.opaqueFraction,
            minimumAlpha: report.alpha.minimumAlpha,
            maximumAlpha: report.alpha.maximumAlpha,
          }),
          visibleBounds: Object.freeze({
            visibleFraction: report.visibleBounds.visibleFraction,
            clearance: report.visibleBounds.clearance,
            touchingSides: report.visibleBounds.touchingSides,
          }),
          fakeTransparency: Object.freeze({
            flatMatteDetected: report.fakeTransparency.flatMatteDetected,
            flatMatteConfidence: report.fakeTransparency.flatMatteConfidence,
            checkerboardDetected: report.fakeTransparency.checkerboardDetected,
            checkerboardConfidence:
              report.fakeTransparency.checkerboardConfidence,
            checkerboardTileSize:
              report.fakeTransparency.checkerboardTileSize,
            checkerboardFitFraction:
              report.fakeTransparency.checkerboardFitFraction,
            checkerboardCoverageFraction:
              report.fakeTransparency.checkerboardCoverageFraction,
            checkerboardRmse: report.fakeTransparency.checkerboardRmse,
            checkerboardColours:
              report.fakeTransparency.checkerboardColours,
          }),
          haloFraction: report.halo.haloFraction,
          unexpectedTransparentRgbFraction:
            report.transparentRgb.unexpectedFraction,
          blockingGateIds,
          warningGateIds: warnings,
          technicalActions: technicalActions(report),
          humanCreativeApprovalRequired: true,
          ...(includeReport ? { report } : {}),
        }),
      );
    } catch (error: unknown) {
      items.push(
        Object.freeze({
          path: file.relativePath,
          ...(stable
            ? { sourceSha256: stable.sha256, bytes: stable.sizeBytes }
            : { bytes: file.sizeBytes }),
          passed: false,
          error: Object.freeze({
            code: errorCode(error),
            message: errorMessage(error),
          }),
          blockingGateIds: Object.freeze(["file-review"]),
          warningGateIds: Object.freeze([]),
          technicalActions: Object.freeze(["manual-technical-review-required"]),
          humanCreativeApprovalRequired: true,
        }),
      );
    }
  }

  const passedFiles = items.filter((item) => item.passed === true).length;
  const failedFiles = items.length - passedFiles;
  const sourceDuplicateGroups = duplicateGroups(items, "sourceSha256");
  const decodedDuplicateGroups = duplicateGroups(items, "rawRgbaSha256");
  const identityDocument = {
    schemaVersion: "1.0",
    root,
    roleId,
    selectionMode,
    selectionSha256,
    expectations: canonicalExpectations,
    files: items.map((item) => ({
      path: item.path,
      sourceSha256: item.sourceSha256 ?? null,
      rawRgbaSha256: item.rawRgbaSha256 ?? null,
      passed: item.passed,
      error: item.error ?? null,
    })),
  };

  return Object.freeze({
    schemaVersion: "1.0",
    review: BRASS_ART_BATCH_REVIEW_SCHEMA,
    root,
    roleId,
    selectionMode,
    selectionSha256,
    technicalStatus: failedFiles === 0 ? "passed" : "blocked",
    batchIdentitySha256: sha256(
      Buffer.from(JSON.stringify(canonicalJsonValue(identityDocument)), "utf8"),
    ),
    expectations: canonicalExpectations,
    limits: Object.freeze({
      recursive: input.recursive ?? true,
      maximumFiles,
      maximumDepth,
      maximumTotalBytes,
      maximumFileBytes: MAXIMUM_FILE_BYTES,
      maximumPixels: MAXIMUM_PIXELS,
      detail,
    }),
    discovery: Object.freeze({
      selectionMode,
      selectionSha256,
      visitedEntries: discovered.visitedEntries,
      supportedImageFiles: discovered.files.length,
      ignoredDirectories: discovered.ignoredDirectories,
      unsupportedFiles: discovered.unsupportedFiles,
      declaredBytes,
      reviewedBytes,
      truncated: false,
    }),
    summary: Object.freeze({
      reviewedFiles: items.length,
      passedFiles,
      failedFiles,
      exactSourceDuplicateGroups: sourceDuplicateGroups.length,
      decodedPixelDuplicateGroups: decodedDuplicateGroups.length,
    }),
    duplicateGroups: Object.freeze({
      exactSource: sourceDuplicateGroups,
      decodedPixels: decodedDuplicateGroups,
      scope: "complete-reviewed-batch",
      selectionMode,
    }),
    items: Object.freeze(items),
    humanCreativeApprovalRequired: true,
    nativeGodotApprovalRequired: true,
    mutationPerformed: false,
    targetRepositoryMutationAllowed: false,
    deletionAuthority: false,
    promotionAuthority: false,
    publicationAuthority: false,
    truthBoundaries: Object.freeze([
      "A batch technical pass is not a judgement that the artwork is creatively good.",
      "Shared expectations are valid only for one role-consistent folder or exact selected batch.",
      "Duplicate evidence does not authorise deletion or canonical selection.",
      "Only Development Studio may admit evidence and publish target changes.",
    ]),
  });
}
