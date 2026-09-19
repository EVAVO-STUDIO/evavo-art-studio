import type {
  CompiledVisualContinuityBible,
  CompiledVisualContinuitySession,
  VisualContinuityAttemptRecord,
  VisualContinuityStudioHandoff,
  VisualContinuityWorkItemState,
  VisualContinuityWorkPacket,
  VisualStudioTarget,
} from "./visual-continuity-types.js";
import {
  arrayValue,
  assertKnownIds,
  assertUnique,
  enumValue,
  exactKeys,
  fail,
  freeze,
  hash,
  identifier,
  isoDateTime,
  optionalText,
  record,
  sha256Value,
  text,
  textArray,
} from "./visual-continuity-internal.js";
import {
  compileVisualContinuitySession as compileVisualContinuitySessionBase,
  rebuildVisualContinuitySession,
  verifyVisualContinuitySession,
} from "./visual-continuity-session.js";
import {
  compileNextVisualContinuityWorkPacket as compileNextVisualContinuityWorkPacketBase,
  evaluateVisualContinuityWorkPacket as evaluateVisualContinuityWorkPacketBase,
  verifyVisualContinuityWorkPacket as verifyVisualContinuityWorkPacketBase,
} from "./visual-continuity-review.js";
import {
  compileVisualContinuityStudioHandoff as compileVisualContinuityStudioHandoffBase,
} from "./visual-continuity-handoff.js";
import { verifyVisualContinuityBible } from "./visual-continuity-bible.js";
import { VISUAL_CONTINUITY_PROTOCOL_VERSION } from "./visual-continuity-types.js";

export const VISUAL_CONTINUITY_APPROVAL_KIND =
  "evavo.visual-continuity.approval" as const;
export const VISUAL_CONTINUITY_APPROVED_HANDOFF_KIND =
  "evavo.visual-continuity.approved-handoff" as const;

export interface VisualContinuityApprovalInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_APPROVAL_KIND;
  readonly workItemId: string;
  readonly candidateSha256: string;
  readonly attemptSha256: string;
  readonly decision: "approved" | "rejected";
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly evidenceSha256: string;
  readonly note: string;
}

export interface VisualContinuityApprovalReceipt
  extends VisualContinuityApprovalInput {
  readonly protocolVersion: typeof VISUAL_CONTINUITY_PROTOCOL_VERSION;
  readonly bibleSha256: string;
  readonly sessionId: string;
  readonly sessionRevision: string;
  readonly contextSha256: string;
  readonly artifactId: string;
  readonly authority: Readonly<{
    readonly decisionRecorded: true;
    readonly providerExecution: false;
    readonly imageMutation: false;
    readonly canonMutation: false;
    readonly repositoryMutation: false;
    readonly publication: false;
  }>;
  readonly approvalSha256: string;
}

export interface ApprovedVisualContinuityStudioHandoff
  extends Omit<VisualContinuityStudioHandoff, "kind" | "handoffSha256"> {
  readonly kind: typeof VISUAL_CONTINUITY_APPROVED_HANDOFF_KIND;
  readonly approvalReceipts: readonly VisualContinuityApprovalReceipt[];
  readonly receiverRoute: Readonly<{
    readonly status: "implemented" | "receiver-validation-required";
    readonly receiverId?: string;
    readonly workerTaskId?: string;
    readonly instruction: string;
  }>;
  readonly releaseStatus: "approved-for-receiver-validation";
  readonly handoffSha256: string;
}

function uniquePreservingOrder(values: readonly string[]): readonly string[] {
  const found = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (found.has(value)) continue;
    found.add(value);
    output.push(value);
  }
  return output;
}

function receiverRoute(target: VisualStudioTarget): ApprovedVisualContinuityStudioHandoff["receiverRoute"] {
  if (target === "3d-studio") {
    return {
      status: "implemented",
      receiverId: "evavo-3d-art-reference-brief",
      workerTaskId: "creative-media-3d-art-reference-brief",
      instruction:
        "Pass the exact handoff file and its file SHA-256 to the 3D Studio receiver. The receiver must independently verify semantic and source-byte hashes before compiling its create-only multi-image brief and receipt.",
    };
  }
  return {
    status: "receiver-validation-required",
    instruction:
      "The receiving studio must verify the handoff SHA-256, every source SHA-256, every approval receipt and all continuity locks before creating derivatives. This handoff does not claim that a receiver or target execution has run.",
  };
}

