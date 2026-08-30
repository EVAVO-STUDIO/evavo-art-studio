#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import * as base from "./animation_production_profile_v1.mjs";

export const PROTOCOL_VERSION = base.PROTOCOL_VERSION;
export const REQUEST_KIND = base.REQUEST_KIND;
export const PLAN_KIND = base.PLAN_KIND;
export const REVIEW_KIND = base.REVIEW_KIND;
export const ACTIONS = base.ACTIONS;
export const PERSPECTIVES = base.PERSPECTIVES;
export const DIRECTIONS = base.DIRECTIONS;
export const TARGETS = base.TARGETS;
export const sha256 = base.sha256;
export const compileAnimationProductionProfile = base.compileAnimationProductionProfile;
export const assertAnimationProductionProfileIntegrity = base.assertAnimationProductionProfileIntegrity;
export const nextAnimationProductionBatch = base.nextAnimationProductionBatch;

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const EPSILON = 1e-9;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function isoTimestamp(value, code) {
  if (typeof value !== "string") fail(code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) fail(code);
  return parsed;
}

function decisionBody(decision) {
  const { decisionDigest: _decisionDigest, decidedAt: _decidedAt, ...body } = decision;
  return body;
}

function assertDecisionSelfIntegrity(decision) {
  object(decision, "ANIMATION_PROFILE_CANONICAL_DECISION_INVALID");
  if (decision.protocolVersion !== PROTOCOL_VERSION || decision.kind !== REVIEW_KIND) fail("ANIMATION_PROFILE_CANONICAL_DECISION_PROTOCOL_INVALID");
  if (typeof decision.decisionDigest !== "string" || !DIGEST.test(decision.decisionDigest)) fail("ANIMATION_PROFILE_CANONICAL_DECISION_DIGEST_INVALID");
  isoTimestamp(decision.decidedAt, "ANIMATION_PROFILE_CANONICAL_DECISION_TIME_INVALID");
  if (sha256(decisionBody(decision)) !== decision.decisionDigest) fail("ANIMATION_PROFILE_CANONICAL_DECISION_DIGEST_MISMATCH");
}

function sequenceHasFailures(profile, evidence) {
  if (!evidence) return false;
  if (evidence.normalSpeedReviewed !== true || evidence.frameByFrameReviewed !== true) return true;
  const pairs = [
    ["timingReadabilityScore", "timingReadability"],
    ["motionReadabilityScore", "motionReadability"],
    ["styleContinuityScore", "styleContinuity"],
    ["cameraContinuityScore", "cameraContinuity"],
  ];
  for (const [field, gate] of pairs) {
    const value = evidence[field];
    const minimum = profile.qualityGates.sequence[gate];
    if (typeof value !== "number" || !Number.isFinite(value) || value + EPSILON < minimum) return true;
  }
  if (profile.request.loop) {
    const value = evidence.loopSeamScore;
    const minimum = profile.qualityGates.sequence.loopSeam;
    if (typeof value !== "number" || !Number.isFinite(value) || value + EPSILON < minimum) return true;
  }
  return (evidence.findings ?? []).some((finding) => finding.severity === "major" || finding.severity === "blocking");
}

function validateCanonicalReviewInput(input) {
  object(input, "ANIMATION_PROFILE_CANONICAL_REVIEW_INPUT_INVALID");
  assertAnimationProductionProfileIntegrity(input.profile);
  if (!Number.isSafeInteger(input.cycle) || input.cycle < 1 || input.cycle > input.profile.iterationPolicy.maximumReviewCycles) fail("ANIMATION_PROFILE_CANONICAL_REVIEW_CYCLE_INVALID");
  if (input.previousDecision) {
    assertDecisionSelfIntegrity(input.previousDecision);
    if (input.previousDecision.profileDigest !== input.profile.contentDigest) fail("ANIMATION_PROFILE_CANONICAL_PREVIOUS_PROFILE_MISMATCH");
    if (input.previousDecision.cycle >= input.cycle) fail("ANIMATION_PROFILE_CANONICAL_PREVIOUS_CYCLE_INVALID");
  }
  if (sequenceHasFailures(input.profile, input.sequenceEvidence)) {
    if (!Array.isArray(input.sequenceEvidence.affectedDrawingIds) || input.sequenceEvidence.affectedDrawingIds.length < 1) {
      fail("ANIMATION_PROFILE_SEQUENCE_FAILURES_REQUIRE_AFFECTED_DRAWINGS");
    }
  }
}

function canonicalDecision(raw) {
  const {
    decisionDigest: _decisionDigest,
    decidedAt,
    rejectionFingerprint: _legacyFingerprint,
    failureFingerprint: _failureFingerprint,
    ...rest
  } = raw;
  const failureFingerprint = sha256({
    profileDigest: rest.profileDigest,
    rejectedDrawingIds: rest.rejectedDrawingIds,
    sequenceFailureCodes: rest.sequenceFailureCodes,
  });
  const body = { ...rest, failureFingerprint };
  return { ...body, decisionDigest: sha256(body), decidedAt };
}

