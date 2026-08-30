#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DELIVERY_PROTOCOL_VERSION = "2026-08-30.4";
export const DELIVERY_KIND = "evavo.animation-sequence-delivery.v1";
export const CREATIVE_APPROVAL_KIND = "evavo.animation-sequence-creative-approval.v1";
export const VIDEO_INTAKE_KIND = "evavo.video-studio.animation-intake.v1";
export const PROFILE_PROTOCOL_VERSION = "2026-08-30.3";
export const PROFILE_PLAN_KIND = "evavo.animation-production-profile.plan.v1";
export const PROFILE_REVIEW_KIND = "evavo.animation-production-profile.review.v1";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const ARTIFACT_ID = /^artifact_[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const LOCATION_KEY = /(?:^|_)(?:path|url|uri|token|secret|credential|password|api[_-]?key|authorization)(?:$|_)/i;
const LOCATION_VALUE = /^(?:[A-Za-z]:[\\/]|\/|file:|https?:|s3:|gs:|azure:)/i;
const EPSILON = 1e-9;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

export function animationSequenceSha256(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

function digest(value, code) {
  if (typeof value !== "string" || !DIGEST.test(value)) fail(code);
  return value;
}

function nonBlank(value, code) {
  if (typeof value !== "string" || !value.trim()) fail(code);
  return value.trim();
}

function isoTimestamp(value, code) {
  if (typeof value !== "string") fail(code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) fail(code);
  return value;
}

function positiveInteger(value, code, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail(code);
  return value;
}

function finite(value, code, minimum = -Number.MAX_VALUE, maximum = Number.MAX_VALUE) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail(code);
  return value;
}

function assertNoLocations(value, path = "input") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoLocations(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && LOCATION_VALUE.test(value)) fail("ANIMATION_DELIVERY_LOCATION_VALUE_FORBIDDEN", path);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (LOCATION_KEY.test(key)) fail("ANIMATION_DELIVERY_LOCATION_KEY_FORBIDDEN", `${path}.${key}`);
    assertNoLocations(entry, `${path}.${key}`);
  }
}

function planBody(profile) {
  const { contentDigest: _contentDigest, generatedAt: _generatedAt, ...body } = profile;
  return body;
}

function reviewBody(decision) {
  const { decisionDigest: _decisionDigest, decidedAt: _decidedAt, ...body } = decision;
  return body;
}

function approvalBody(approval) {
  const { approvalDigest: _approvalDigest, ...body } = approval;
  return body;
}

function deliveryBody(delivery) {
  const { contentDigest: _contentDigest, generatedAt: _generatedAt, ...body } = delivery;
  return body;
}

function videoIntakeBody(intake) {
  const { contentDigest: _contentDigest, generatedAt: _generatedAt, ...body } = intake;
  return body;
}