export function compileVisualContinuitySession(
  bible: CompiledVisualContinuityBible,
  value: unknown,
): CompiledVisualContinuitySession {
  const compiled = compileVisualContinuitySessionBase(bible, value);
  if (compiled.iteration.candidateCountPerAttempt !== 1) {
    fail(
      "VISUAL_CONTINUITY_CANDIDATE_SET_UNSUPPORTED",
      "candidateCountPerAttempt must remain 1 until candidate-set admission, comparison and selection are represented by exact evidence receipts.",
    );
  }
  return compiled;
}

function enrichedJobBrief(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  workItemId: string,
  packet: VisualContinuityWorkPacket,
) {
  const item = session.workItems.find((candidate) => candidate.id === workItemId);
  const job = packet.jobs.find((candidate) => candidate.workItemId === workItemId);
  if (!item || !job) {
    fail("VISUAL_CONTINUITY_REFERENCE_INVALID", `Unknown work item ${workItemId}.`);
  }
  const entities = bible.entities.filter((entity) => item.entityIds.includes(entity.id));
  const locations = bible.locations.filter((location) => item.locationIds.includes(location.id));
  const mapProfiles = bible.mapProfiles.filter((profile) => item.mapProfileIds.includes(profile.id));
  const symbolIds = new Set(mapProfiles.flatMap((profile) => profile.symbolIds));
  const symbols = bible.mapSymbols.filter((symbol) => symbolIds.has(symbol.id));
  const colourById = new Map(bible.colourTokens.map((token) => [token.id, token]));

  const colourRules = bible.colourTokens.flatMap((token) => [
    ...(token.toleranceDeltaE === undefined
      ? []
      : [`${token.id} tolerance: Delta E ${token.toleranceDeltaE}.`]),
    ...(token.reservedFor ?? []).map((usage) => `${token.id} reserved for: ${usage}`),
    ...(token.pairWith ?? []).map((pairedId) => {
      const paired = colourById.get(pairedId);
      return `${token.id} pairs with ${pairedId}${paired ? ` (${paired.hex})` : ""}.`;
    }),
  ]);
  const entityRules = entities.flatMap((entity) => [
    ...entity.materialRules.map((rule) => `Material: ${rule}`),
    ...(entity.costumeOrVariantRules ?? []).map((rule) => `Costume or variant: ${rule}`),
    ...(entity.scale === undefined
      ? []
      : [`Canonical scale: ${entity.scale.value} ${entity.scale.unit}; ${entity.scale.note}`]),
  ]);
  const locationRules = locations.flatMap((location) => [
    ...location.materialRules.map((rule) => `Location material: ${rule}`),
    ...location.weatherRules.map((rule) => `Weather: ${rule}`),
    ...location.timeOfDayRules.map((rule) => `Time of day: ${rule}`),
    ...(location.mapCoordinates === undefined
      ? []
      : [
          `Canonical map coordinate: ${location.mapCoordinates.x}, ${location.mapCoordinates.y} in ${location.mapCoordinates.coordinateSpace}.`,
        ]),
  ]);
  const mapRules = symbols.flatMap((symbol) => [
    `Map symbol ${symbol.id}: ${symbol.meaning}.`,
    ...symbol.shapeRules.map((rule) => `Map symbol ${symbol.id} shape: ${rule}`),
    ...symbol.scaleRules.map((rule) => `Map symbol ${symbol.id} scale: ${rule}`),
    ...symbol.colourTokenIds.map((tokenId) => {
      const token = colourById.get(tokenId);
      return `Map symbol ${symbol.id} colour: ${tokenId}${token ? ` = ${token.hex}` : ""}.`;
    }),
  ]);

  return {
    ...job.brief,
    colourRules: uniquePreservingOrder([...job.brief.colourRules, ...colourRules]),
    entityRules: uniquePreservingOrder([...job.brief.entityRules, ...entityRules]),
    locationRules: uniquePreservingOrder([...job.brief.locationRules, ...locationRules]),
    mapRules: uniquePreservingOrder([...job.brief.mapRules, ...mapRules]),
  };
}

