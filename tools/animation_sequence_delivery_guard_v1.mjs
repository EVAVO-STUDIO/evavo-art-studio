const BLOCKED_KEY_TOKENS = new Set([
  "path", "url", "uri", "token", "secret", "credential", "credentials",
  "password", "apikey", "authorization", "bearer", "filesystem", "filename",
  "location",
]);
const LOCATION_VALUE = /^(?:[A-Za-z]:[\\/]|\\\\|\/\/|\/|\.\.?[\\/]|~[\\/]|(?:file|https?|s3|gs|azure|ftp|ssh):)/i;
const EPSILON = 1e-9;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function keyTokens(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toLowerCase()
    .split("_")
    .filter(Boolean);
}

export function assertPathFreeAnimationValue(value, path = "input", depth = 0) {
  if (depth > 64) fail("ANIMATION_DELIVERY_MAX_DEPTH_EXCEEDED", path);
  if (Array.isArray(value)) {
    if (value.length > 100_000) fail("ANIMATION_DELIVERY_ARRAY_TOO_LARGE", path);
    value.forEach((entry, index) => assertPathFreeAnimationValue(entry, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && LOCATION_VALUE.test(value.trim())) {
      fail("ANIMATION_DELIVERY_LOCATION_VALUE_FORBIDDEN", path);
    }
    return;
  }
  const entries = Object.entries(value);
  if (entries.length > 10_000) fail("ANIMATION_DELIVERY_OBJECT_TOO_LARGE", path);
  for (const [key, entry] of entries) {
    const tokens = keyTokens(key);
    const joined = tokens.join("");
    if (tokens.some((token) => BLOCKED_KEY_TOKENS.has(token)) || BLOCKED_KEY_TOKENS.has(joined)) {
      fail("ANIMATION_DELIVERY_LOCATION_KEY_FORBIDDEN", `${path}.${key}`);
    }
    assertPathFreeAnimationValue(entry, `${path}.${key}`, depth + 1);
  }
}

function requireObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function requirePositiveFinite(value, code, maximum = Number.MAX_VALUE) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maximum) fail(code);
  return value;
}

function requirePositiveInteger(value, code, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail(code);
  return value;
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a || 1;
}

function assertBindingLineage(entries, artifacts, code) {
  if (!Array.isArray(entries) || entries.length !== artifacts.length) fail(`${code}_COUNT_INVALID`);
  for (const [index, entry] of entries.entries()) {
    const artifact = artifacts[index];
    if (
      entry.drawingId !== artifact.drawingId ||
      entry.sourceArtifactId !== artifact.artifactId ||
      entry.sourceContentDigest !== artifact.contentDigest
    ) {
      fail(`${code}_LINEAGE_MISMATCH`, String(index + 1));
    }
  }
}