export function assertAnimationProductionProfileForDelivery(profile) {
  object(profile, "ANIMATION_DELIVERY_PROFILE_INVALID");
  if (profile.protocolVersion !== PROFILE_PROTOCOL_VERSION || profile.kind !== PROFILE_PLAN_KIND) fail("ANIMATION_DELIVERY_PROFILE_PROTOCOL_INVALID");
  digest(profile.contentDigest, "ANIMATION_DELIVERY_PROFILE_DIGEST_INVALID");
  isoTimestamp(profile.generatedAt, "ANIMATION_DELIVERY_PROFILE_TIME_INVALID");
  if (animationSequenceSha256(planBody(profile)) !== profile.contentDigest) fail("ANIMATION_DELIVERY_PROFILE_DIGEST_MISMATCH");
  object(profile.request, "ANIMATION_DELIVERY_PROFILE_REQUEST_INVALID");
  if (profile.request.state !== "approved") fail("ANIMATION_DELIVERY_PROFILE_NOT_APPROVED");
  if (profile.quality?.planningValid !== true || profile.quality?.promotable !== true || profile.quality?.blockerCount !== 0) fail("ANIMATION_DELIVERY_PROFILE_NOT_PROMOTABLE");
  object(profile.request.delivery, "ANIMATION_DELIVERY_PROFILE_DELIVERY_INVALID");
  object(profile.request.delivery.canvas, "ANIMATION_DELIVERY_PROFILE_CANVAS_INVALID");
  positiveInteger(profile.request.delivery.canvas.width, "ANIMATION_DELIVERY_PROFILE_WIDTH_INVALID", 8192);
  positiveInteger(profile.request.delivery.canvas.height, "ANIMATION_DELIVERY_PROFILE_HEIGHT_INVALID", 8192);
  positiveInteger(profile.request.sourceFramesPerSecond, "ANIMATION_DELIVERY_PROFILE_FPS_INVALID", 240);
  safeId(profile.request.delivery.animationName, "ANIMATION_DELIVERY_ANIMATION_NAME_INVALID");
  safeId(profile.request.camera?.profileId, "ANIMATION_DELIVERY_CAMERA_PROFILE_INVALID");
  safeId(profile.request.subject?.subjectId, "ANIMATION_DELIVERY_SUBJECT_ID_INVALID");
  if (!Array.isArray(profile.request.targets) || profile.request.targets.length < 1) fail("ANIMATION_DELIVERY_TARGETS_INVALID");
  if (!Array.isArray(profile.drawings) || profile.drawings.length < 1) fail("ANIMATION_DELIVERY_DRAWINGS_INVALID");
  const ids = new Set();
  let expectedOrdinal = 1;
  let expectedFrame = 1;
  for (const drawing of profile.drawings) {
    safeId(drawing.id, "ANIMATION_DELIVERY_DRAWING_ID_INVALID");
    if (ids.has(drawing.id)) fail("ANIMATION_DELIVERY_DRAWING_ID_DUPLICATE", drawing.id);
    ids.add(drawing.id);
    if (drawing.ordinal !== expectedOrdinal) fail("ANIMATION_DELIVERY_DRAWING_ORDINAL_INVALID", drawing.id);
    if (drawing.exposureStartFrame !== expectedFrame || drawing.exposureEndFrame < drawing.exposureStartFrame || drawing.exposureFrames !== drawing.exposureEndFrame - drawing.exposureStartFrame + 1) fail("ANIMATION_DELIVERY_EXPOSURE_INVALID", drawing.id);
    positiveInteger(drawing.exposureFrames, "ANIMATION_DELIVERY_EXPOSURE_COUNT_INVALID", 10000);
    expectedOrdinal += 1;
    expectedFrame = drawing.exposureEndFrame + 1;
  }
  if (expectedFrame - 1 !== profile.totalTimelineFrames) fail("ANIMATION_DELIVERY_TIMELINE_COVERAGE_INVALID");
  if (profile.authority?.providerExecution !== false || profile.authority?.automaticCreativeApproval !== false || profile.authority?.artifactPromotion !== false || profile.authority?.publication !== false) fail("ANIMATION_DELIVERY_PROFILE_AUTHORITY_INVALID");
  assertNoLocations(profile);
}