export function compileNextVisualContinuityWorkPacket(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
): VisualContinuityWorkPacket {
  const packet = compileNextVisualContinuityWorkPacketBase(bible, session);
  const jobs = packet.jobs.map((job) => {
    const unsignedJob = {
      ...job,
      brief: enrichedJobBrief(bible, session, job.workItemId, packet),
      jobSha256: undefined,
    };
    const canonicalJob = Object.fromEntries(
      Object.entries(unsignedJob).filter(([key]) => key !== "jobSha256"),
    );
    return freeze({
      ...canonicalJob,
      jobSha256: hash(canonicalJob),
    }) as typeof job;
  });
  const unsigned = {
    ...packet,
    jobs,
    resume: {
      ...packet.resume,
      token: hash({
        bibleSha256: packet.bibleSha256,
        sessionSha256: packet.sessionSha256,
        jobSha256s: jobs.map((job) => job.jobSha256),
      }),
    },
    packetSha256: undefined,
  };
  const canonicalPacket = Object.fromEntries(
    Object.entries(unsigned).filter(([key]) => key !== "packetSha256"),
  );
  return freeze({
    ...canonicalPacket,
    packetSha256: hash(canonicalPacket),
  }) as VisualContinuityWorkPacket;
}

export function verifyVisualContinuityWorkPacket(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  packet: VisualContinuityWorkPacket,
): void {
  verifyVisualContinuityWorkPacketBase(bible, session, packet);
}

export function evaluateVisualContinuityWorkPacket(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  packet: VisualContinuityWorkPacket,
  value: unknown,
): CompiledVisualContinuitySession {
  if (packet.jobs.length !== 1) {
    fail(
      "VISUAL_CONTINUITY_ATOMIC_BATCH_REQUIRED",
      "A multi-job packet must be evaluated atomically with evaluateVisualContinuityWorkPacketBatch so one result cannot stale the remaining jobs.",
    );
  }
  return evaluateVisualContinuityWorkPacketBase(bible, session, packet, value);
}

export function evaluateVisualContinuityWorkPacketBatch(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  packet: VisualContinuityWorkPacket,
  value: unknown,
): CompiledVisualContinuitySession {
  verifyVisualContinuityWorkPacketBase(bible, session, packet);
  if (packet.jobs.length === 0) {
    fail(
      "VISUAL_CONTINUITY_PACKET_EMPTY",
      "A complete or blocked packet has no jobs to evaluate.",
    );
  }
  const submitted = arrayValue(
    value,
    "attempts",
    packet.jobs.length,
    packet.jobs.length,
  );
  const submittedByWorkItem = new Map<string, unknown>();
  for (const [index, rawAttempt] of submitted.entries()) {
    const attempt = record(rawAttempt, `attempts[${index}]`);
    const workItemId = identifier(
      attempt.workItemId,
      `attempts[${index}].workItemId`,
    );
    if (submittedByWorkItem.has(workItemId)) {
      fail(
        "VISUAL_CONTINUITY_DUPLICATE_ID",
        `attempts contains duplicate work item ${workItemId}.`,
      );
    }
    submittedByWorkItem.set(workItemId, rawAttempt);
  }
  const packetIds = packet.jobs.map((job) => job.workItemId);
  assertKnownIds(packetIds, new Set(submittedByWorkItem.keys()), "attempts");
  assertKnownIds(
    [...submittedByWorkItem.keys()],
    new Set(packetIds),
    "attempts",
  );

  const evaluated = packet.jobs.map((job) => {
    const rawAttempt = submittedByWorkItem.get(job.workItemId);
    if (rawAttempt === undefined) {
      fail(
        "VISUAL_CONTINUITY_REFERENCE_INVALID",
        `Missing attempt for packet job ${job.workItemId}.`,
      );
    }
    const result = evaluateVisualContinuityWorkPacketBase(
      bible,
      session,
      packet,
      rawAttempt,
    );
    const state = result.states.find((candidate) => candidate.id === job.workItemId);
    const attempt = result.attempts[result.attempts.length - 1];
    if (!state || !attempt) {
      fail(
        "VISUAL_CONTINUITY_STATE_INVALID",
        `Evaluation for ${job.workItemId} did not produce a state and attempt.`,
      );
    }
    return { state, attempt };
  });

  const stateById = new Map(
    evaluated.map((entry) => [entry.state.id, entry.state] as const),
  );
  const states: readonly VisualContinuityWorkItemState[] = session.states.map(
    (state) => stateById.get(state.id) ?? state,
  );
  const attempts: readonly VisualContinuityAttemptRecord[] = [
    ...session.attempts,
    ...evaluated.map((entry) => entry.attempt),
  ];
  const {
    sessionSha256: _sessionSha256,
    totals: _totals,
    ...sessionWithoutDigest
  } = session;
  const rebuilt = rebuildVisualContinuitySession({
    ...sessionWithoutDigest,
    states,
    attempts,
  });
  verifyVisualContinuitySession(bible, rebuilt);
  return rebuilt;
}

