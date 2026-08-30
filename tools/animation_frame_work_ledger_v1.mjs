#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION = "2026-08-30.1";
export const ANIMATION_FRAME_LEDGER_KIND =
  "evavo.animation-frame-work-ledger.v1";
export const ANIMATION_FRAME_WORK_BATCH_KIND =
  "evavo.animation-frame-work-batch.v1";
export const ANIMATION_FRAME_WORK_ORDER_KIND =
  "evavo.animation-frame-work-order.v1";
export const ANIMATION_FRAME_CANDIDATE_RECEIPT_KIND =
  "evavo.animation-frame-candidate-receipt.v1";
export const ANIMATION_FRAME_LEDGER_EVENT_KIND =
  "evavo.animation-frame-work-ledger-event.v1";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ARTIFACT_ID = /^artifact_[0-9a-f]{64}$/;
const MAX_DRAWINGS = 4096;
const MAX_EVENTS = 16384;
const MAX_TEXT = 8192;
const PROFILE_MODULE_CANDIDATES = Object.freeze([
  "./animation_production_profile_canonical_v1.mjs",
  "./animation_production_profile_review_canonical_v1.mjs",
]);
const AUTHORITY = Object.freeze({
  providerExecution: false,
  automaticCreativeApproval: false,
  artifactPromotion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  runtimeActivation: false,
  publication: false,
});
const CREDENTIAL_KEY =
  /(?:^|[_-])(api[_-]?key|access[_-]?key|authorization|bearer|credential|password|private[_-]?key|refresh[_-]?token|secret|session[_-]?token|token)(?:$|[_-])/i;
const LOCATION_KEY =
  /(?:^|[_-])(absolute[_-]?path|file[_-]?path|filesystem[_-]?path|local[_-]?path|source[_-]?path|target[_-]?path|download[_-]?url|source[_-]?url|media[_-]?url|uri|url)(?:$|[_-])/i;
const LOCATION_VALUE = /^(?:file:|https?:|sandbox:|[A-Za-z]:[\\/]|\\\\)/i;

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

export function animationFrameLedgerSha256(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code, String(value));
  return value;
}

function digest(value, code) {
  if (typeof value !== "string" || !DIGEST.test(value)) fail(code, String(value));
  return value;
}

function artifactId(value, code) {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) fail(code, String(value));
  return value;
}

function positiveInteger(value, code, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(code, String(value));
  }
  return value;
}

function nonNegativeInteger(value, code, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    fail(code, String(value));
  }
  return value;
}

function finite(value, code, minimum, maximum) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(code, String(value));
  }
  return value;
}

function nonBlank(value, code, maximum = MAX_TEXT) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum
  ) {
    fail(code);
  }
  return value.trim();
}

function timestamp(value, code) {
  if (typeof value !== "string") fail(code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) fail(code);
  return parsed;
}

function distinctIds(value, code, maximum = MAX_DRAWINGS) {
  if (!Array.isArray(value) || value.length > maximum) fail(code);
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    const id = safeId(entry, code);
    if (seen.has(id)) fail(`${code}_DUPLICATE`, id);
    seen.add(id);
    result.push(id);
  }
  return result;
}