export function assertAcceptedAnimationReview(profile, decision) {
  assertAnimationProductionProfileForDelivery(profile);
  object(decision, "ANIMATION_DELIVERY_REVIEW_INVALID");
  if (decision.protocolVersion !== PROFILE_PROTOCOL_VERSION || decision.kind !== PROFILE_REVIEW_KIND) fail("ANIMATION_DELIVERY_REVIEW_PROTOCOL_INVALID");
  digest(decision.decisionDigest, "ANIMATION_DELIVERY_REVIEW_DIGEST_INVALID");
  isoTimestamp(decision.decidedAt, "ANIMATION_DELIVERY_REVIEW_TIME_INVALID");
  if (animationSequenceSha256(reviewBody(decision)) !== decision.decisionDigest) fail("ANIMATION_DELIVERY_REVIEW_DIGEST_MISMATCH");
  if (decision.profileDigest !== profile.contentDigest) fail("ANIMATION_DELIVERY_REVIEW_PROFILE_MISMATCH");
  if (decision.status !== "accepted") fail("ANIMATION_DELIVERY_REVIEW_NOT_ACCEPTED");
  for (const field of ["reviewRequiredDrawingIds", "rejectedDrawingIds", "retryQueue", "sequenceFailureCodes", "blockers"]) {
    if (!Array.isArray(decision[field]) || decision[field].length !== 0) fail("ANIMATION_DELIVERY_REVIEW_UNRESOLVED", field);
  }
  if (decision.sequenceReviewRequired !== false || decision.noProgressCycles !== 0) fail("ANIMATION_DELIVERY_REVIEW_UNRESOLVED");
  if (!Array.isArray(decision.acceptedDrawingIds) || decision.acceptedDrawingIds.length !== profile.drawings.length) fail("ANIMATION_DELIVERY_ACCEPTED_DRAWINGS_INCOMPLETE");
  const expected = new Set(profile.drawings.map((drawing) => drawing.id));
  for (const drawingId of decision.acceptedDrawingIds) {
    safeId(drawingId, "ANIMATION_DELIVERY_ACCEPTED_DRAWING_ID_INVALID");
    if (!expected.delete(drawingId)) fail("ANIMATION_DELIVERY_ACCEPTED_DRAWING_UNKNOWN", drawingId);
  }
  if (expected.size > 0) fail("ANIMATION_DELIVERY_ACCEPTED_DRAWING_MISSING", [...expected][0]);
  if (decision.authority?.automaticCreativeApproval !== false || decision.authority?.artifactPromotion !== false || decision.authority?.runtimeActivation !== false || decision.authority?.publication !== false) fail("ANIMATION_DELIVERY_REVIEW_AUTHORITY_INVALID");
  assertNoLocations(decision);
}

function validateArtifactBindings(profile, artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length !== profile.drawings.length) fail("ANIMATION_DELIVERY_ARTIFACT_COUNT_INVALID");
  const drawings = new Map(profile.drawings.map((drawing) => [drawing.id, drawing]));
  const seenDrawings = new Set();
  const seenArtifacts = new Set();
  const result = [];
  for (const binding of artifacts) {
    object(binding, "ANIMATION_DELIVERY_ARTIFACT_BINDING_INVALID");
    const drawingId = safeId(binding.drawingId, "ANIMATION_DELIVERY_ARTIFACT_DRAWING_ID_INVALID");
    if (!drawings.has(drawingId)) fail("ANIMATION_DELIVERY_ARTIFACT_DRAWING_UNKNOWN", drawingId);
    if (seenDrawings.has(drawingId)) fail("ANIMATION_DELIVERY_ARTIFACT_DRAWING_DUPLICATE", drawingId);
    seenDrawings.add(drawingId);
    if (typeof binding.artifactId !== "string" || !ARTIFACT_ID.test(binding.artifactId)) fail("ANIMATION_DELIVERY_ARTIFACT_ID_INVALID", drawingId);
    if (seenArtifacts.has(binding.artifactId)) fail("ANIMATION_DELIVERY_ARTIFACT_ID_DUPLICATE", binding.artifactId);
    seenArtifacts.add(binding.artifactId);
    digest(binding.contentDigest, "ANIMATION_DELIVERY_ARTIFACT_DIGEST_INVALID");
    if (binding.mediaType !== "image/png") fail("ANIMATION_DELIVERY_ARTIFACT_MEDIA_TYPE_INVALID", drawingId);
    positiveInteger(binding.byteLength, "ANIMATION_DELIVERY_ARTIFACT_BYTE_LENGTH_INVALID");
    if (binding.width !== profile.request.delivery.canvas.width || binding.height !== profile.request.delivery.canvas.height) fail("ANIMATION_DELIVERY_ARTIFACT_CANVAS_MISMATCH", drawingId);
    if (typeof binding.meaningfulAlpha !== "boolean") fail("ANIMATION_DELIVERY_ARTIFACT_ALPHA_EVIDENCE_INVALID", drawingId);
    if (profile.request.delivery.alphaRequired && binding.meaningfulAlpha !== true) fail("ANIMATION_DELIVERY_ARTIFACT_ALPHA_REQUIRED", drawingId);
    assertNoLocations(binding, `artifacts.${drawingId}`);
    result.push({
      drawingId,
      drawingOrdinal: drawings.get(drawingId).ordinal,
      artifactId: binding.artifactId,
      contentDigest: binding.contentDigest,
      mediaType: "image/png",
      byteLength: binding.byteLength,
      width: binding.width,
      height: binding.height,
      meaningfulAlpha: binding.meaningfulAlpha,
    });
  }
  return result.sort((left, right) => left.drawingOrdinal - right.drawingOrdinal);
}