export function compileVisualContinuityApprovalReceipt(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  value: unknown,
): VisualContinuityApprovalReceipt {
  verifyVisualContinuityBible(bible);
  verifyVisualContinuitySession(bible, session);
  const input = record(value, "approval");
  exactKeys(input, "approval", [
    "schemaVersion",
    "kind",
    "workItemId",
    "candidateSha256",
    "attemptSha256",
    "decision",
    "reviewer",
    "reviewedAt",
    "evidenceSha256",
    "note",
  ]);
  if (input.schemaVersion !== "1.0") {
    fail(
      "VISUAL_CONTINUITY_VERSION_UNSUPPORTED",
      "approval.schemaVersion must be 1.0.",
    );
  }
  if (input.kind !== VISUAL_CONTINUITY_APPROVAL_KIND) {
    fail(
      "VISUAL_CONTINUITY_KIND_INVALID",
      `approval.kind must be ${VISUAL_CONTINUITY_APPROVAL_KIND}.`,
    );
  }
  const workItemId = identifier(input.workItemId, "approval.workItemId");
  const item = session.workItems.find((candidate) => candidate.id === workItemId);
  const state = session.states.find((candidate) => candidate.id === workItemId);
  if (!item || state?.status !== "accepted" || !state.acceptedCandidate) {
    fail(
      "VISUAL_CONTINUITY_APPROVAL_NOT_READY",
      `Work item ${workItemId} must pass technical continuity review before a creative decision is recorded.`,
    );
  }
  const candidateSha256 = sha256Value(
    input.candidateSha256,
    "approval.candidateSha256",
  );
  const attemptSha256 = sha256Value(
    input.attemptSha256,
    "approval.attemptSha256",
  );
  if (
    candidateSha256 !== state.acceptedCandidate.sha256 ||
    attemptSha256 !== state.acceptedCandidate.attemptSha256
  ) {
    fail(
      "VISUAL_CONTINUITY_APPROVAL_CANDIDATE_MISMATCH",
      `Approval for ${workItemId} is not bound to its accepted technical-review candidate.`,
    );
  }
  const unsigned = {
    schemaVersion: "1.0" as const,
    kind: VISUAL_CONTINUITY_APPROVAL_KIND,
    protocolVersion: VISUAL_CONTINUITY_PROTOCOL_VERSION,
    bibleSha256: bible.bibleSha256,
    sessionId: session.sessionId,
    sessionRevision: session.revision,
    workItemId,
    contextSha256: item.contextSha256,
    artifactId: state.acceptedCandidate.artifactId,
    candidateSha256,
    attemptSha256,
    decision: enumValue(
      input.decision,
      "approval.decision",
      ["approved", "rejected"] as const,
    ),
    reviewer: text(input.reviewer, "approval.reviewer", 300),
    reviewedAt: isoDateTime(input.reviewedAt, "approval.reviewedAt"),
    evidenceSha256: sha256Value(
      input.evidenceSha256,
      "approval.evidenceSha256",
    ),
    note: text(input.note, "approval.note", 4000),
    authority: {
      decisionRecorded: true as const,
      providerExecution: false as const,
      imageMutation: false as const,
      canonMutation: false as const,
      repositoryMutation: false as const,
      publication: false as const,
    },
  };
  return freeze({
    ...unsigned,
    approvalSha256: hash(unsigned),
  });
}

