import {
  fail,
  freeze,
  idValue,
  record,
  sha256,
} from "./layered-production-internal.js";
import { verifyLayeredProductionPlan } from "./layered-production-plan.js";
import type { CompiledLayeredProductionPlan } from "./layered-production-types.js";
import {
  ART_PRODUCTION_LOOP_KIND,
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
} from "./art-production-orchestrator-types.js";
import type {
  ArtProductionAcceptedCandidate,
  ArtProductionAttemptInput,
  ArtProductionAttemptRecord,
  ArtProductionLoop,
  ArtProductionProfileInput,
} from "./art-production-orchestrator-types.js";
import {
  validateArtProductionProfile,
  verifyArtProductionProfile,
} from "./art-production-profile.js";
import { SHA256_PATTERN } from "./art-production-review-normalization.js";
import {
  buildAttemptRecord,
  replayAttemptInput,
} from "./art-production-loop-attempt.js";
import {
  initialUnitStates,
  loopPayload,
  refreshStatuses,
  withLoopHash,
} from "./art-production-loop-state.js";

export function compileArtProductionLoop(
  plan: CompiledLayeredProductionPlan,
  profileInput: unknown,
): ArtProductionLoop {
  verifyLayeredProductionPlan(plan);
  const profile = validateArtProductionProfile(profileInput, plan);
  return withLoopHash(
    loopPayload(plan, profile, initialUnitStates(plan, profile), []),
  );
}

function applyAttemptInternal(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  input: unknown,
  verifyCurrent: boolean,
): ArtProductionLoop {
  if (verifyCurrent) verifyArtProductionLoop(plan, loop);
  const inputRecord = record(input, "attempt");
  const unitId = idValue(inputRecord.unitId, "attempt.unitId");
  const state = loop.unitStates.find((entry) => entry.unitId === unitId);
  if (!state) {
    fail(
      "ART_PRODUCTION_UNIT_NOT_FOUND",
      `Unknown art-production unit ${unitId}.`,
    );
  }
  if (state.status !== "queued" && state.status !== "repair-required") {
    fail(
      "ART_PRODUCTION_UNIT_NOT_READY",
      `Unit ${unitId} is ${state.status} and cannot accept a candidate attempt.`,
    );
  }
  const unit = plan.layers
    .flatMap((layer) => layer.units)
    .find((entry) => entry.id === unitId);
  if (!unit) {
    fail(
      "ART_PRODUCTION_UNIT_NOT_FOUND",
      `Layered-production unit ${unitId} no longer exists.`,
    );
  }
  const attempt = buildAttemptRecord(plan, loop, state, unit, input);
  const admission = attempt.candidateAdmissionReceipt;
  const acceptedCandidate: ArtProductionAcceptedCandidate | undefined =
    attempt.decision === "review-passed"
      ? freeze({
          ...attempt.candidate,
          admissionReceiptSha256: admission.admissionReceiptSha256,
          scheduledBatchSha256: admission.scheduledJob.batchSha256,
          scheduledJobSha256: admission.scheduledJob.jobSha256,
          providerRequestSha256: admission.providerEvidence.requestSha256,
          providerResponseSha256: admission.providerEvidence.responseSha256,
          inspectionEvidenceSha256: admission.inspectionEvidenceSha256,
          attemptSha256: attempt.attemptSha256,
          weightedScore: attempt.weightedScore,
        })
      : undefined;
  const nextStates = loop.unitStates.map((entry) =>
    entry.unitId === unitId
      ? freeze({
          ...entry,
          status: attempt.decision,
          attemptCount: attempt.attemptNumber,
          latestAttemptSha256: attempt.attemptSha256,
          ...(acceptedCandidate ? { acceptedCandidate } : {}),
        })
      : entry,
  );
  const scope =
    loop.scope === "style-proof"
      ? new Set(plan.styleProof.unitIds)
      : undefined;
  const states = refreshStatuses(nextStates, scope);
  const attempts = freeze([...loop.attempts, attempt]);
  return withLoopHash(loopPayload(plan, loop.profile, states, attempts));
}

export function evaluateArtProductionAttempt(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  input: ArtProductionAttemptInput | unknown,
): ArtProductionLoop {
  return applyAttemptInternal(plan, loop, input, true);
}

function compareAttempt(
  actual: ArtProductionAttemptRecord,
  expected: ArtProductionAttemptRecord,
): void {
  if (actual.attemptSha256 !== expected.attemptSha256) {
    fail(
      "ART_PRODUCTION_LOOP_INVALID",
      "Retained attempt is not the deterministic result of its admitted candidate and measured review evidence.",
      {
        expectedAttemptSha256: expected.attemptSha256,
        actualAttemptSha256: actual.attemptSha256,
      },
    );
  }
}