export function assertAnimationSequenceCreativeApproval(profile, decision, artifacts, approval) {
  assertAcceptedAnimationReview(profile, decision);
  const bindings = validateArtifactBindings(profile, artifacts);
  object(approval, "ANIMATION_DELIVERY_CREATIVE_APPROVAL_INVALID");
  if (approval.protocolVersion !== DELIVERY_PROTOCOL_VERSION || approval.kind !== CREATIVE_APPROVAL_KIND) fail("ANIMATION_DELIVERY_CREATIVE_APPROVAL_PROTOCOL_INVALID");
  safeId(approval.id, "ANIMATION_DELIVERY_CREATIVE_APPROVAL_ID_INVALID");
  digest(approval.approvalDigest, "ANIMATION_DELIVERY_CREATIVE_APPROVAL_DIGEST_INVALID");
  if (animationSequenceSha256(approvalBody(approval)) !== approval.approvalDigest) fail("ANIMATION_DELIVERY_CREATIVE_APPROVAL_DIGEST_MISMATCH");
  if (approval.profileDigest !== profile.contentDigest || approval.reviewDecisionDigest !== decision.decisionDigest) fail("ANIMATION_DELIVERY_CREATIVE_APPROVAL_LINEAGE_MISMATCH");
  if (approval.scope !== "animation-sequence-delivery") fail("ANIMATION_DELIVERY_CREATIVE_APPROVAL_SCOPE_INVALID");
  safeId(approval.approverId, "ANIMATION_DELIVERY_CREATIVE_APPROVER_ID_INVALID");
  if (!["owner", "art-director", "animation-director"].includes(approval.approverRole)) fail("ANIMATION_DELIVERY_CREATIVE_APPROVER_ROLE_INVALID");
  isoTimestamp(approval.approvedAt, "ANIMATION_DELIVERY_CREATIVE_APPROVAL_TIME_INVALID");
  nonBlank(approval.rationale, "ANIMATION_DELIVERY_CREATIVE_APPROVAL_RATIONALE_INVALID");
  if (!Array.isArray(approval.artifacts) || approval.artifacts.length !== bindings.length) fail("ANIMATION_DELIVERY_CREATIVE_APPROVAL_ARTIFACTS_INVALID");
  const expected = bindings.map(({ drawingId, artifactId, contentDigest }) => ({ drawingId, artifactId, contentDigest }));
  const actual = [...approval.artifacts].sort((left, right) => left.drawingId.localeCompare(right.drawingId));
  const sortedExpected = [...expected].sort((left, right) => left.drawingId.localeCompare(right.drawingId));
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) fail("ANIMATION_DELIVERY_CREATIVE_APPROVAL_ARTIFACT_MISMATCH");
  if (approval.authority?.providerExecution !== false || approval.authority?.artifactPromotion !== false || approval.authority?.runtimeActivation !== false || approval.authority?.repositoryMutation !== false || approval.authority?.publication !== false) fail("ANIMATION_DELIVERY_CREATIVE_APPROVAL_AUTHORITY_INVALID");
  assertNoLocations(approval);
  return bindings;
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function normaliseTiming(profile) {
  const exposures = profile.drawings.map((drawing) => positiveInteger(drawing.exposureFrames, "ANIMATION_DELIVERY_EXPOSURE_INVALID"));
  const divisor = exposures.reduce(greatestCommonDivisor);
  const frameDurations = exposures.map((value) => value / divisor);
  const framesPerSecond = profile.request.sourceFramesPerSecond / divisor;
  const totalDurationSeconds = exposures.reduce((sum, value) => sum + value, 0) / profile.request.sourceFramesPerSecond;
  const runtimeDuration = frameDurations.reduce((sum, value) => sum + value, 0) / framesPerSecond;
  if (Math.abs(totalDurationSeconds - runtimeDuration) > EPSILON) fail("ANIMATION_DELIVERY_TIMING_NORMALISATION_FAILED");
  return {
    sourceFramesPerSecond: profile.request.sourceFramesPerSecond,
    previewFramesPerSecond: profile.playbackFramesPerSecond,
    durationUnitDivisor: divisor,
    runtimeFramesPerSecond: framesPerSecond,
    frameDurations,
    exposureFrames: exposures,
    totalTimelineFrames: exposures.reduce((sum, value) => sum + value, 0),
    totalDurationSeconds,
  };
}

