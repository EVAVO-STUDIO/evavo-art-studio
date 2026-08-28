import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  ANIMATION_SOURCE_OBSERVATION_SCHEMA,
  MAX_ANIMATION_SOURCE_ASSET_COUNT,
  abortObservationIfRequested,
  failObservation,
  mapObservationBounded,
  normalizeObservationDescriptor,
  normalizeObservationOptions,
  observationStatFingerprint,
  resolveContainedObservationPath,
  safeObservationFileSize,
  sameObservationFingerprint,
  sha256ObservationJson,
} from "./animation-source-observation-common.mjs";
import { probeAnimationSourceImage } from "./animation-source-image-probes.mjs";

function publicObservation(entry) {
  return Object.freeze({
    assetId: entry.assetId,
    relativePath: entry.relativePath,
    mediaType: entry.mediaType,
    byteLength: entry.byteLength,
    sha256: entry.sha256,
    ...(entry.width === undefined
      ? {}
      : { width: entry.width, height: entry.height }),
    identityDigest: entry.identityDigest,
  });
}

async function inspectOne(rootReal, descriptor, options) {
  abortObservationIfRequested(options.signal);
  const { portable, candidate } = resolveContainedObservationPath(
    rootReal,
    descriptor.relativePath,
  );
  const pathBefore = await lstat(candidate, { bigint: true });
  if (pathBefore.isSymbolicLink()) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_SYMLINK_FORBIDDEN",
      portable,
    );
  }
  if (!pathBefore.isFile()) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_ASSET_NOT_FILE",
      portable,
    );
  }

  const candidateReal = await realpath(candidate);
  const contained = relative(rootReal, candidateReal);
  if (
    contained === "" ||
    contained === ".." ||
    contained.startsWith(`..${sep}`) ||
    isAbsolute(contained)
  ) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_REALPATH_ESCAPES_ROOT",
      portable,
    );
  }

  const handle = await open(candidateReal, "r");
  let openedFingerprint;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile()) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_ASSET_NOT_FILE",
        portable,
      );
    }
    const pathFingerprint = observationStatFingerprint(pathBefore);
    openedFingerprint = observationStatFingerprint(opened);
    if (!sameObservationFingerprint(pathFingerprint, openedFingerprint)) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_IDENTITY_CHANGED_BEFORE_OPEN",
        portable,
      );
    }

    const size = safeObservationFileSize(opened, portable);
    const header = Buffer.alloc(Math.min(size, 64));
    const chunk = Buffer.alloc(Math.min(options.chunkBytes, size));
    const hash = createHash("sha256");
    let headerBytes = 0;
    let position = 0;

    while (position < size) {
      abortObservationIfRequested(options.signal);
      const length = Math.min(chunk.length, size - position);
      const { bytesRead } = await handle.read(chunk, 0, length, position);
      if (bytesRead <= 0) {
        failObservation(
          "ANIMATION_SOURCE_BUNDLE_OBSERVATION_FILE_TRUNCATED",
          portable,
        );
      }
      const bytes = chunk.subarray(0, bytesRead);
      hash.update(bytes);
      if (headerBytes < header.length) {
        const copyLength = Math.min(
          header.length - headerBytes,
          bytes.length,
        );
        bytes.copy(header, headerBytes, 0, copyLength);
        headerBytes += copyLength;
      }
      position += bytesRead;
      if (options.onProgress) {
        await options.onProgress({
          assetId: descriptor.assetId,
          relativePath: portable,
          bytesRead: position,
          totalBytes: size,
        });
      }
    }

    const dimensions = await probeAnimationSourceImage(
      handle,
      header.subarray(0, headerBytes),
      size,
      descriptor.mediaType,
      portable,
    );
    if (
      dimensions &&
      descriptor.width !== undefined &&
      (dimensions.width !== descriptor.width ||
        dimensions.height !== descriptor.height)
    ) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_DIMENSION_MISMATCH",
        descriptor.assetId,
      );
    }

    const afterHandle = observationStatFingerprint(
      await handle.stat({ bigint: true }),
    );
    if (!sameObservationFingerprint(openedFingerprint, afterHandle)) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_FILE_CHANGED_WHILE_READING",
        portable,
      );
    }

    return {
      assetId: descriptor.assetId,
      relativePath: portable,
      mediaType: descriptor.mediaType,
      byteLength: size,
      sha256: `sha256:${hash.digest("hex")}`,
      ...(dimensions ?? {}),
      identityDigest: sha256ObservationJson(openedFingerprint),
      candidateReal,
      openedFingerprint,
    };
  } finally {
    await handle.close();
  }
}