function profileInputFromLoop(loop: ArtProductionLoop): ArtProductionProfileInput {
  const { profileSha256: _profileSha256, ...profileInput } = loop.profile;
  return profileInput;
}

export function resolveArtProductionLoopRevisionFromVerifiedLoop(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  loopSha256: string,
): ArtProductionLoop {
  if (!SHA256_PATTERN.test(loopSha256)) {
    fail(
      "ART_PRODUCTION_LOOP_INVALID",
      "Requested production-loop revision must be lowercase SHA-256.",
    );
  }
  if (loop.loopSha256 === loopSha256) return loop;

  let replayed = compileArtProductionLoop(plan, profileInputFromLoop(loop));
  if (replayed.loopSha256 === loopSha256) return replayed;

  for (const retainedAttempt of loop.attempts) {
    if (retainedAttempt.priorLoopSha256 !== replayed.loopSha256) {
      fail(
        "ART_PRODUCTION_LOOP_INVALID",
        "Retained attempt history is not contiguous while resolving a scheduled batch revision.",
      );
    }
    const next = applyAttemptInternal(
      plan,
      replayed,
      replayAttemptInput(retainedAttempt),
      false,
    );
    const expectedAttempt = next.attempts.at(-1);
    if (!expectedAttempt) {
      fail(
        "ART_PRODUCTION_LOOP_INVALID",
        "Deterministic replay did not produce an attempt record while resolving a scheduled batch revision.",
      );
    }
    compareAttempt(retainedAttempt, expectedAttempt);
    replayed = next;
    if (replayed.loopSha256 === loopSha256) return replayed;
  }

  fail(
    "ART_PRODUCTION_LOOP_INVALID",
    "Candidate admission is not bound to the current production loop or one of its deterministic ancestor revisions.",
    {
      requestedLoopSha256: loopSha256,
      currentLoopSha256: loop.loopSha256,
    },
  );
}

export function verifyArtProductionLoop(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
): true {
  verifyLayeredProductionPlan(plan);
  if (
    loop.schemaVersion !== "1.0" ||
    loop.kind !== ART_PRODUCTION_LOOP_KIND ||
    loop.protocolVersion !== ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION
  ) {
    fail(
      "ART_PRODUCTION_LOOP_INVALID",
      "Art-production loop protocol identity is invalid.",
    );
  }
  if (loop.planId !== plan.planId || loop.planSha256 !== plan.planSha256) {
    fail(
      "ART_PRODUCTION_LOOP_INVALID",
      "Art-production loop is not bound to the exact layered-production plan.",
    );
  }
  verifyArtProductionProfile(loop.profile, plan);
  if (loop.profileSha256 !== loop.profile.profileSha256) {
    fail(
      "ART_PRODUCTION_LOOP_INVALID",
      "Art-production loop profile identity is inconsistent.",
    );
  }
  const { loopSha256, ...withoutHash } = loop;
  if (
    !SHA256_PATTERN.test(loopSha256) ||
    sha256(withoutHash) !== loopSha256
  ) {
    fail(
      "ART_PRODUCTION_LOOP_INVALID",
      "Art-production loop SHA-256 does not match its canonical payload.",
    );
  }
  let replayed = compileArtProductionLoop(plan, profileInputFromLoop(loop));
  for (const retainedAttempt of loop.attempts) {
    if (retainedAttempt.priorLoopSha256 !== replayed.loopSha256) {
      fail(
        "ART_PRODUCTION_LOOP_INVALID",
        "Retained attempt history is not contiguous.",
      );
    }
    const next = applyAttemptInternal(
      plan,
      replayed,
      replayAttemptInput(retainedAttempt),
      false,
    );
    const expectedAttempt = next.attempts.at(-1);
    if (!expectedAttempt) {
      fail(
        "ART_PRODUCTION_LOOP_INVALID",
        "Deterministic replay did not produce an attempt record.",
      );
    }
    compareAttempt(retainedAttempt, expectedAttempt);
    replayed = next;
  }
  if (replayed.loopSha256 !== loop.loopSha256) {
    fail(
      "ART_PRODUCTION_LOOP_INVALID",
      "Art-production loop is not the deterministic replay of its candidate admission and attempt history.",
      {
        expectedLoopSha256: replayed.loopSha256,
        actualLoopSha256: loop.loopSha256,
      },
    );
  }
  return true;
}

export function verifyArtProductionLoopAgainstProfile(
  plan: CompiledLayeredProductionPlan,
  profileInput: ArtProductionProfileInput | unknown,
  loop: ArtProductionLoop,
): true {
  verifyArtProductionLoop(plan, loop);
  const expected = validateArtProductionProfile(profileInput, plan);
  if (expected.profileSha256 !== loop.profileSha256) {
    fail(
      "ART_PRODUCTION_PROFILE_MISMATCH",
      "Art-production loop is not bound to the exact supplied game profile.",
    );
  }
  return true;
}