function runtimeKind(action) {
  if (action === "idle") return "idle";
  if (["walk", "run", "sprint"].includes(action)) return "locomotion";
  if (["jump", "land", "climb", "swim", "fly", "get-up"].includes(action)) return "traversal";
  if (["melee-attack", "ranged-attack", "cast", "interact"].includes(action)) return "action";
  if (["hit-reaction", "knockdown"].includes(action)) return "reaction";
  if (action === "death") return "death";
  if (["dialogue", "emote", "effect"].includes(action)) return action;
  return "custom";
}

function compileRuntimeClip(profile, timing) {
  const action = profile.request.action;
  return {
    id: `clip.${profile.request.delivery.animationName}`,
    animationName: profile.request.delivery.animationName,
    kind: runtimeKind(action),
    direction: ["camera", "none"].includes(profile.request.direction) ? "none" : profile.request.direction,
    cameraProfileId: profile.request.camera.profileId,
    sourcePlanDigest: profile.contentDigest,
    frameCount: profile.drawings.length,
    framesPerSecond: timing.runtimeFramesPerSecond,
    frameDurations: timing.frameDurations,
    loopMode: profile.request.loop ? "linear" : "none",
    ...(["walk", "run", "sprint"].includes(action) ? { phaseFamily: `locomotion.${profile.request.direction}` } : {}),
    mirrorPolicy: profile.request.mirrorPolicy,
    asymmetricVisualAnchors: [...profile.request.subject.asymmetricVisualAnchors],
    markers: (profile.events ?? []).map((event) => ({
      id: event.id,
      frame: event.drawingOrdinal,
      kind: event.kind,
      ...(event.payload ? { payload: event.payload } : {}),
    })),
  };
}