export function reviewAnimationProductionProfile(input, now = new Date()) {
  validateCanonicalReviewInput(input);
  const raw = base.reviewAnimationProductionProfile(input, now);
  return canonicalDecision(raw);
}

export function assertAnimationProductionReviewIntegrity(input, decision) {
  assertDecisionSelfIntegrity(decision);
  const expected = reviewAnimationProductionProfile(input, isoTimestamp(decision.decidedAt, "ANIMATION_PROFILE_CANONICAL_DECISION_TIME_INVALID"));
  if (JSON.stringify(expected) !== JSON.stringify(decision)) fail("ANIMATION_PROFILE_CANONICAL_DECISION_INTEGRITY_MISMATCH");
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

export function compileAcceptedRuntimeClip(profile, decision) {
  assertAnimationProductionProfileIntegrity(profile);
  assertDecisionSelfIntegrity(decision);
  if (decision.profileDigest !== profile.contentDigest || decision.status !== "accepted") fail("ANIMATION_PROFILE_RUNTIME_REVIEW_NOT_ACCEPTED");
  if (!profile.quality.promotable || decision.acceptedDrawingIds.length !== profile.drawings.length) fail("ANIMATION_PROFILE_RUNTIME_NOT_PROMOTABLE");
  const expected = new Set(profile.drawings.map((drawing) => drawing.id));
  for (const drawingId of decision.acceptedDrawingIds) {
    if (!expected.delete(drawingId)) fail("ANIMATION_PROFILE_RUNTIME_DRAWING_UNKNOWN", drawingId);
  }
  if (expected.size > 0) fail("ANIMATION_PROFILE_RUNTIME_DRAWING_MISSING", [...expected][0]);
  const exposures = profile.drawings.map((drawing) => drawing.exposureFrames);
  const divisor = exposures.reduce(greatestCommonDivisor);
  const frameDurations = exposures.map((value) => value / divisor);
  const framesPerSecond = profile.request.sourceFramesPerSecond / divisor;
  const sourceDuration = exposures.reduce((sum, value) => sum + value, 0) / profile.request.sourceFramesPerSecond;
  const runtimeDuration = frameDurations.reduce((sum, value) => sum + value, 0) / framesPerSecond;
  if (Math.abs(sourceDuration - runtimeDuration) > EPSILON) fail("ANIMATION_PROFILE_RUNTIME_DURATION_MISMATCH");
  const action = profile.request.action;
  return {
    id: `clip.${profile.request.delivery.animationName}`,
    animationName: profile.request.delivery.animationName,
    kind: runtimeKind(action),
    direction: ["camera", "none"].includes(profile.request.direction) ? "none" : profile.request.direction,
    cameraProfileId: profile.request.camera.profileId,
    sourcePlanDigest: profile.contentDigest,
    frameCount: profile.drawings.length,
    framesPerSecond,
    frameDurations,
    loopMode: profile.request.loop ? "linear" : "none",
    ...(["walk", "run", "sprint"].includes(action) ? { phaseFamily: `locomotion.${profile.request.direction}` } : {}),
    mirrorPolicy: profile.request.mirrorPolicy,
    asymmetricVisualAnchors: [...profile.request.subject.asymmetricVisualAnchors],
    markers: profile.events.map((event) => ({ id: event.id, frame: event.drawingOrdinal, kind: event.kind, ...(event.payload ? { payload: event.payload } : {}) })),
  };
}

function safeWorkspacePath(input) {
  const root = process.cwd();
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return absolute;
  fail("ANIMATION_PROFILE_PATH_OUTSIDE_WORKSPACE", input);
}

async function emit(value, outputPath) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) process.stdout.write(body);
  else await writeFile(safeWorkspacePath(outputPath), body, { encoding: "utf8", flag: "wx" });
}

async function cli() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!command || !inputPath || !["compile", "verify", "review", "verify-review", "runtime", "next-batch"].includes(command)) {
    fail("ANIMATION_PROFILE_USAGE", "node tools/animation_production_profile_canonical_v1.mjs <compile|verify|review|verify-review|runtime|next-batch> <input.json> [output.json]");
  }
  const input = JSON.parse(await readFile(safeWorkspacePath(inputPath), "utf8"));
  if (command === "compile") return emit(compileAnimationProductionProfile(input), outputPath);
  if (command === "verify") {
    assertAnimationProductionProfileIntegrity(input);
    return emit({ status: "verified", profileId: input.profileId, contentDigest: input.contentDigest, promotable: input.quality.promotable }, outputPath);
  }
  if (command === "review") return emit(reviewAnimationProductionProfile(input), outputPath);
  if (command === "verify-review") {
    assertAnimationProductionReviewIntegrity(input.input, input.decision);
    return emit({ status: "verified", decisionDigest: input.decision.decisionDigest }, outputPath);
  }
  if (command === "runtime") return emit(compileAcceptedRuntimeClip(input.profile, input.decision), outputPath);
  return emit(nextAnimationProductionBatch(input.profile, input.completedDrawingIds ?? []), outputPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