function assertPortableCredentialFree(value, path = "input", seen = new Set()) {
  if (value == null) return;
  if (typeof value === "string") {
    if (LOCATION_VALUE.test(value)) {
      fail("ANIMATION_FRAME_LEDGER_LOCATION_VALUE_FORBIDDEN", path);
    }
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value)) fail("ANIMATION_FRAME_LEDGER_CYCLIC_INPUT_FORBIDDEN", path);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertPortableCredentialFree(entry, `${path}[${index}]`, seen),
    );
  } else {
    for (const [key, entry] of Object.entries(value)) {
      if (CREDENTIAL_KEY.test(key)) {
        fail("ANIMATION_FRAME_LEDGER_CREDENTIAL_KEY_FORBIDDEN", `${path}.${key}`);
      }
      if (LOCATION_KEY.test(key)) {
        fail("ANIMATION_FRAME_LEDGER_LOCATION_KEY_FORBIDDEN", `${path}.${key}`);
      }
      assertPortableCredentialFree(entry, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

let profileModulePromise;
async function loadProfileModule() {
  if (!profileModulePromise) {
    profileModulePromise = (async () => {
      for (const candidate of PROFILE_MODULE_CANDIDATES) {
        try {
          const module = await import(new URL(candidate, import.meta.url).href);
          if (
            typeof module.assertAnimationProductionProfileIntegrity === "function" &&
            typeof module.reviewAnimationProductionProfile === "function"
          ) {
            return module;
          }
        } catch (error) {
          if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
        }
      }
      fail("ANIMATION_FRAME_LEDGER_PROFILE_MODULE_MISSING");
    })();
  }
  return profileModulePromise;
}

async function verifyProfile(profile) {
  const module = await loadProfileModule();
  await module.assertAnimationProductionProfileIntegrity(profile);
  return module;
}

function profileDrawingMap(profile) {
  if (!Array.isArray(profile.drawings) || profile.drawings.length < 1) {
    fail("ANIMATION_FRAME_LEDGER_PROFILE_DRAWINGS_INVALID");
  }
  if (profile.drawings.length > MAX_DRAWINGS) {
    fail("ANIMATION_FRAME_LEDGER_PROFILE_DRAWINGS_EXCESSIVE");
  }
  const map = new Map();
  for (const [index, drawingValue] of profile.drawings.entries()) {
    const drawing = object(
      drawingValue,
      `ANIMATION_FRAME_LEDGER_PROFILE_DRAWING_INVALID:${index}`,
    );
    const id = safeId(
      drawing.id,
      `ANIMATION_FRAME_LEDGER_PROFILE_DRAWING_ID_INVALID:${index}`,
    );
    if (map.has(id)) fail("ANIMATION_FRAME_LEDGER_PROFILE_DRAWING_ID_DUPLICATE", id);
    positiveInteger(
      drawing.ordinal,
      `ANIMATION_FRAME_LEDGER_PROFILE_DRAWING_ORDINAL_INVALID:${id}`,
      MAX_DRAWINGS,
    );
    if (!Array.isArray(drawing.dependencyDrawingIds)) {
      fail("ANIMATION_FRAME_LEDGER_PROFILE_DEPENDENCIES_INVALID", id);
    }
    map.set(id, drawing);
  }
  for (const [id, drawing] of map) {
    for (const dependency of drawing.dependencyDrawingIds) {
      safeId(dependency, "ANIMATION_FRAME_LEDGER_PROFILE_DEPENDENCY_ID_INVALID");
      if (!map.has(dependency)) {
        fail("ANIMATION_FRAME_LEDGER_PROFILE_DEPENDENCY_UNKNOWN", `${id}:${dependency}`);
      }
      if (dependency === id) {
        fail("ANIMATION_FRAME_LEDGER_PROFILE_SELF_DEPENDENCY", id);
      }
    }
  }
  return map;
}

function validateProfileForLedger(profile) {
  object(profile, "ANIMATION_FRAME_LEDGER_PROFILE_INVALID");
  safeId(profile.profileId, "ANIMATION_FRAME_LEDGER_PROFILE_ID_INVALID");
  digest(profile.contentDigest, "ANIMATION_FRAME_LEDGER_PROFILE_DIGEST_INVALID");
  if (profile.request?.state !== "approved" || profile.quality?.promotable !== true) {
    fail("ANIMATION_FRAME_LEDGER_PROFILE_NOT_APPROVED");
  }
  positiveInteger(
    profile.iterationPolicy?.maximumAttemptsPerDrawing,
    "ANIMATION_FRAME_LEDGER_ATTEMPT_POLICY_INVALID",
    100,
  );
  positiveInteger(
    profile.iterationPolicy?.maximumBatchSize,
    "ANIMATION_FRAME_LEDGER_BATCH_POLICY_INVALID",
    256,
  );
  profileDrawingMap(profile);
}

function ledgerBody(value) {
  const { contentDigest: _contentDigest, ...body } = value;
  return body;
}

function withLedgerDigest(body) {
  return Object.freeze({ ...body, contentDigest: animationFrameLedgerSha256(body) });
}

function initialLedger(profile, sessionId, now) {
  validateProfileForLedger(profile);
  safeId(sessionId, "ANIMATION_FRAME_LEDGER_SESSION_ID_INVALID");
  const createdAt = now.toISOString();
  const drawingStates = profile.drawings.map((drawing) => ({
    drawingId: drawing.id,
    ordinal: drawing.ordinal,
    generationClass: drawing.generationClass,
    status: "pending",
    attemptCount: 0,
    candidates: [],
  }));
  return withLedgerDigest({
    protocolVersion: ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION,
    kind: ANIMATION_FRAME_LEDGER_KIND,
    ledgerId: `${sessionId}:${profile.profileId}`,
    sessionId,
    profileId: profile.profileId,
    profileDigest: profile.contentDigest,
    drawingOrder: profile.drawings.map((drawing) => drawing.id),
    requestedTargets: [...profile.request.targets],
    iterationPolicy: {
      maximumAttemptsPerDrawing:
        profile.iterationPolicy.maximumAttemptsPerDrawing,
      maximumBatchSize: profile.iterationPolicy.maximumBatchSize,
      maximumReviewCycles: profile.iterationPolicy.maximumReviewCycles,
      maximumNoProgressCycles:
        profile.iterationPolicy.maximumNoProgressCycles,
    },
    drawingStates,
    review: null,
    events: [],
    revision: 0,
    authority: AUTHORITY,
    createdAt,
    updatedAt: createdAt,
  });
}

export async function createAnimationFrameWorkLedger(
  input,
  now = new Date(),
) {
  const value = object(input, "ANIMATION_FRAME_LEDGER_CREATE_INPUT_INVALID");
  assertPortableCredentialFree(value);
  await verifyProfile(value.profile);
  timestamp(now.toISOString(), "ANIMATION_FRAME_LEDGER_CREATE_TIME_INVALID");
  return initialLedger(value.profile, value.sessionId, now);
}

function stateMap(ledger) {
  return new Map(ledger.drawingStates.map((state) => [state.drawingId, state]));
}

function assertAuthority(authority) {
  if (JSON.stringify(authority) !== JSON.stringify(AUTHORITY)) {
    fail("ANIMATION_FRAME_LEDGER_AUTHORITY_INVALID");
  }
}

function assertLedgerShape(profile, ledger) {
  object(ledger, "ANIMATION_FRAME_LEDGER_INVALID");
  if (
    ledger.protocolVersion !== ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION ||
    ledger.kind !== ANIMATION_FRAME_LEDGER_KIND
  ) {
    fail("ANIMATION_FRAME_LEDGER_PROTOCOL_INVALID");
  }
  safeId(ledger.sessionId, "ANIMATION_FRAME_LEDGER_SESSION_ID_INVALID");
  safeId(ledger.ledgerId, "ANIMATION_FRAME_LEDGER_ID_INVALID");
  if (
    ledger.profileId !== profile.profileId ||
    ledger.profileDigest !== profile.contentDigest
  ) {
    fail("ANIMATION_FRAME_LEDGER_PROFILE_MISMATCH");
  }
  digest(ledger.contentDigest, "ANIMATION_FRAME_LEDGER_DIGEST_INVALID");
  timestamp(ledger.createdAt, "ANIMATION_FRAME_LEDGER_CREATED_AT_INVALID");
  timestamp(ledger.updatedAt, "ANIMATION_FRAME_LEDGER_UPDATED_AT_INVALID");
  nonNegativeInteger(ledger.revision, "ANIMATION_FRAME_LEDGER_REVISION_INVALID");
  assertAuthority(ledger.authority);
  if (!Array.isArray(ledger.events) || ledger.events.length > MAX_EVENTS) {
    fail("ANIMATION_FRAME_LEDGER_EVENTS_INVALID");
  }
}

function eventBody(event) {
  const { eventDigest: _eventDigest, ...body } = event;
  return body;
}

function assertEventSelfIntegrity(event, expectedSequence, priorDigest) {
  object(event, "ANIMATION_FRAME_LEDGER_EVENT_INVALID");
  if (event.kind !== ANIMATION_FRAME_LEDGER_EVENT_KIND) {
    fail("ANIMATION_FRAME_LEDGER_EVENT_KIND_INVALID");
  }
  positiveInteger(
    event.sequence,
    "ANIMATION_FRAME_LEDGER_EVENT_SEQUENCE_INVALID",
    MAX_EVENTS,
  );
  if (event.sequence !== expectedSequence) {
    fail("ANIMATION_FRAME_LEDGER_EVENT_SEQUENCE_MISMATCH");
  }
  if (event.priorLedgerDigest !== priorDigest) {
    fail("ANIMATION_FRAME_LEDGER_EVENT_PRIOR_DIGEST_MISMATCH");
  }
  timestamp(event.recordedAt, "ANIMATION_FRAME_LEDGER_EVENT_TIME_INVALID");
  digest(event.eventDigest, "ANIMATION_FRAME_LEDGER_EVENT_DIGEST_INVALID");
  if (animationFrameLedgerSha256(eventBody(event)) !== event.eventDigest) {
    fail("ANIMATION_FRAME_LEDGER_EVENT_DIGEST_MISMATCH");
  }
}

function appendEvent(ledger, type, ownerRole, payload, now) {
  const body = {
    kind: ANIMATION_FRAME_LEDGER_EVENT_KIND,
    sequence: ledger.events.length + 1,
    priorLedgerDigest: ledger.contentDigest,
    type,
    ownerRole,
    payload,
    recordedAt: now.toISOString(),
  };
  return { ...body, eventDigest: animationFrameLedgerSha256(body) };
}

function latestCandidate(state) {
  return state.candidates.at(-1)?.candidate;
}

function workOrderBody(workOrder) {
  const { workOrderDigest: _workOrderDigest, issuedAt: _issuedAt, ...body } =
    workOrder;
  return body;
}

function assertWorkOrderSelfIntegrity(workOrder) {
  object(workOrder, "ANIMATION_FRAME_WORK_ORDER_INVALID");
  if (
    workOrder.protocolVersion !== ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION ||
    workOrder.kind !== ANIMATION_FRAME_WORK_ORDER_KIND
  ) {
    fail("ANIMATION_FRAME_WORK_ORDER_PROTOCOL_INVALID");
  }
  digest(workOrder.workOrderDigest, "ANIMATION_FRAME_WORK_ORDER_DIGEST_INVALID");
  timestamp(workOrder.issuedAt, "ANIMATION_FRAME_WORK_ORDER_TIME_INVALID");
  if (animationFrameLedgerSha256(workOrderBody(workOrder)) !== workOrder.workOrderDigest) {
    fail("ANIMATION_FRAME_WORK_ORDER_DIGEST_MISMATCH");
  }
  assertAuthority(workOrder.authority);
  assertPortableCredentialFree(workOrder);
}

function batchBody(batch) {
  const { batchDigest: _batchDigest, issuedAt: _issuedAt, ...body } = batch;
  return body;
}

function assertBatchSelfIntegrity(batch) {
  object(batch, "ANIMATION_FRAME_WORK_BATCH_INVALID");
  if (
    batch.protocolVersion !== ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION ||
    batch.kind !== ANIMATION_FRAME_WORK_BATCH_KIND
  ) {
    fail("ANIMATION_FRAME_WORK_BATCH_PROTOCOL_INVALID");
  }
  digest(batch.batchDigest, "ANIMATION_FRAME_WORK_BATCH_DIGEST_INVALID");
  timestamp(batch.issuedAt, "ANIMATION_FRAME_WORK_BATCH_TIME_INVALID");
  if (animationFrameLedgerSha256(batchBody(batch)) !== batch.batchDigest) {
    fail("ANIMATION_FRAME_WORK_BATCH_DIGEST_MISMATCH");
  }
  if (!Array.isArray(batch.workOrders) || batch.workOrders.length < 1) {
    fail("ANIMATION_FRAME_WORK_BATCH_EMPTY");
  }
  batch.workOrders.forEach(assertWorkOrderSelfIntegrity);
  assertAuthority(batch.authority);
  assertPortableCredentialFree(batch);
}

function normalizeReferenceBinding(value, index) {
  const binding = object(
    value,
    `ANIMATION_FRAME_REFERENCE_BINDING_INVALID:${index}`,
  );
  return {
    artifactId: artifactId(
      binding.artifactId,
      `ANIMATION_FRAME_REFERENCE_ARTIFACT_INVALID:${index}`,
    ),
    contentDigest: digest(
      binding.contentDigest,
      `ANIMATION_FRAME_REFERENCE_DIGEST_INVALID:${index}`,
    ),
    mediaType:
      binding.mediaType === "image/png"
        ? "image/png"
        : fail("ANIMATION_FRAME_REFERENCE_MEDIA_TYPE_INVALID", String(index)),
    width: positiveInteger(
      binding.width,
      `ANIMATION_FRAME_REFERENCE_WIDTH_INVALID:${index}`,
      8192,
    ),
    height: positiveInteger(
      binding.height,
      `ANIMATION_FRAME_REFERENCE_HEIGHT_INVALID:${index}`,
      8192,
    ),
  };
}

function externalReferenceMap(input) {
  if (input === undefined) return new Map();
  if (!Array.isArray(input) || input.length > 256) {
    fail("ANIMATION_FRAME_REFERENCE_BINDINGS_INVALID");
  }
  const map = new Map();
  input.forEach((entry, index) => {
    const binding = normalizeReferenceBinding(entry, index);
    if (map.has(binding.artifactId)) {
      fail("ANIMATION_FRAME_REFERENCE_BINDING_DUPLICATE", binding.artifactId);
    }
    map.set(binding.artifactId, binding);
  });
  return map;
}

function drawingById(profile, id) {
  const drawing = profile.drawings.find((entry) => entry.id === id);
  if (!drawing) fail("ANIMATION_FRAME_LEDGER_DRAWING_UNKNOWN", id);
  return drawing;
}

function candidateReference(state, role) {
  const candidate = latestCandidate(state);
  if (!candidate) return null;
  return {
    role,
    artifactId: candidate.artifactId,
    contentDigest: candidate.contentDigest,
    mediaType: candidate.mediaType,
    width: candidate.width,
    height: candidate.height,
    sourceDrawingId: state.drawingId,
  };
}

function requiredDrawingIds(profile, ledger) {
  const states = stateMap(ledger);
  const repairs = ledger.drawingOrder.filter(
    (id) => states.get(id)?.status === "repair-required",
  );
  if (repairs.length) {
    return {
      mode: "repair",
      generationBatchId: `repair-cycle-${ledger.review?.cycle ?? 0}`,
      drawingIds: repairs.slice(0, ledger.iterationPolicy.maximumBatchSize),
    };
  }

  const completed = new Set(
    ledger.drawingStates
      .filter((state) => state.status !== "pending")
      .map((state) => state.drawingId),
  );
  for (const batch of profile.generationBatches) {
    const remaining = batch.drawingIds.filter((id) => !completed.has(id));
    if (!remaining.length) continue;
    const dependenciesReady = batch.dependencyDrawingIds.every((id) => {
      const state = states.get(id);
      return state && state.status !== "pending" && latestCandidate(state);
    });
    if (!dependenciesReady) {
      return {
        mode: "generate",
        generationBatchId: batch.id,
        drawingIds: [],
        blockedByDrawingIds: batch.dependencyDrawingIds.filter((id) => {
          const state = states.get(id);
          return !state || state.status === "pending" || !latestCandidate(state);
        }),
      };
    }
    return {
      mode: "generate",
      generationBatchId: batch.id,
      drawingIds: remaining.slice(0, ledger.iterationPolicy.maximumBatchSize),
    };
  }
  return { mode: "none", generationBatchId: "none", drawingIds: [] };
}

function externalReference(binding, role) {
  return { role, ...binding };
}

function compileReferences(profile, ledger, drawing, bindings) {
  const states = stateMap(ledger);
  const references = [];
  const missing = [];
  const identityId = profile.request.subject.identityReferenceArtifactId;
  const identity = bindings.get(identityId);
  if (identity) references.push(externalReference(identity, "canonical-identity"));
  else missing.push({ role: "canonical-identity", artifactId: identityId });

  const directionId = profile.request.subject.directionMasterArtifactId;
  if (directionId) {
    const direction = bindings.get(directionId);
    if (direction) references.push(externalReference(direction, "direction-master"));
    else missing.push({ role: "direction-master", artifactId: directionId });
  }

  for (const dependencyId of drawing.dependencyDrawingIds) {
    const reference = candidateReference(states.get(dependencyId), "dependency-pose");
    if (reference) references.push(reference);
    else missing.push({ role: "dependency-pose", drawingId: dependencyId });
  }

  for (const [neighbourId, role] of [
    [drawing.previousDrawingId, "previous-pose"],
    [drawing.nextDrawingId, "next-pose"],
  ]) {
    if (!neighbourId || neighbourId === drawing.id) continue;
    const state = states.get(neighbourId);
    const reference = state ? candidateReference(state, role) : null;
    if (
      reference &&
      !references.some(
        (entry) =>
          entry.artifactId === reference.artifactId && entry.role === reference.role,
      )
    ) {
      references.push(reference);
    }
  }
  return { references, missing };
}

function repairForDrawing(ledger, drawingId) {
  return ledger.review?.decision?.retryQueue?.find(
    (entry) => entry.drawingId === drawingId,
  );
}

function compilePrompt(profile, drawing, mode, repair) {
  const request = profile.request;
  const positive = [
    `Produce one ${drawing.generationClass} drawing for ${request.title}.`,
    `Drawing ${drawing.ordinal} of ${profile.drawings.length}: ${drawing.poseIntent}`,
    `Action ${request.action}; direction ${request.direction}; phase ${drawing.phase}.`,
    `Keep camera ${request.camera.profileId}: ${request.camera.perspective}, ${request.camera.projection}, yaw ${request.camera.yawDegrees}, pitch ${request.camera.pitchDegrees}, roll ${request.camera.rollDegrees}, scale ${request.camera.scale}, ground line ${request.camera.groundLineNormalized}.`,
    `Preserve identity ${request.subject.identityLockId} revision ${request.subject.identityRevision}.`,
    `Silhouette anchors: ${request.subject.silhouetteAnchors.join("; ")}.`,
    `Costume anchors: ${request.subject.costumeAnchors.join("; ")}.`,
    ...(request.subject.propAnchors.length
      ? [`Prop anchors: ${request.subject.propAnchors.join("; ")}.`]
      : []),
    `Performance: ${request.performance.intent} ${request.performance.weight} ${request.performance.tempo}`,
    `Style: ${request.style.lineTreatment} ${request.style.shapeLanguage.join("; ")}.`,
    `Continuity: ${request.performance.continuityAnchors.join("; ")}.`,
    `Contact ${drawing.contactAnchor}; ground contact ${drawing.groundContactRequired ? "required" : "not required"}; expected root offset ${drawing.expectedRootOffset.x},${drawing.expectedRootOffset.y}.`,
    ...(mode === "repair"
      ? [
          `Repair only this rejected drawing. ${repair?.repairInstructions?.join(" ") ?? "Preserve all accepted neighbours."}`,
        ]
      : []),
    `Return one ${request.delivery.canvas.width}x${request.delivery.canvas.height} PNG with ${request.delivery.alphaRequired ? "meaningful native alpha" : "the approved opaque background"}; do not trim or change pivot ${request.delivery.pivot.x},${request.delivery.pivot.y}.`,
  ];
  const negative = [
    ...request.style.exclusions,
    "independent redesign of character identity",
    "camera or scale drift",
    "cropped silhouette or unsafe edge contact",
    "contact-sheet, grid, storyboard or multiple frames in one image",
    "readable generated labels or signatures",
    ...(mode === "repair"
      ? ["changes to already accepted drawings or unlisted traits"]
      : []),
  ];
  return {
    positive: positive.join("\n"),
    negative: [...new Set(negative)].join("; "),
    antiGenericTraits: [...request.style.antiGenericTraits],
  };
}

function workOrder(profile, ledger, drawing, mode, references, repair, now) {
  const state = stateMap(ledger).get(drawing.id);
  if (!state) fail("ANIMATION_FRAME_LEDGER_DRAWING_STATE_MISSING", drawing.id);
  const attempt = state.attemptCount + 1;
  if (attempt > ledger.iterationPolicy.maximumAttemptsPerDrawing) {
    fail("ANIMATION_FRAME_LEDGER_ATTEMPT_BUDGET_EXHAUSTED", drawing.id);
  }
  const preserveDrawingIds = ledger.drawingStates
    .filter((entry) => entry.status === "accepted")
    .map((entry) => entry.drawingId)
    .sort();
  const body = {
    protocolVersion: ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION,
    kind: ANIMATION_FRAME_WORK_ORDER_KIND,
    workOrderId: `${ledger.sessionId}:${drawing.id}:attempt-${attempt}`,
    ledgerId: ledger.ledgerId,
    ledgerDigest: ledger.contentDigest,
    profileId: profile.profileId,
    profileDigest: profile.contentDigest,
    drawingId: drawing.id,
    drawingOrdinal: drawing.ordinal,
    mode,
    attempt,
    idempotencyKey: animationFrameLedgerSha256({
      profileDigest: profile.contentDigest,
      drawingId: drawing.id,
      mode,
      attempt,
      referenceDigests: references.map((entry) => entry.contentDigest),
      failureCodes: repair?.failureCodes ?? [],
    }),
    drawing: {
      generationClass: drawing.generationClass,
      role: drawing.role,
      poseId: drawing.poseId,
      poseIntent: drawing.poseIntent,
      phase: drawing.phase,
      contactAnchor: drawing.contactAnchor,
      groundContactRequired: drawing.groundContactRequired,
      expectedRootOffset: drawing.expectedRootOffset,
      exposureStartFrame: drawing.exposureStartFrame,
      exposureEndFrame: drawing.exposureEndFrame,
      exposureFrames: drawing.exposureFrames,
      durationMs: drawing.durationMs,
      dependencyDrawingIds: [...drawing.dependencyDrawingIds],
      eventIds: [...drawing.eventIds],
    },
    immutableLocks: {
      subject: clone(profile.request.subject),
      camera: clone(profile.request.camera),
      performance: clone(profile.request.performance),
      style: clone(profile.request.style),
      delivery: clone(profile.request.delivery),
    },
    promptPackage: compilePrompt(profile, drawing, mode, repair),
    references,
    repair: repair
      ? {
          failureCodes: [...repair.failureCodes],
          repairInstructions: [...repair.repairInstructions],
          authoritativeDependencyDrawingIds: [
            ...repair.authoritativeDependencyDrawingIds,
          ],
        }
      : null,
    preserveDrawingIds,
    expectedOutput: {
      images: 1,
      mediaType: "image/png",
      width: profile.request.delivery.canvas.width,
      height: profile.request.delivery.canvas.height,
      meaningfulAlphaRequired: profile.request.delivery.alphaRequired,
      trim: false,
      pivot: clone(profile.request.delivery.pivot),
      candidateOnly: true,
    },
    reviewRequirements: {
      drawingGates: clone(profile.qualityGates.drawing),
      compareAgainstDrawingIds: [
        ...new Set([
          ...drawing.dependencyDrawingIds,
          drawing.previousDrawingId,
          drawing.nextDrawingId,
        ].filter((id) => id && id !== drawing.id)),
      ],
      normalSpeedSequenceReviewRequired: true,
      frameByFrameSequenceReviewRequired: true,
    },
    authority: AUTHORITY,
  };
  return {
    ...body,
    workOrderDigest: animationFrameLedgerSha256(body),
    issuedAt: now.toISOString(),
  };
}

export async function compileNextAnimationFrameWorkBatch(
  input,
  now = new Date(),
) {
  const value = object(input, "ANIMATION_FRAME_WORK_BATCH_INPUT_INVALID");
  assertPortableCredentialFree(value);
  await assertAnimationFrameWorkLedgerIntegrity(value.profile, value.ledger);
  const selection = requiredDrawingIds(value.profile, value.ledger);
  if (selection.blockedByDrawingIds?.length) {
    return {
      status: "blocked-by-dependencies",
      generationBatchId: selection.generationBatchId,
      blockedByDrawingIds: selection.blockedByDrawingIds,
      authority: AUTHORITY,
    };
  }
  if (!selection.drawingIds.length) {
    return {
      status: value.ledger.drawingStates.every((state) => state.status === "accepted")
        ? "accepted"
        : "awaiting-independent-review",
      generationBatchId: selection.generationBatchId,
      authority: AUTHORITY,
    };
  }
  const bindings = externalReferenceMap(value.referenceBindings);
  const compiled = [];
  const missing = [];
  for (const drawingId of selection.drawingIds) {
    const drawing = drawingById(value.profile, drawingId);
    const referenceResult = compileReferences(
      value.profile,
      value.ledger,
      drawing,
      bindings,
    );
    missing.push(
      ...referenceResult.missing.map((entry) => ({ drawingId, ...entry })),
    );
    compiled.push({ drawing, references: referenceResult.references });
  }
  if (missing.length) {
    return {
      status: "awaiting-reference-bindings",
      generationBatchId: selection.generationBatchId,
      missingReferences: missing,
      authority: AUTHORITY,
    };
  }
  const workOrders = compiled.map(({ drawing, references }) =>
    workOrder(
      value.profile,
      value.ledger,
      drawing,
      selection.mode,
      references,
      selection.mode === "repair"
        ? repairForDrawing(value.ledger, drawing.id)
        : null,
      now,
    ),
  );
  const body = {
    status: "work-ready",
    protocolVersion: ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION,
    kind: ANIMATION_FRAME_WORK_BATCH_KIND,
    batchId: `${value.ledger.sessionId}:${selection.generationBatchId}:r${value.ledger.revision}`,
    ledgerId: value.ledger.ledgerId,
    ledgerDigest: value.ledger.contentDigest,
    profileId: value.profile.profileId,
    profileDigest: value.profile.contentDigest,
    generationBatchId: selection.generationBatchId,
    mode: selection.mode,
    workOrders,
    authority: AUTHORITY,
  };
  return {
    ...body,
    batchDigest: animationFrameLedgerSha256(body),
    issuedAt: now.toISOString(),
  };
}

function receiptBody(receipt) {
  const { receiptDigest: _receiptDigest, admittedAt: _admittedAt, ...body } =
    receipt;
  return body;
}

function assertCandidate(candidate, expected, drawingId) {
  const item = object(candidate, "ANIMATION_FRAME_CANDIDATE_INVALID");
  artifactId(item.artifactId, "ANIMATION_FRAME_CANDIDATE_ARTIFACT_INVALID");
  digest(item.contentDigest, "ANIMATION_FRAME_CANDIDATE_DIGEST_INVALID");
  positiveInteger(item.byteLength, "ANIMATION_FRAME_CANDIDATE_LENGTH_INVALID");
  if (item.mediaType !== "image/png") {
    fail("ANIMATION_FRAME_CANDIDATE_MEDIA_TYPE_INVALID");
  }
  if (item.width !== expected.width || item.height !== expected.height) {
    fail("ANIMATION_FRAME_CANDIDATE_CANVAS_MISMATCH", drawingId);
  }
  if (expected.meaningfulAlphaRequired && item.meaningfulAlpha !== true) {
    fail("ANIMATION_FRAME_CANDIDATE_ALPHA_MISSING", drawingId);
  }
  digest(
    item.providerRequestDigest,
    "ANIMATION_FRAME_CANDIDATE_PROVIDER_REQUEST_DIGEST_INVALID",
  );
  digest(
    item.providerResponseDigest,
    "ANIMATION_FRAME_CANDIDATE_PROVIDER_RESPONSE_DIGEST_INVALID",
  );
  digest(
    item.inspectionEvidenceDigest,
    "ANIMATION_FRAME_CANDIDATE_INSPECTION_DIGEST_INVALID",
  );
  safeId(item.adapterId, "ANIMATION_FRAME_CANDIDATE_ADAPTER_INVALID");
  if (item.modelId !== undefined) {
    safeId(item.modelId, "ANIMATION_FRAME_CANDIDATE_MODEL_INVALID");
  }
  assertPortableCredentialFree(item, "candidate");
  return clone(item);
}

export function compileAnimationFrameCandidateReceipt(
  input,
  now = new Date(),
) {
  const value = object(input, "ANIMATION_FRAME_CANDIDATE_RECEIPT_INPUT_INVALID");
  assertPortableCredentialFree(value);
  assertWorkOrderSelfIntegrity(value.workOrder);
  if (value.workOrder.ledgerDigest !== value.ledgerDigest) {
    fail("ANIMATION_FRAME_CANDIDATE_STALE_WORK_ORDER");
  }
  const candidate = assertCandidate(
    value.candidate,
    value.workOrder.expectedOutput,
    value.workOrder.drawingId,
  );
  const body = {
    protocolVersion: ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION,
    kind: ANIMATION_FRAME_CANDIDATE_RECEIPT_KIND,
    receiptId: `${value.workOrder.workOrderId}:candidate`,
    ledgerId: value.workOrder.ledgerId,
    ledgerDigest: value.workOrder.ledgerDigest,
    profileDigest: value.workOrder.profileDigest,
    workOrderDigest: value.workOrder.workOrderDigest,
    drawingId: value.workOrder.drawingId,
    attempt: value.workOrder.attempt,
    candidate,
    status: "candidate-recorded",
    authority: AUTHORITY,
  };
  return {
    ...body,
    receiptDigest: animationFrameLedgerSha256(body),
    admittedAt: now.toISOString(),
  };
}

function assertReceiptSelfIntegrity(receipt) {
  object(receipt, "ANIMATION_FRAME_CANDIDATE_RECEIPT_INVALID");
  if (
    receipt.protocolVersion !== ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION ||
    receipt.kind !== ANIMATION_FRAME_CANDIDATE_RECEIPT_KIND
  ) {
    fail("ANIMATION_FRAME_CANDIDATE_RECEIPT_PROTOCOL_INVALID");
  }
  digest(receipt.receiptDigest, "ANIMATION_FRAME_CANDIDATE_RECEIPT_DIGEST_INVALID");
  timestamp(receipt.admittedAt, "ANIMATION_FRAME_CANDIDATE_RECEIPT_TIME_INVALID");
  if (animationFrameLedgerSha256(receiptBody(receipt)) !== receipt.receiptDigest) {
    fail("ANIMATION_FRAME_CANDIDATE_RECEIPT_DIGEST_MISMATCH");
  }
  assertAuthority(receipt.authority);
  assertPortableCredentialFree(receipt);
}

function assertBatchReceipts(profile, ledger, batch, receipts) {
  assertBatchSelfIntegrity(batch);
  if (
    batch.ledgerId !== ledger.ledgerId ||
    batch.ledgerDigest !== ledger.contentDigest ||
    batch.profileDigest !== profile.contentDigest
  ) {
    fail("ANIMATION_FRAME_WORK_BATCH_LEDGER_MISMATCH");
  }
  if (!Array.isArray(receipts) || receipts.length !== batch.workOrders.length) {
    fail("ANIMATION_FRAME_CANDIDATE_RECEIPT_COUNT_MISMATCH");
  }
  const byWorkOrder = new Map();
  for (const receipt of receipts) {
    assertReceiptSelfIntegrity(receipt);
    if (byWorkOrder.has(receipt.workOrderDigest)) {
      fail("ANIMATION_FRAME_CANDIDATE_RECEIPT_DUPLICATE", receipt.workOrderDigest);
    }
    byWorkOrder.set(receipt.workOrderDigest, receipt);
  }
  for (const workOrder of batch.workOrders) {
    const receipt = byWorkOrder.get(workOrder.workOrderDigest);
    if (!receipt) {
      fail("ANIMATION_FRAME_CANDIDATE_RECEIPT_MISSING", workOrder.drawingId);
    }
    if (
      receipt.ledgerDigest !== ledger.contentDigest ||
      receipt.profileDigest !== profile.contentDigest ||
      receipt.drawingId !== workOrder.drawingId ||
      receipt.attempt !== workOrder.attempt
    ) {
      fail("ANIMATION_FRAME_CANDIDATE_RECEIPT_BINDING_MISMATCH", workOrder.drawingId);
    }
    assertCandidate(receipt.candidate, workOrder.expectedOutput, workOrder.drawingId);
  }
  return byWorkOrder;
}

function applyCandidateBatchEvent(profile, ledger, event) {
  const batch = event.payload.batch;
  const receipts = event.payload.receipts;
  const byWorkOrder = assertBatchReceipts(profile, ledger, batch, receipts);
  const nextStates = ledger.drawingStates.map((state) => {
    const workOrder = batch.workOrders.find(
      (entry) => entry.drawingId === state.drawingId,
    );
    if (!workOrder) return state;
    const expectedStatus = workOrder.mode === "repair" ? "repair-required" : "pending";
    if (state.status !== expectedStatus) {
      fail("ANIMATION_FRAME_LEDGER_DRAWING_NOT_READY", state.drawingId);
    }
    if (workOrder.attempt !== state.attemptCount + 1) {
      fail("ANIMATION_FRAME_LEDGER_ATTEMPT_SEQUENCE_INVALID", state.drawingId);
    }
    if (
      workOrder.attempt > ledger.iterationPolicy.maximumAttemptsPerDrawing
    ) {
      fail("ANIMATION_FRAME_LEDGER_ATTEMPT_BUDGET_EXHAUSTED", state.drawingId);
    }
    const receipt = byWorkOrder.get(workOrder.workOrderDigest);
    return {
      ...state,
      status: "candidate-ready",
      attemptCount: workOrder.attempt,
      candidates: [
        ...state.candidates,
        {
          workOrderDigest: workOrder.workOrderDigest,
          receiptDigest: receipt.receiptDigest,
          candidate: clone(receipt.candidate),
          admittedAt: receipt.admittedAt,
        },
      ],
    };
  });
  if (
    nextStates.every(
      (state, index) => state === ledger.drawingStates[index],
    )
  ) {
    fail("ANIMATION_FRAME_LEDGER_CANDIDATE_BATCH_NO_CHANGE");
  }
  return withLedgerDigest({
    ...ledgerBody(ledger),
    drawingStates: nextStates,
    events: [...ledger.events, event],
    revision: ledger.revision + 1,
    updatedAt: event.recordedAt,
  });
}

export async function applyAnimationFrameCandidateBatch(
  input,
  now = new Date(),
) {
  const value = object(input, "ANIMATION_FRAME_CANDIDATE_BATCH_INPUT_INVALID");
  assertPortableCredentialFree(value);
  await assertAnimationFrameWorkLedgerIntegrity(value.profile, value.ledger);
  assertBatchReceipts(value.profile, value.ledger, value.batch, value.receipts);
  const event = appendEvent(
    value.ledger,
    "candidate-batch-admitted",
    "art-studio",
    { batch: value.batch, receipts: value.receipts },
    now,
  );
  return applyCandidateBatchEvent(value.profile, value.ledger, event);
}

function normalizeReviewInput(profile, ledger, submitted) {
  const value = object(submitted, "ANIMATION_FRAME_LEDGER_REVIEW_INPUT_INVALID");
  if (!Array.isArray(value.drawingEvidence)) {
    fail("ANIMATION_FRAME_LEDGER_DRAWING_EVIDENCE_INVALID");
  }
  const states = stateMap(ledger);
  for (const evidence of value.drawingEvidence) {
    const drawingId = safeId(
      evidence.drawingId,
      "ANIMATION_FRAME_LEDGER_EVIDENCE_DRAWING_INVALID",
    );
    const state = states.get(drawingId);
    if (!state) fail("ANIMATION_FRAME_LEDGER_EVIDENCE_DRAWING_UNKNOWN", drawingId);
    const candidate = latestCandidate(state);
    if (!candidate) {
      fail("ANIMATION_FRAME_LEDGER_EVIDENCE_WITHOUT_CANDIDATE", drawingId);
    }
    if (
      evidence.artifactId !== candidate.artifactId ||
      evidence.contentDigest !== candidate.contentDigest ||
      evidence.attempt !== state.attemptCount
    ) {
      fail("ANIMATION_FRAME_LEDGER_EVIDENCE_CANDIDATE_MISMATCH", drawingId);
    }
  }
  const previousDecision =
    value.previousDecision ?? ledger.review?.decision ?? undefined;
  return {
    profile,
    cycle: value.cycle,
    drawingEvidence: clone(value.drawingEvidence),
    ...(value.sequenceEvidence === undefined
      ? {}
      : { sequenceEvidence: clone(value.sequenceEvidence) }),
    ...(previousDecision === undefined
      ? {}
      : { previousDecision: clone(previousDecision) }),
  };
}

function applyReviewEvent(profile, ledger, event) {
  const payload = object(event.payload, "ANIMATION_FRAME_LEDGER_REVIEW_EVENT_INVALID");
  const moduleInput = { profile, ...payload.reviewInput };
  const decision = payload.decision;
  const states = stateMap(ledger);
  const accepted = new Set(decision.acceptedDrawingIds ?? []);
  const required = new Set(decision.reviewRequiredDrawingIds ?? []);
  const rejected = new Set(decision.rejectedDrawingIds ?? []);
  for (const id of [...accepted, ...required, ...rejected]) {
    if (!states.has(id)) fail("ANIMATION_FRAME_LEDGER_REVIEW_DRAWING_UNKNOWN", id);
  }
  const nextStates = ledger.drawingStates.map((state) => {
    if (accepted.has(state.drawingId)) return { ...state, status: "accepted" };
    if (rejected.has(state.drawingId)) {
      return { ...state, status: "repair-required" };
    }
    if (required.has(state.drawingId)) {
      return { ...state, status: "review-required" };
    }
    return state;
  });
  return withLedgerDigest({
    ...ledgerBody(ledger),
    drawingStates: nextStates,
    review: {
      cycle: decision.cycle,
      status: decision.status,
      decisionDigest: decision.decisionDigest,
      decision: clone(decision),
      reviewInputDigest: animationFrameLedgerSha256(moduleInput),
      reviewedAt: decision.decidedAt,
    },
    events: [...ledger.events, event],
    revision: ledger.revision + 1,
    updatedAt: event.recordedAt,
  });
}

export async function reviewAnimationFrameWorkLedger(
  input,
  now = new Date(),
) {
  const value = object(input, "ANIMATION_FRAME_LEDGER_REVIEW_OPERATION_INVALID");
  assertPortableCredentialFree(value);
  await assertAnimationFrameWorkLedgerIntegrity(value.profile, value.ledger);
  if (
    value.ledger.drawingStates.some(
      (state) => state.status === "pending" || state.status === "repair-required",
    )
  ) {
    fail("ANIMATION_FRAME_LEDGER_REVIEW_BEFORE_PRODUCTION_COMPLETE");
  }
  const module = await loadProfileModule();
  const reviewInput = normalizeReviewInput(
    value.profile,
    value.ledger,
    value.reviewInput,
  );
  const decision = await module.reviewAnimationProductionProfile(reviewInput, now);
  if (typeof module.assertAnimationProductionReviewIntegrity === "function") {
    await module.assertAnimationProductionReviewIntegrity(reviewInput, decision);
  }
  const event = appendEvent(
    value.ledger,
    "independent-review-applied",
    "cel-animation-studio",
    {
      reviewInput: (() => {
        const { profile: _profile, ...withoutProfile } = reviewInput;
        return withoutProfile;
      })(),
      decision,
    },
    now,
  );
  const ledger = applyReviewEvent(value.profile, value.ledger, event);
  return { decision, ledger };
}

async function replayEvent(profile, ledger, event) {
  assertEventSelfIntegrity(
    event,
    ledger.events.length + 1,
    ledger.contentDigest,
  );
  if (event.type === "candidate-batch-admitted") {
    if (event.ownerRole !== "art-studio") {
      fail("ANIMATION_FRAME_LEDGER_EVENT_OWNER_INVALID", event.type);
    }
    return applyCandidateBatchEvent(profile, ledger, event);
  }
  if (event.type === "independent-review-applied") {
    if (event.ownerRole !== "cel-animation-studio") {
      fail("ANIMATION_FRAME_LEDGER_EVENT_OWNER_INVALID", event.type);
    }
    const module = await loadProfileModule();
    const reviewInput = { profile, ...event.payload.reviewInput };
    if (typeof module.assertAnimationProductionReviewIntegrity === "function") {
      await module.assertAnimationProductionReviewIntegrity(
        reviewInput,
        event.payload.decision,
      );
    } else {
      const expected = await module.reviewAnimationProductionProfile(
        reviewInput,
        timestamp(
          event.payload.decision.decidedAt,
          "ANIMATION_FRAME_LEDGER_REVIEW_TIME_INVALID",
        ),
      );
      if (JSON.stringify(expected) !== JSON.stringify(event.payload.decision)) {
        fail("ANIMATION_FRAME_LEDGER_REVIEW_INTEGRITY_MISMATCH");
      }
    }
    return applyReviewEvent(profile, ledger, event);
  }
  fail("ANIMATION_FRAME_LEDGER_EVENT_TYPE_UNKNOWN", String(event.type));
}

export async function assertAnimationFrameWorkLedgerIntegrity(profile, ledger) {
  assertPortableCredentialFree(ledger, "ledger");
  await verifyProfile(profile);
  validateProfileForLedger(profile);
  assertLedgerShape(profile, ledger);
  if (animationFrameLedgerSha256(ledgerBody(ledger)) !== ledger.contentDigest) {
    fail("ANIMATION_FRAME_LEDGER_DIGEST_MISMATCH");
  }
  if (JSON.stringify(ledger.drawingOrder) !== JSON.stringify(profile.drawings.map((d) => d.id))) {
    fail("ANIMATION_FRAME_LEDGER_DRAWING_ORDER_MISMATCH");
  }
  let replayed = initialLedger(
    profile,
    ledger.sessionId,
    timestamp(ledger.createdAt, "ANIMATION_FRAME_LEDGER_CREATED_AT_INVALID"),
  );
  for (const event of ledger.events) {
    replayed = await replayEvent(profile, replayed, event);
  }
  if (JSON.stringify(replayed) !== JSON.stringify(ledger)) {
    fail("ANIMATION_FRAME_LEDGER_REPLAY_MISMATCH");
  }
  return true;
}

export function summarizeAnimationFrameWorkLedger(ledger) {
  object(ledger, "ANIMATION_FRAME_LEDGER_INVALID");
  const byStatus = {};
  for (const state of ledger.drawingStates ?? []) {
    byStatus[state.status] = (byStatus[state.status] ?? 0) + 1;
  }
  const pendingDrawingIds = (ledger.drawingStates ?? [])
    .filter((state) => state.status === "pending")
    .map((state) => state.drawingId);
  const repairDrawingIds = (ledger.drawingStates ?? [])
    .filter((state) => state.status === "repair-required")
    .map((state) => state.drawingId);
  const acceptedDrawingIds = (ledger.drawingStates ?? [])
    .filter((state) => state.status === "accepted")
    .map((state) => state.drawingId);
  const reviewRequiredDrawingIds = (ledger.drawingStates ?? [])
    .filter((state) => state.status === "candidate-ready" || state.status === "review-required")
    .map((state) => state.drawingId);
  let status = "production-required";
  let nextOwnerRole = "art-studio";
  let nextAction = "compile-next-animation-frame-work-batch";
  if (repairDrawingIds.length) {
    status = "repair-required";
    nextAction = "compile-targeted-animation-frame-repair-batch";
  } else if (!pendingDrawingIds.length && reviewRequiredDrawingIds.length) {
    status = "review-required";
    nextOwnerRole = "cel-animation-studio";
    nextAction = "review-complete-moving-animation-sequence";
  } else if (
    acceptedDrawingIds.length === (ledger.drawingStates ?? []).length &&
    ledger.review?.status === "accepted"
  ) {
    status = "accepted";
    nextOwnerRole = "none";
    nextAction = "none";
  }
  return {
    schema: "evavo.animation-frame-work-ledger-summary.v1",
    ledgerId: ledger.ledgerId,
    ledgerDigest: ledger.contentDigest,
    revision: ledger.revision,
    status,
    nextOwnerRole,
    nextAction,
    counts: byStatus,
    pendingDrawingIds,
    repairDrawingIds,
    reviewRequiredDrawingIds,
    acceptedDrawingIds,
    reviewStatus: ledger.review?.status ?? "not-started",
    reviewCycle: ledger.review?.cycle ?? 0,
    authority: AUTHORITY,
  };
}

function safeWorkspacePath(input) {
  const root = process.cwd();
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return absolute;
  fail("ANIMATION_FRAME_LEDGER_PATH_OUTSIDE_WORKSPACE", input);
}

async function emit(value, outputPath) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) process.stdout.write(body);
  else {
    await writeFile(safeWorkspacePath(outputPath), body, {
      encoding: "utf8",
      flag: "wx",
    });
  }
}

async function cli() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (
    !command ||
    !inputPath ||
    ![
      "create",
      "verify",
      "next-work",
      "candidate-receipt",
      "apply-candidates",
      "review",
      "summary",
    ].includes(command)
  ) {
    fail(
      "ANIMATION_FRAME_LEDGER_USAGE",
      "node tools/animation_frame_work_ledger_v1.mjs <create|verify|next-work|candidate-receipt|apply-candidates|review|summary> <input.json> [output.json]",
    );
  }
  const input = JSON.parse(
    await readFile(safeWorkspacePath(inputPath), "utf8"),
  );
  if (command === "create") {
    return emit(await createAnimationFrameWorkLedger(input), outputPath);
  }
  if (command === "verify") {
    await assertAnimationFrameWorkLedgerIntegrity(input.profile, input.ledger);
    return emit(
      {
        status: "verified",
        ledgerId: input.ledger.ledgerId,
        contentDigest: input.ledger.contentDigest,
        revision: input.ledger.revision,
      },
      outputPath,
    );
  }
  if (command === "next-work") {
    return emit(await compileNextAnimationFrameWorkBatch(input), outputPath);
  }
  if (command === "candidate-receipt") {
    return emit(compileAnimationFrameCandidateReceipt(input), outputPath);
  }
  if (command === "apply-candidates") {
    return emit(await applyAnimationFrameCandidateBatch(input), outputPath);
  }
  if (command === "review") {
    return emit(await reviewAnimationFrameWorkLedger(input), outputPath);
  }
  return emit(summarizeAnimationFrameWorkLedger(input.ledger ?? input), outputPath);
}

if ((process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "") === import.meta.url) {
  cli().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        authority: AUTHORITY,
      })}\n`,
    );
    process.exitCode = 1;
  });
}