function compileGodotTarget(profile, bindings, timing) {
  if (!profile.request.targets.includes("godot-sprite")) return null;
  return {
    target: "Godot 4.6.2",
    resource: "SpriteFrames",
    animationName: profile.request.delivery.animationName,
    framesPerSecond: timing.runtimeFramesPerSecond,
    loop: profile.request.loop,
    pivot: profile.request.delivery.pivot,
    groundLineNormalized: profile.request.camera.groundLineNormalized,
    textureFiltering: profile.request.delivery.textureFiltering,
    frames: profile.drawings.map((drawing, index) => ({
      drawingId: drawing.id,
      sourceArtifactId: bindings[index].artifactId,
      sourceContentDigest: bindings[index].contentDigest,
      relativeDuration: timing.frameDurations[index],
      exposureFrames: timing.exposureFrames[index],
      eventIds: (profile.events ?? []).filter((event) => event.drawingId === drawing.id).map((event) => event.id),
    })),
    requirements: [
      "Resolve every artifact through governed storage and rehash bytes before import.",
      "Keep SpriteFrames.speed_scale at one unless gameplay deliberately changes authored timing.",
      "Use nearest filtering only when the profile explicitly requests it.",
      "Dispatch event markers once when their drawing becomes active.",
    ],
  };
}

function compileCelTarget(profile, bindings, timing) {
  if (!profile.request.targets.includes("cel-sequence")) return null;
  return {
    target: "Cel Animation Studio",
    timingMode: "x-sheet-exposure",
    sourceFramesPerSecond: timing.sourceFramesPerSecond,
    rows: profile.drawings.map((drawing, index) => ({
      drawingId: drawing.id,
      sourceArtifactId: bindings[index].artifactId,
      sourceContentDigest: bindings[index].contentDigest,
      generationClass: drawing.generationClass,
      role: drawing.role,
      startFrame: drawing.exposureStartFrame,
      endFrame: drawing.exposureEndFrame,
      exposureFrames: drawing.exposureFrames,
    })),
    requirements: [
      "A hold is repeated exposure of one drawing, never a regenerated duplicate.",
      "Retain key-pose, breakdown and in-between roles through compositing.",
      "Do not smooth through authored contacts, impacts, holds or substitutions.",
    ],
  };
}

function compileVideoTarget(profile, bindings, timing) {
  if (!profile.request.targets.includes("video-sequence")) return null;
  const entries = profile.drawings.map((drawing, index) => ({
    ordinal: drawing.ordinal,
    drawingId: drawing.id,
    sourceArtifactId: bindings[index].artifactId,
    sourceContentDigest: bindings[index].contentDigest,
    startTimeSeconds: drawing.exposureStartFrame === 1 ? 0 : (drawing.exposureStartFrame - 1) / timing.sourceFramesPerSecond,
    durationSeconds: drawing.exposureFrames / timing.sourceFramesPerSecond,
    exposureFrames: drawing.exposureFrames,
    role: drawing.role,
    eventIds: (profile.events ?? []).filter((event) => event.drawingId === drawing.id).map((event) => event.id),
  }));
  return {
    target: "Video Studio",
    timingMode: "resolved-image-sequence",
    sourceFramesPerSecond: timing.sourceFramesPerSecond,
    totalDurationSeconds: timing.totalDurationSeconds,
    entries,
    concatPlan: {
      resolverRequired: true,
      orderedArtifactIds: entries.map((entry) => entry.sourceArtifactId),
      durationSeconds: entries.map((entry) => entry.durationSeconds),
      terminalRepeatArtifactId: entries.at(-1).sourceArtifactId,
      reason: "FFmpeg concat requires the terminal image to be repeated so its authored duration is retained.",
    },
    interpolationPolicy: {
      default: "disabled",
      forbiddenAcross: ["hold", "contact", "impact", "event-frame", "drawing-substitution", "pixel-stepped-motion"],
      explicitDirectorOverrideRequired: true,
    },
  };
}

