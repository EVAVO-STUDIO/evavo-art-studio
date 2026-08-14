import {
  SEMVER_PATTERN,
  exactKeys,
  fail,
  freeze,
  idValue,
  integerValue,
  literalTrue,
  numberValue,
  record,
  sha256,
  stringValue,
  strings,
} from "./layered-production-internal.js";
import type { CompiledLayeredProductionPlan } from "./layered-production-types.js";
import {
  ART_PRODUCTION_BLOCKING_DETECTIONS,
  ART_PRODUCTION_CAMERA_FAMILIES,
  ART_PRODUCTION_METRIC_IDS,
  ART_PRODUCTION_PROFILE_KIND,
} from "./art-production-orchestrator-types.js";
import type {
  ArtProductionBlockingDetection,
  ArtProductionCameraFamily,
  ArtProductionMetricId,
  ArtProductionPackagingOutput,
  ArtProductionProfileInput,
  CompiledArtProductionProfile,
} from "./art-production-orchestrator-types.js";

const CAMERA_FAMILY_SET = new Set<ArtProductionCameraFamily>(
  ART_PRODUCTION_CAMERA_FAMILIES,
);
const METRIC_SET = new Set<ArtProductionMetricId>(ART_PRODUCTION_METRIC_IDS);
const DETECTION_SET = new Set<ArtProductionBlockingDetection>(
  ART_PRODUCTION_BLOCKING_DETECTIONS,
);
const PACKAGING_OUTPUTS = new Set<ArtProductionPackagingOutput>([
  "individual-png",
  "animation-strip",
  "animation-grid",
  "atlas",
]);

function booleanFalse(value: unknown, label: string): false {
  if (value !== false) {
    fail("ART_PRODUCTION_PROFILE_INVALID", `${label} must remain false.`);
  }
  return false;
}

function cameraFamily(value: unknown, label: string): ArtProductionCameraFamily {
  const output = stringValue(value, label, 80) as ArtProductionCameraFamily;
  if (!CAMERA_FAMILY_SET.has(output)) {
    fail("ART_PRODUCTION_PROFILE_INVALID", `${label} is unsupported.`);
  }
  return output;
}

function assertCameraFamilyProjection(
  family: ArtProductionCameraFamily,
  projection: CompiledLayeredProductionPlan["style"]["projection"],
): void {
  const valid =
    family === "custom-fixed-90s" ||
    (family === "isometric-life-sim-90s" &&
      (projection === "dimetric" || projection === "isometric-2:1")) ||
    (family === "top-down-sports-90s" && projection === "top-down") ||
    (family === "side-on-arcade-90s" && projection === "side") ||
    (family === "interior-point-click-90s" &&
      (projection === "front" || projection === "three-quarter")) ||
    (family === "world-map-strategy-90s" &&
      (projection === "top-down" || projection === "front"));
  if (!valid) {
    fail(
      "ART_PRODUCTION_CAMERA_MISMATCH",
      `Camera family ${family} is incompatible with projection ${projection}.`,
    );
  }
}

function metricWeights(value: unknown): Readonly<Record<ArtProductionMetricId, number>> {
  const input = record(value, "profile.iteration.metricWeights");
  exactKeys(input, "profile.iteration.metricWeights", ART_PRODUCTION_METRIC_IDS);
  const output = {} as Record<ArtProductionMetricId, number>;
  let total = 0;
  for (const metricId of ART_PRODUCTION_METRIC_IDS) {
    const weight = numberValue(
      input[metricId],
      `profile.iteration.metricWeights.${metricId}`,
      0,
      1000,
    );
    output[metricId] = weight;
    total += weight;
  }
  if (total <= 0) {
    fail(
      "ART_PRODUCTION_PROFILE_INVALID",
      "At least one production review metric must have a positive weight.",
    );
  }
  return freeze(output);
}

function blockingDetections(value: unknown): readonly ArtProductionBlockingDetection[] {
  const output = strings(
    value,
    "profile.iteration.blockingDetections",
    ART_PRODUCTION_BLOCKING_DETECTIONS.length,
    ART_PRODUCTION_BLOCKING_DETECTIONS.length,
    80,
  ) as readonly ArtProductionBlockingDetection[];
  if (
    output.some((entry) => !DETECTION_SET.has(entry)) ||
    ART_PRODUCTION_BLOCKING_DETECTIONS.some((entry) => !output.includes(entry))
  ) {
    fail(
      "ART_PRODUCTION_PROFILE_INVALID",
      "blockingDetections must contain the complete governed detection set.",
    );
  }
  return freeze([...ART_PRODUCTION_BLOCKING_DETECTIONS]);
}