export function verifyVisualContinuityApprovalReceipt(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  receipt: VisualContinuityApprovalReceipt,
): void {
  const compiled = compileVisualContinuityApprovalReceipt(bible, session, {
    schemaVersion: receipt.schemaVersion,
    kind: receipt.kind,
    workItemId: receipt.workItemId,
    candidateSha256: receipt.candidateSha256,
    attemptSha256: receipt.attemptSha256,
    decision: receipt.decision,
    reviewer: receipt.reviewer,
    reviewedAt: receipt.reviewedAt,
    evidenceSha256: receipt.evidenceSha256,
    note: receipt.note,
  });
  if (compiled.approvalSha256 !== receipt.approvalSha256) {
    fail(
      "VISUAL_CONTINUITY_APPROVAL_HASH_MISMATCH",
      `Approval receipt ${receipt.workItemId} failed deterministic verification.`,
    );
  }
}

export function compileApprovedVisualContinuityStudioHandoff(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  value: unknown,
): ApprovedVisualContinuityStudioHandoff {
  const input = record(value, "approvedHandoff");
  exactKeys(input, "approvedHandoff", [
    "schemaVersion",
    "targetStudio",
    "receiverProjectId",
    "purpose",
    "workItemIds",
    "requestedOutputs",
    "notes",
    "approvalReceipts",
  ]);
  const receipts = arrayValue(
    input.approvalReceipts,
    "approvedHandoff.approvalReceipts",
    1,
    10_000,
  ) as readonly VisualContinuityApprovalReceipt[];
  receipts.forEach((receipt) =>
    verifyVisualContinuityApprovalReceipt(bible, session, receipt),
  );
  assertUnique(receipts, "approvedHandoff.approvalReceipts", (receipt) =>
    receipt.workItemId,
  );
  const base = compileVisualContinuityStudioHandoffBase(bible, session, {
    schemaVersion: input.schemaVersion,
    targetStudio: input.targetStudio,
    receiverProjectId: input.receiverProjectId,
    purpose: input.purpose,
    workItemIds: input.workItemIds,
    requestedOutputs: input.requestedOutputs,
    ...(input.notes === undefined
      ? {}
      : { notes: textArray(input.notes, "approvedHandoff.notes", 0, 256) }),
  });
  const sourceIds = base.sources.map((source) => source.workItemId);
  const receiptIds = receipts.map((receipt) => receipt.workItemId);
  assertKnownIds(sourceIds, new Set(receiptIds), "approvedHandoff.approvalReceipts");
  assertKnownIds(receiptIds, new Set(sourceIds), "approvedHandoff.approvalReceipts");
  for (const receipt of receipts) {
    if (receipt.decision !== "approved") {
      fail(
        "VISUAL_CONTINUITY_HANDOFF_NOT_APPROVED",
        `Work item ${receipt.workItemId} has a rejected creative decision.`,
      );
    }
    const source = base.sources.find(
      (candidate) => candidate.workItemId === receipt.workItemId,
    );
    if (!source || source.sha256 !== receipt.candidateSha256) {
      fail(
        "VISUAL_CONTINUITY_APPROVAL_CANDIDATE_MISMATCH",
        `Approval receipt for ${receipt.workItemId} does not match the handoff source.`,
      );
    }
  }
  const { handoffSha256: _baseHandoffSha256, ...baseWithoutDigest } = base;
  const sortedReceipts = [...receipts].sort((left, right) =>
    left.workItemId.localeCompare(right.workItemId),
  );
  const unsigned = {
    ...baseWithoutDigest,
    kind: VISUAL_CONTINUITY_APPROVED_HANDOFF_KIND,
    approvalReceipts: sortedReceipts,
    receiverRoute: receiverRoute(base.targetStudio),
    releaseStatus: "approved-for-receiver-validation" as const,
  };
  return freeze({
    ...unsigned,
    handoffSha256: hash(unsigned),
  });
}