async function verifyPathStillMatches(rootReal, entry) {
  const { candidate } = resolveContainedObservationPath(
    rootReal,
    entry.relativePath,
  );
  const pathAfter = await lstat(candidate, { bigint: true });
  if (pathAfter.isSymbolicLink() || !pathAfter.isFile()) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_PATH_REPLACED",
      entry.relativePath,
    );
  }
  const realAfter = await realpath(candidate);
  if (realAfter !== entry.candidateReal) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_PATH_REPLACED",
      entry.relativePath,
    );
  }
  if (
    !sameObservationFingerprint(
      observationStatFingerprint(pathAfter),
      entry.openedFingerprint,
    )
  ) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_PATH_REPLACED",
      entry.relativePath,
    );
  }
}

export async function observeAnimationSourceFiles(
  descriptors,
  sourceRoot,
  options = {},
) {
  if (
    !Array.isArray(descriptors) ||
    descriptors.length < 1 ||
    descriptors.length > MAX_ANIMATION_SOURCE_ASSET_COUNT
  ) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_ASSET_COUNT_INVALID",
    );
  }
  const normalizedOptions = normalizeObservationOptions(options);
  abortObservationIfRequested(normalizedOptions.signal);
  const normalized = descriptors.map(normalizeObservationDescriptor);
  const paths = new Set();
  const assetIds = new Set();
  for (const descriptor of normalized) {
    if (assetIds.has(descriptor.assetId)) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_ASSET_ID_DUPLICATE",
        descriptor.assetId,
      );
    }
    assetIds.add(descriptor.assetId);
    if (paths.has(descriptor.relativePath)) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_PATH_DUPLICATE",
        descriptor.relativePath,
      );
    }
    paths.add(descriptor.relativePath);
  }

  const rootReal = await realpath(resolve(sourceRoot));
  const rootState = await lstat(rootReal, { bigint: true });
  if (!rootState.isDirectory()) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_ROOT_NOT_DIRECTORY",
      rootReal,
    );
  }

  const inspected = await mapObservationBounded(
    normalized,
    normalizedOptions.concurrency,
    (descriptor) => inspectOne(rootReal, descriptor, normalizedOptions),
  );
  await Promise.all(
    inspected.map((entry) => verifyPathStillMatches(rootReal, entry)),
  );

  const assets = inspected.map(publicObservation);
  let totalBytes = 0;
  for (const asset of assets) {
    if (asset.byteLength > Number.MAX_SAFE_INTEGER - totalBytes) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_TOTAL_BYTES_OVERFLOW",
      );
    }
    totalBytes += asset.byteLength;
  }
  const sourceSetDigest = sha256ObservationJson(
    assets.map(({ identityDigest: _identityDigest, ...entry }) => entry),
  );
  const identitySetDigest = sha256ObservationJson(
    assets.map(({ relativePath, identityDigest }) => ({
      relativePath,
      identityDigest,
    })),
  );
  return Object.freeze({
    schema: ANIMATION_SOURCE_OBSERVATION_SCHEMA,
    sourceSetDigest,
    identitySetDigest,
    assetCount: assets.length,
    totalBytes,
    assets: Object.freeze(assets),
    authority: Object.freeze({
      candidateOnly: true,
      providerExecution: false,
      renderExecution: false,
      publication: false,
      repositoryMutation: false,
    }),
  });
}