export function assertAnimationSequenceDeliverySemantics(delivery) {
  assertPathFreeAnimationValue(delivery);
  requireObject(delivery, "ANIMATION_DELIVERY_INVALID");
  requireObject(delivery.timing, "ANIMATION_DELIVERY_TIMING_INVALID");
  requireObject(delivery.runtimeClip, "ANIMATION_DELIVERY_RUNTIME_CLIP_INVALID");
  requireObject(delivery.targets, "ANIMATION_DELIVERY_TARGETS_INVALID");
  if (!Array.isArray(delivery.artifacts) || delivery.artifacts.length < 1) fail("ANIMATION_DELIVERY_ARTIFACTS_INVALID");

  const artifactIds = delivery.artifacts.map((entry) => entry.artifactId);
  const drawingIds = delivery.artifacts.map((entry) => entry.drawingId);
  if (new Set(artifactIds).size !== artifactIds.length) fail("ANIMATION_DELIVERY_ARTIFACT_ID_DUPLICATE");
  if (new Set(drawingIds).size !== drawingIds.length) fail("ANIMATION_DELIVERY_DRAWING_ID_DUPLICATE");

  const exposures = delivery.timing.exposureFrames;
  const durations = delivery.runtimeClip.frameDurations;
  if (!Array.isArray(exposures) || !Array.isArray(durations) || exposures.length !== delivery.artifacts.length || durations.length !== delivery.artifacts.length) {
    fail("ANIMATION_DELIVERY_RUNTIME_FRAME_COUNT_MISMATCH");
  }
  exposures.forEach((value) => requirePositiveInteger(value, "ANIMATION_DELIVERY_EXPOSURE_INVALID", 10_000));
  durations.forEach((value) => requirePositiveInteger(value, "ANIMATION_DELIVERY_RUNTIME_DURATION_INVALID", 10_000));
  const sourceFramesPerSecond = requirePositiveFinite(delivery.timing.sourceFramesPerSecond, "ANIMATION_DELIVERY_SOURCE_FPS_INVALID", 240);
  const divisor = exposures.reduce(greatestCommonDivisor);
  if (delivery.timing.durationUnitDivisor !== divisor) fail("ANIMATION_DELIVERY_DURATION_DIVISOR_INVALID");
  const expectedDurations = exposures.map((value) => value / divisor);
  if (JSON.stringify(expectedDurations) !== JSON.stringify(durations)) fail("ANIMATION_DELIVERY_RUNTIME_DURATION_WEIGHTS_INVALID");
  const expectedRuntimeFps = sourceFramesPerSecond / divisor;
  if (Math.abs(delivery.runtimeClip.framesPerSecond - expectedRuntimeFps) > EPSILON || Math.abs(delivery.timing.runtimeFramesPerSecond - expectedRuntimeFps) > EPSILON) {
    fail("ANIMATION_DELIVERY_RUNTIME_FPS_INVALID");
  }
  const expectedTotalFrames = exposures.reduce((sum, value) => sum + value, 0);
  const expectedSeconds = expectedTotalFrames / sourceFramesPerSecond;
  if (delivery.timing.totalTimelineFrames !== expectedTotalFrames) fail("ANIMATION_DELIVERY_TOTAL_FRAMES_INVALID");
  if (Math.abs(delivery.timing.totalDurationSeconds - expectedSeconds) > EPSILON) fail("ANIMATION_DELIVERY_TOTAL_DURATION_INVALID");
  if (delivery.runtimeClip.frameCount !== delivery.artifacts.length) fail("ANIMATION_DELIVERY_RUNTIME_CLIP_COUNT_INVALID");
  const runtimeSeconds = durations.reduce((sum, value) => sum + value, 0) / delivery.runtimeClip.framesPerSecond;
  if (Math.abs(runtimeSeconds - expectedSeconds) > EPSILON) fail("ANIMATION_DELIVERY_RUNTIME_DURATION_MISMATCH");

  for (const marker of delivery.runtimeClip.markers ?? []) {
    requirePositiveInteger(marker.frame, "ANIMATION_DELIVERY_MARKER_FRAME_INVALID", delivery.runtimeClip.frameCount);
  }

  if (delivery.targets.godot) {
    assertBindingLineage(delivery.targets.godot.frames, delivery.artifacts, "ANIMATION_DELIVERY_GODOT");
    if (Math.abs(delivery.targets.godot.framesPerSecond - expectedRuntimeFps) > EPSILON) fail("ANIMATION_DELIVERY_GODOT_FPS_INVALID");
    if (JSON.stringify(delivery.targets.godot.frames.map((entry) => entry.relativeDuration)) !== JSON.stringify(expectedDurations)) {
      fail("ANIMATION_DELIVERY_GODOT_DURATIONS_INVALID");
    }
  }

  if (delivery.targets.cel) {
    assertBindingLineage(delivery.targets.cel.rows, delivery.artifacts, "ANIMATION_DELIVERY_CEL");
    let nextFrame = 1;
    for (const row of delivery.targets.cel.rows) {
      if (row.startFrame !== nextFrame || row.endFrame - row.startFrame + 1 !== row.exposureFrames) fail("ANIMATION_DELIVERY_CEL_EXPOSURE_INVALID", row.drawingId);
      nextFrame = row.endFrame + 1;
    }
    if (nextFrame - 1 !== expectedTotalFrames) fail("ANIMATION_DELIVERY_CEL_COVERAGE_INVALID");
  }

  if (delivery.targets.video) {
    assertBindingLineage(delivery.targets.video.entries, delivery.artifacts, "ANIMATION_DELIVERY_VIDEO");
    let cursor = 0;
    for (const entry of delivery.targets.video.entries) {
      if (Math.abs(entry.startTimeSeconds - cursor) > EPSILON) fail("ANIMATION_DELIVERY_VIDEO_START_TIME_INVALID", entry.drawingId);
      const expectedEntryDuration = entry.exposureFrames / sourceFramesPerSecond;
      if (Math.abs(entry.durationSeconds - expectedEntryDuration) > EPSILON) fail("ANIMATION_DELIVERY_VIDEO_ENTRY_DURATION_INVALID", entry.drawingId);
      cursor += entry.durationSeconds;
    }
    if (Math.abs(cursor - expectedSeconds) > EPSILON) fail("ANIMATION_DELIVERY_VIDEO_DURATION_INVALID");
    if (delivery.targets.video.concatPlan?.terminalRepeatArtifactId !== delivery.artifacts.at(-1).artifactId) fail("ANIMATION_DELIVERY_VIDEO_TERMINAL_INVALID");
  }
}

export function assertVideoStudioAnimationIntakeSemantics(intake) {
  assertPathFreeAnimationValue(intake);
  requireObject(intake, "ANIMATION_DELIVERY_VIDEO_INTAKE_INVALID");
  requireObject(intake.artifactResolution, "ANIMATION_DELIVERY_VIDEO_RESOLUTION_INVALID");
  if (intake.artifactResolution.required !== true || intake.artifactResolution.verifyContentDigestBeforeDecode !== true || intake.artifactResolution.retainSourceArtifactsImmutable !== true) {
    fail("ANIMATION_DELIVERY_VIDEO_RESOLUTION_POLICY_INVALID");
  }
  if (!Array.isArray(intake.entries) || intake.entries.length < 1) fail("ANIMATION_DELIVERY_VIDEO_ENTRIES_INVALID");
  if (intake.concatPlan?.terminalRepeatArtifactId !== intake.entries.at(-1).sourceArtifactId) fail("ANIMATION_DELIVERY_VIDEO_INTAKE_TERMINAL_INVALID");
  let cursor = 0;
  for (const entry of intake.entries) {
    if (Math.abs(entry.startTimeSeconds - cursor) > EPSILON) fail("ANIMATION_DELIVERY_VIDEO_INTAKE_START_TIME_INVALID", entry.drawingId);
    cursor += requirePositiveFinite(entry.durationSeconds, "ANIMATION_DELIVERY_VIDEO_INTAKE_DURATION_INVALID", 120);
  }
  if (Math.abs(cursor - intake.totalDurationSeconds) > EPSILON) fail("ANIMATION_DELIVERY_VIDEO_INTAKE_TOTAL_DURATION_INVALID");
  if (intake.interpolationPolicy?.default !== "disabled" || intake.interpolationPolicy?.explicitDirectorOverrideRequired !== true) fail("ANIMATION_DELIVERY_VIDEO_INTERPOLATION_POLICY_INVALID");
}
