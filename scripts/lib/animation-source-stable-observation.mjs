import {
  assertAnimationSourceBundle,
  compileAnimationSourceBundle,
  verifyAnimationSourceBundleFiles,
} from "./animation-source-bundle.mjs";
import {
  ANIMATION_SOURCE_OBSERVATION_SCHEMA,
  DEFAULT_ANIMATION_SOURCE_OBSERVATION_CHUNK_BYTES,
  DEFAULT_ANIMATION_SOURCE_OBSERVATION_CONCURRENCY,
  AnimationSourceObservationError,
  abortObservationIfRequested,
  canonicalObservationJson,
  failObservation,
  normalizeObservationOptions,
} from "./animation-source-observation-common.mjs";
import { observeAnimationSourceFiles } from "./animation-source-file-observer.mjs";
import { SUPPORTED_ANIMATION_SOURCE_IMAGE_MEDIA_TYPES } from "./animation-source-image-probes.mjs";

export {
  ANIMATION_SOURCE_OBSERVATION_SCHEMA,
  DEFAULT_ANIMATION_SOURCE_OBSERVATION_CHUNK_BYTES,
  DEFAULT_ANIMATION_SOURCE_OBSERVATION_CONCURRENCY,
  AnimationSourceObservationError,
  SUPPORTED_ANIMATION_SOURCE_IMAGE_MEDIA_TYPES,
  observeAnimationSourceFiles,
};

function observationsEqual(left, right) {
  return canonicalObservationJson(left) === canonicalObservationJson(right);
}

function firstChangedPath(before, after) {
  const afterByPath = new Map(
    after.assets.map((entry) => [entry.relativePath, entry]),
  );
  for (const entry of before.assets) {
    if (!observationsEqual(entry, afterByPath.get(entry.relativePath))) {
      return entry.relativePath;
    }
  }
  return after.assets.find(
    (entry) =>
      !before.assets.some(
        (candidate) => candidate.relativePath === entry.relativePath,
      ),
  )?.relativePath;
}

async function withStableAnimationSourceObservation(
  descriptors,
  sourceRoot,
  operation,
  options = {},
) {
  if (typeof operation !== "function") {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_OPERATION_INVALID",
    );
  }
  const normalizedOptions = normalizeObservationOptions(options);
  const before = await observeAnimationSourceFiles(
    descriptors,
    sourceRoot,
    normalizedOptions,
  );
  if (normalizedOptions.onPhase) {
    await normalizedOptions.onPhase({
      phase: "before-operation",
      observation: before,
    });
  }
  abortObservationIfRequested(normalizedOptions.signal);
  const result = await operation(before);
  abortObservationIfRequested(normalizedOptions.signal);
  if (normalizedOptions.onPhase) {
    await normalizedOptions.onPhase({
      phase: "after-operation-before-observation",
      observation: before,
    });
  }
  const after = await observeAnimationSourceFiles(
    descriptors,
    sourceRoot,
    normalizedOptions,
  );
  if (!observationsEqual(before, after)) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_SOURCE_CHANGED_DURING_OPERATION",
      firstChangedPath(before, after) ?? "source-set",
    );
  }
  if (normalizedOptions.onPhase) {
    await normalizedOptions.onPhase({
      phase: "after-operation",
      observation: after,
    });
  }
  return Object.freeze({ result, observation: after });
}

function assertBundleMatchesObservation(bundle, observation) {
  const byPath = new Map(
    observation.assets.map((entry) => [entry.relativePath, entry]),
  );
  if (bundle.assets.length !== observation.assets.length) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_ASSET_COUNT_MISMATCH",
    );
  }
  for (const asset of bundle.assets) {
    const observed = byPath.get(asset.relativePath);
    if (
      !observed ||
      observed.byteLength !== asset.byteLength ||
      observed.sha256 !== asset.sha256 ||
      (observed.width !== undefined &&
        (observed.width !== asset.width ||
          observed.height !== asset.height))
    ) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_BUNDLE_MISMATCH",
        asset.assetId,
      );
    }
  }
}

function assertReceiptMatchesObservation(receipt, observation) {
  if (!receipt || !Array.isArray(receipt.evidence)) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_RECEIPT_INVALID",
    );
  }
  const byPath = new Map(
    observation.assets.map((entry) => [entry.relativePath, entry]),
  );
  if (receipt.evidence.length !== observation.assets.length) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_RECEIPT_COUNT_MISMATCH",
    );
  }
  for (const evidence of receipt.evidence) {
    const observed = byPath.get(evidence.relativePath);
    if (
      !observed ||
      observed.byteLength !== evidence.byteLength ||
      observed.sha256 !== evidence.sha256
    ) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_RECEIPT_MISMATCH",
        evidence.assetId,
      );
    }
  }
}

export async function compileAnimationSourceBundleStable(
  request,
  sourceRoot,
  options = {},
) {
  if (
    !request ||
    typeof request !== "object" ||
    !Array.isArray(request.assets)
  ) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_REQUEST_INVALID",
    );
  }
  const { result, observation } =
    await withStableAnimationSourceObservation(
      request.assets,
      sourceRoot,
      (before) => {
        const observedByPath = new Map(
          before.assets.map((entry) => [entry.relativePath, entry]),
        );
        const assets = request.assets.map((asset) => {
          const observed = observedByPath.get(asset.relativePath);
          if (!observed) {
            failObservation(
              "ANIMATION_SOURCE_BUNDLE_OBSERVATION_REQUEST_ASSET_MISSING",
              String(asset.assetId ?? asset.relativePath ?? "asset"),
            );
          }
          return {
            ...asset,
            ...(observed.width === undefined
              ? {}
              : { width: observed.width, height: observed.height }),
          };
        });
        return compileAnimationSourceBundle(
          { ...request, assets },
          sourceRoot,
          { concurrency: options.concurrency },
        );
      },
      options,
    );
  const bundle = assertAnimationSourceBundle(result);
  assertBundleMatchesObservation(bundle, observation);
  return bundle;
}

export async function verifyAnimationSourceBundleFilesStable(
  value,
  sourceRoot,
  options = {},
) {
  const bundle = assertAnimationSourceBundle(value);
  const { result, observation } =
    await withStableAnimationSourceObservation(
      bundle.assets,
      sourceRoot,
      () =>
        verifyAnimationSourceBundleFiles(bundle, sourceRoot, {
          concurrency: options.concurrency,
        }),
      options,
    );
  assertBundleMatchesObservation(bundle, observation);
  assertReceiptMatchesObservation(result, observation);
  return result;
}