export function compileAnimationSequenceDelivery(input, now = new Date()) {
  object(input, "ANIMATION_DELIVERY_INPUT_INVALID");
  const profile = input.profile;
  const decision = input.decision;
  const bindings = assertAnimationSequenceCreativeApproval(profile, decision, input.artifacts, input.creativeApproval);
  const timing = normaliseTiming(profile);
  const body = {
    protocolVersion: DELIVERY_PROTOCOL_VERSION,
    kind: DELIVERY_KIND,
    id: `${profile.profileId}:delivery`,
    profileDigest: profile.contentDigest,
    reviewDecisionDigest: decision.decisionDigest,
    creativeApprovalDigest: input.creativeApproval.approvalDigest,
    subjectId: profile.request.subject.subjectId,
    cameraProfileId: profile.request.camera.profileId,
    action: profile.request.action,
    direction: profile.request.direction,
    animationName: profile.request.delivery.animationName,
    loop: profile.request.loop,
    canvas: { ...profile.request.delivery.canvas },
    alphaRequired: profile.request.delivery.alphaRequired,
    pivot: { ...profile.request.delivery.pivot },
    textureFiltering: profile.request.delivery.textureFiltering,
    artifacts: bindings,
    timing,
    runtimeClip: compileRuntimeClip(profile, timing),
    targets: {
      godot: compileGodotTarget(profile, bindings, timing),
      cel: compileCelTarget(profile, bindings, timing),
      video: compileVideoTarget(profile, bindings, timing),
    },
    authority: {
      providerExecution: false,
      creativeApproval: false,
      artifactPromotion: false,
      runtimeActivation: false,
      targetRepositoryMutation: false,
      publication: false,
    },
  };
  const delivery = { ...body, contentDigest: animationSequenceSha256(body), generatedAt: now.toISOString() };
  assertNoLocations(delivery);
  return delivery;
}

export function assertAnimationSequenceDeliveryIntegrity(delivery) {
  object(delivery, "ANIMATION_DELIVERY_INVALID");
  if (delivery.protocolVersion !== DELIVERY_PROTOCOL_VERSION || delivery.kind !== DELIVERY_KIND) fail("ANIMATION_DELIVERY_PROTOCOL_INVALID");
  digest(delivery.contentDigest, "ANIMATION_DELIVERY_DIGEST_INVALID");
  isoTimestamp(delivery.generatedAt, "ANIMATION_DELIVERY_TIME_INVALID");
  if (animationSequenceSha256(deliveryBody(delivery)) !== delivery.contentDigest) fail("ANIMATION_DELIVERY_DIGEST_MISMATCH");
  if (!Array.isArray(delivery.artifacts) || delivery.artifacts.length < 1) fail("ANIMATION_DELIVERY_ARTIFACTS_INVALID");
  if (delivery.runtimeClip?.sourcePlanDigest !== delivery.profileDigest) fail("ANIMATION_DELIVERY_RUNTIME_LINEAGE_INVALID");
  const runtimeDuration = delivery.runtimeClip.frameDurations.reduce((sum, value) => sum + value, 0) / delivery.runtimeClip.framesPerSecond;
  if (Math.abs(runtimeDuration - delivery.timing.totalDurationSeconds) > EPSILON) fail("ANIMATION_DELIVERY_RUNTIME_DURATION_MISMATCH");
  if (delivery.targets.video && delivery.targets.video.concatPlan.terminalRepeatArtifactId !== delivery.artifacts.at(-1).artifactId) fail("ANIMATION_DELIVERY_VIDEO_TERMINAL_INVALID");
  if (delivery.authority?.creativeApproval !== false || delivery.authority?.runtimeActivation !== false || delivery.authority?.publication !== false) fail("ANIMATION_DELIVERY_AUTHORITY_INVALID");
  assertNoLocations(delivery);
}