function packagingOutputs(value: unknown): readonly ArtProductionPackagingOutput[] {
  const output = strings(
    value,
    "profile.packaging.outputs",
    1,
    PACKAGING_OUTPUTS.size,
    80,
  ) as readonly ArtProductionPackagingOutput[];
  if (output.some((entry) => !PACKAGING_OUTPUTS.has(entry))) {
    fail("ART_PRODUCTION_PROFILE_INVALID", "Packaging output is unsupported.");
  }
  if (!output.includes("individual-png")) {
    fail(
      "ART_PRODUCTION_PROFILE_INVALID",
      "Packaging must retain individual PNG sources.",
    );
  }
  return freeze([...output]);
}

function normalizedProfileInput(
  value: unknown,
  plan: CompiledLayeredProductionPlan,
): ArtProductionProfileInput {
  const input = record(value, "profile");
  exactKeys(input, "profile", [
    "schemaVersion",
    "kind",
    "profileId",
    "revision",
    "game",
    "bindings",
    "camera",
    "iteration",
    "animation",
    "packaging",
    "authority",
  ]);
  if (input.schemaVersion !== "1.0" || input.kind !== ART_PRODUCTION_PROFILE_KIND) {
    fail(
      "ART_PRODUCTION_PROFILE_INVALID",
      "Art-production profile schema or kind is invalid.",
    );
  }
  const revision = stringValue(input.revision, "profile.revision", 50);
  if (!SEMVER_PATTERN.test(revision)) {
    fail(
      "ART_PRODUCTION_PROFILE_INVALID",
      "profile.revision must use semantic versioning.",
    );
  }

  const gameInput = record(input.game, "profile.game");
  exactKeys(gameInput, "profile.game", [
    "gameId",
    "gameTitle",
    "productionProfileId",
    "productionProjectId",
    "genre",
    "targetEra",
    "engine",
    "engineVersion",
  ]);
  const game = freeze({
    gameId: idValue(gameInput.gameId, "profile.game.gameId"),
    gameTitle: stringValue(gameInput.gameTitle, "profile.game.gameTitle", 300),
    productionProfileId: idValue(
      gameInput.productionProfileId,
      "profile.game.productionProfileId",
    ),
    productionProjectId: idValue(
      gameInput.productionProjectId,
      "profile.game.productionProjectId",
    ),
    genre: stringValue(gameInput.genre, "profile.game.genre", 200),
    targetEra: stringValue(gameInput.targetEra, "profile.game.targetEra", 200),
    engine: stringValue(gameInput.engine, "profile.game.engine", 100),
    engineVersion: stringValue(
      gameInput.engineVersion,
      "profile.game.engineVersion",
      100,
    ),
  });
  if (
    game.gameId !== plan.project.gameId ||
    game.gameTitle !== plan.project.gameTitle ||
    game.engine !== plan.project.engine ||
    game.engineVersion !== plan.project.engineVersion
  ) {
    fail(
      "ART_PRODUCTION_PROFILE_MISMATCH",
      "Game profile does not match the exact layered-production project.",
    );
  }

  const bindingsInput = record(input.bindings, "profile.bindings");
  exactKeys(bindingsInput, "profile.bindings", ["styleId", "cameraFamily"]);
  const boundCameraFamily = cameraFamily(
    bindingsInput.cameraFamily,
    "profile.bindings.cameraFamily",
  );
  const bindings = freeze({
    styleId: idValue(bindingsInput.styleId, "profile.bindings.styleId"),
    cameraFamily: boundCameraFamily,
  });
  if (bindings.styleId !== plan.style.styleId) {
    fail(
      "ART_PRODUCTION_PROFILE_MISMATCH",
      "Game profile style binding does not match the exact layered-production style.",
    );
  }

  const cameraInput = record(input.camera, "profile.camera");
  exactKeys(cameraInput, "profile.camera", [
    "family",
    "fixed",
    "projection",
    "yawDegrees",
    "pitchDegrees",
    "rollDegrees",
    "orthographicScale",
    "facingDirections",
  ]);
  const family = cameraFamily(cameraInput.family, "profile.camera.family");
  if (family !== boundCameraFamily) {
    fail(
      "ART_PRODUCTION_PROFILE_MISMATCH",
      "Camera family does not match the profile binding.",
    );
  }
  literalTrue(cameraInput.fixed, "profile.camera.fixed");
  if (cameraInput.projection !== plan.style.projection) {
    fail(
      "ART_PRODUCTION_CAMERA_MISMATCH",
      "Camera projection does not match the layered-production camera.",
    );
  }
  assertCameraFamilyProjection(family, plan.style.projection);
  const camera = freeze({
    family,
    fixed: true as const,
    projection: plan.style.projection,
    yawDegrees: numberValue(
      cameraInput.yawDegrees,
      "profile.camera.yawDegrees",
      -360,
      360,
    ),
    pitchDegrees: numberValue(
      cameraInput.pitchDegrees,
      "profile.camera.pitchDegrees",
      -90,
      90,
    ),
    rollDegrees: numberValue(
      cameraInput.rollDegrees,
      "profile.camera.rollDegrees",
      -360,
      360,
    ),
    orthographicScale: numberValue(
      cameraInput.orthographicScale,
      "profile.camera.orthographicScale",
      0.01,
      1000,
    ),
    facingDirections: strings(
      cameraInput.facingDirections,
      "profile.camera.facingDirections",
      1,
      16,
      20,
    ),
  });
  if (
    camera.yawDegrees !== plan.style.camera.yawDegrees ||
    camera.pitchDegrees !== plan.style.camera.pitchDegrees ||
    camera.rollDegrees !== plan.style.camera.rollDegrees ||
    camera.orthographicScale !== plan.style.camera.orthographicScale
  ) {
    fail(
      "ART_PRODUCTION_CAMERA_MISMATCH",
      "Camera angles or orthographic scale do not match the exact layered-production plan.",
    );
  }

  const iterationInput = record(input.iteration, "profile.iteration");
  exactKeys(iterationInput, "profile.iteration", [
    "maximumAttemptsPerUnit",
    "maximumBatchSize",
    "technicalPassScore",
    "minimumMetricScore",
    "metricWeights",
    "blockingDetections",
  ]);
  const iteration = freeze({
    maximumAttemptsPerUnit: integerValue(
      iterationInput.maximumAttemptsPerUnit,
      "profile.iteration.maximumAttemptsPerUnit",
      1,
      12,
    ),
    maximumBatchSize: integerValue(
      iterationInput.maximumBatchSize,
      "profile.iteration.maximumBatchSize",
      1,
      32,
    ),
    technicalPassScore: numberValue(
      iterationInput.technicalPassScore,
      "profile.iteration.technicalPassScore",
      50,
      100,
    ),
    minimumMetricScore: numberValue(
      iterationInput.minimumMetricScore,
      "profile.iteration.minimumMetricScore",
      1,
      100,
    ),
    metricWeights: metricWeights(iterationInput.metricWeights),
    blockingDetections: blockingDetections(
      iterationInput.blockingDetections,
    ),
  });

  const animationInput = record(input.animation, "profile.animation");
  exactKeys(animationInput, "profile.animation", [
    "anchorFirst",
    "requireIdentityMaster",
    "requirePreviousFrameContext",
    "identityMetricMinimum",
    "pivotMetricMinimum",
    "groundContactMetricMinimum",
  ]);
  const animation = freeze({
    anchorFirst: literalTrue(
      animationInput.anchorFirst,
      "profile.animation.anchorFirst",
    ),
    requireIdentityMaster: literalTrue(
      animationInput.requireIdentityMaster,
      "profile.animation.requireIdentityMaster",
    ),
    requirePreviousFrameContext: literalTrue(
      animationInput.requirePreviousFrameContext,
      "profile.animation.requirePreviousFrameContext",
    ),
    identityMetricMinimum: numberValue(
      animationInput.identityMetricMinimum,
      "profile.animation.identityMetricMinimum",
      iteration.minimumMetricScore,
      100,
    ),
    pivotMetricMinimum: numberValue(
      animationInput.pivotMetricMinimum,
      "profile.animation.pivotMetricMinimum",
      iteration.minimumMetricScore,
      100,
    ),
    groundContactMetricMinimum: numberValue(
      animationInput.groundContactMetricMinimum,
      "profile.animation.groundContactMetricMinimum",
      iteration.minimumMetricScore,
      100,
    ),
  });

  const packagingInput = record(input.packaging, "profile.packaging");
  exactKeys(packagingInput, "profile.packaging", [
    "retainIndividualPngs",
    "outputs",
    "gridColumns",
    "atlas",
  ]);
  literalTrue(
    packagingInput.retainIndividualPngs,
    "profile.packaging.retainIndividualPngs",
  );
  const atlasInput = record(packagingInput.atlas, "profile.packaging.atlas");
  exactKeys(atlasInput, "profile.packaging.atlas", [
    "maximumWidth",
    "maximumHeight",
    "padding",
    "rotation",
    "trim",
  ]);
  const packaging = freeze({
    retainIndividualPngs: true as const,
    outputs: packagingOutputs(packagingInput.outputs),
    gridColumns: integerValue(
      packagingInput.gridColumns,
      "profile.packaging.gridColumns",
      1,
      64,
    ),
    atlas: freeze({
      maximumWidth: integerValue(
        atlasInput.maximumWidth,
        "profile.packaging.atlas.maximumWidth",
        64,
        8192,
      ),
      maximumHeight: integerValue(
        atlasInput.maximumHeight,
        "profile.packaging.atlas.maximumHeight",
        64,
        8192,
      ),
      padding: integerValue(
        atlasInput.padding,
        "profile.packaging.atlas.padding",
        0,
        64,
      ),
      rotation: booleanFalse(
        atlasInput.rotation,
        "profile.packaging.atlas.rotation",
      ),
      trim: booleanFalse(atlasInput.trim, "profile.packaging.atlas.trim"),
    }),
  });

  const authorityInput = record(input.authority, "profile.authority");
  exactKeys(authorityInput, "profile.authority", [
    "providerExecution",
    "automaticCreativeApproval",
    "imageMutation",
    "packagingExecution",
    "targetRepositoryMutation",
    "gitCommit",
    "gitPush",
    "publication",
  ]);
  const authority = freeze({
    providerExecution: booleanFalse(
      authorityInput.providerExecution,
      "profile.authority.providerExecution",
    ),
    automaticCreativeApproval: booleanFalse(
      authorityInput.automaticCreativeApproval,
      "profile.authority.automaticCreativeApproval",
    ),
    imageMutation: booleanFalse(
      authorityInput.imageMutation,
      "profile.authority.imageMutation",
    ),
    packagingExecution: booleanFalse(
      authorityInput.packagingExecution,
      "profile.authority.packagingExecution",
    ),
    targetRepositoryMutation: booleanFalse(
      authorityInput.targetRepositoryMutation,
      "profile.authority.targetRepositoryMutation",
    ),
    gitCommit: booleanFalse(
      authorityInput.gitCommit,
      "profile.authority.gitCommit",
    ),
    gitPush: booleanFalse(authorityInput.gitPush, "profile.authority.gitPush"),
    publication: booleanFalse(
      authorityInput.publication,
      "profile.authority.publication",
    ),
  });

  return freeze({
    schemaVersion: "1.0" as const,
    kind: ART_PRODUCTION_PROFILE_KIND,
    profileId: idValue(input.profileId, "profile.profileId"),
    revision,
    game,
    bindings,
    camera,
    iteration,
    animation,
    packaging,
    authority,
  });
}

export function validateArtProductionProfile(
  input: unknown,
  plan: CompiledLayeredProductionPlan,
): CompiledArtProductionProfile {
  const normalized = normalizedProfileInput(input, plan);
  return freeze({ ...normalized, profileSha256: sha256(normalized) });
}

export function verifyArtProductionProfile(
  profile: CompiledArtProductionProfile,
  plan: CompiledLayeredProductionPlan,
): true {
  const { profileSha256, ...input } = profile;
  const compiled = validateArtProductionProfile(input, plan);
  if (compiled.profileSha256 !== profileSha256) {
    fail(
      "ART_PRODUCTION_PROFILE_INVALID",
      "Profile SHA-256 does not match deterministic profile compilation.",
    );
  }
  return true;
}

export function metricIdSet(): ReadonlySet<ArtProductionMetricId> {
  return METRIC_SET;
}