export function verifyApprovedVisualContinuityStudioHandoff(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  handoff: ApprovedVisualContinuityStudioHandoff,
): void {
  verifyVisualContinuitySession(bible, session);
  if (
    handoff.protocolVersion !== VISUAL_CONTINUITY_PROTOCOL_VERSION ||
    handoff.bibleSha256 !== bible.bibleSha256 ||
    handoff.sessionSha256 !== session.sessionSha256 ||
    handoff.kind !== VISUAL_CONTINUITY_APPROVED_HANDOFF_KIND
  ) {
    fail(
      "VISUAL_CONTINUITY_HANDOFF_STALE",
      "The approved handoff is not bound to the supplied bible and current session.",
    );
  }
  handoff.approvalReceipts.forEach((receipt) =>
    verifyVisualContinuityApprovalReceipt(bible, session, receipt),
  );
  assertUnique(
    handoff.approvalReceipts,
    "handoff.approvalReceipts",
    (receipt) => receipt.workItemId,
  );
  const sourceIds = handoff.sources.map((source) => source.workItemId);
  const receiptIds = handoff.approvalReceipts.map((receipt) => receipt.workItemId);
  assertKnownIds(sourceIds, new Set(receiptIds), "handoff.approvalReceipts");
  assertKnownIds(receiptIds, new Set(sourceIds), "handoff.approvalReceipts");
  for (const receipt of handoff.approvalReceipts) {
    const source = handoff.sources.find(
      (candidate) => candidate.workItemId === receipt.workItemId,
    );
    if (
      receipt.decision !== "approved" ||
      !source ||
      source.sha256 !== receipt.candidateSha256
    ) {
      fail(
        "VISUAL_CONTINUITY_HANDOFF_NOT_APPROVED",
        `Handoff source ${receipt.workItemId} lacks a matching approved receipt.`,
      );
    }
  }
  if (hash(handoff.receiverRoute) !== hash(receiverRoute(handoff.targetStudio))) {
    fail(
      "VISUAL_CONTINUITY_RECEIVER_ROUTE_MISMATCH",
      "The approved handoff receiver route is not canonical.",
    );
  }
  const { handoffSha256, ...unsigned } = handoff;
  if (handoffSha256 !== hash(unsigned)) {
    fail(
      "VISUAL_CONTINUITY_HANDOFF_HASH_MISMATCH",
      "The approved continuity handoff failed deterministic hash verification.",
    );
  }
}

export function visualContinuityHardeningSummary() {
  return freeze({
    schemaVersion: "1.0" as const,
    protocolVersion: VISUAL_CONTINUITY_PROTOCOL_VERSION,
    guarantees: [
      "candidateCountPerAttempt is fail-closed at one until candidate-set evidence exists",
      "multi-job packets are evaluated atomically so one result cannot stale unfinished jobs",
      "map symbol shape, scale and colour rules are restated in every relevant packet",
      "entity materials, variants and scale plus location materials, weather and time are explicit",
      "creative approval is a separate named-human receipt bound to the accepted candidate and attempt",
      "release-grade handoff requires one approved receipt per source and still requires receiver verification",
      "implemented downstream receivers are distinguished from contract-only routes",
    ] as const,
    boundaries: {
      providerExecution: false as const,
      imageMutation: false as const,
      automaticCreativeApproval: false as const,
      canonMutation: false as const,
      repositoryMutation: false as const,
      runtimeActivation: false as const,
      publication: false as const,
    },
  });
}