export function compileVideoStudioAnimationIntake(delivery, now = new Date()) {
  assertAnimationSequenceDeliveryIntegrity(delivery);
  if (!delivery.targets.video) fail("ANIMATION_DELIVERY_VIDEO_TARGET_NOT_REQUESTED");
  const video = delivery.targets.video;
  const body = {
    protocolVersion: DELIVERY_PROTOCOL_VERSION,
    kind: VIDEO_INTAKE_KIND,
    id: `${delivery.id}:video-intake`,
    sourceDeliveryDigest: delivery.contentDigest,
    profileDigest: delivery.profileDigest,
    reviewDecisionDigest: delivery.reviewDecisionDigest,
    creativeApprovalDigest: delivery.creativeApprovalDigest,
    subjectId: delivery.subjectId,
    animationName: delivery.animationName,
    canvas: delivery.canvas,
    sourceFramesPerSecond: video.sourceFramesPerSecond,
    totalDurationSeconds: video.totalDurationSeconds,
    entries: video.entries,
    concatPlan: video.concatPlan,
    interpolationPolicy: video.interpolationPolicy,
    artifactResolution: {
      required: true,
      verifyContentDigestBeforeDecode: true,
      permittedMediaTypes: ["image/png"],
      retainSourceArtifactsImmutable: true,
    },
    authority: {
      mediaResolution: false,
      transcoding: false,
      interpolation: false,
      creativeApproval: false,
      publication: false,
    },
  };
  const intake = { ...body, contentDigest: animationSequenceSha256(body), generatedAt: now.toISOString() };
  assertNoLocations(intake);
  return intake;
}

export function assertVideoStudioAnimationIntakeIntegrity(intake) {
  object(intake, "ANIMATION_DELIVERY_VIDEO_INTAKE_INVALID");
  if (intake.protocolVersion !== DELIVERY_PROTOCOL_VERSION || intake.kind !== VIDEO_INTAKE_KIND) fail("ANIMATION_DELIVERY_VIDEO_INTAKE_PROTOCOL_INVALID");
  digest(intake.contentDigest, "ANIMATION_DELIVERY_VIDEO_INTAKE_DIGEST_INVALID");
  isoTimestamp(intake.generatedAt, "ANIMATION_DELIVERY_VIDEO_INTAKE_TIME_INVALID");
  if (animationSequenceSha256(videoIntakeBody(intake)) !== intake.contentDigest) fail("ANIMATION_DELIVERY_VIDEO_INTAKE_DIGEST_MISMATCH");
  if (intake.artifactResolution?.required !== true || intake.artifactResolution?.verifyContentDigestBeforeDecode !== true) fail("ANIMATION_DELIVERY_VIDEO_RESOLUTION_POLICY_INVALID");
  if (intake.authority?.transcoding !== false || intake.authority?.interpolation !== false || intake.authority?.publication !== false) fail("ANIMATION_DELIVERY_VIDEO_INTAKE_AUTHORITY_INVALID");
  assertNoLocations(intake);
}

function safeWorkspacePath(input) {
  const root = process.cwd();
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return absolute;
  fail("ANIMATION_DELIVERY_PATH_OUTSIDE_WORKSPACE", input);
}

async function emit(value, outputPath) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) process.stdout.write(body);
  else await writeFile(safeWorkspacePath(outputPath), body, { encoding: "utf8", flag: "wx" });
}

async function cli() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!command || !inputPath || !["compile", "verify", "video", "verify-video"].includes(command)) fail("ANIMATION_DELIVERY_USAGE", "node tools/animation_sequence_delivery_v1.mjs <compile|verify|video|verify-video> <input.json> [output.json]");
  const input = JSON.parse(await readFile(safeWorkspacePath(inputPath), "utf8"));
  if (command === "compile") return emit(compileAnimationSequenceDelivery(input), outputPath);
  if (command === "verify") {
    assertAnimationSequenceDeliveryIntegrity(input);
    return emit({ status: "verified", contentDigest: input.contentDigest, totalDurationSeconds: input.timing.totalDurationSeconds }, outputPath);
  }
  if (command === "video") return emit(compileVideoStudioAnimationIntake(input), outputPath);
  assertVideoStudioAnimationIntakeIntegrity(input);
  return emit({ status: "verified", contentDigest: input.contentDigest, sourceDeliveryDigest: input.sourceDeliveryDigest }, outputPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
