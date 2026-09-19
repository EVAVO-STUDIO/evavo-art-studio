import {
  VISUAL_CONTINUITY_ATTEMPT_KIND,
  VISUAL_CONTINUITY_DETECTIONS,
  VISUAL_CONTINUITY_METRIC_IDS,
  VISUAL_CONTINUITY_PACKET_KIND,
  VISUAL_CONTINUITY_PROTOCOL_VERSION,
} from "./visual-continuity-types.js";
import type {
  CompiledVisualContinuityBible,
  CompiledVisualContinuitySession,
  VisualContinuityAttemptRecord,
  VisualContinuityDetection,
  VisualContinuityDetectionEvidence,
  VisualContinuityMetricEvidence,
  VisualContinuityMetricId,
  VisualContinuityPacketJob,
  VisualContinuityWorkItemState,
  VisualContinuityWorkPacket,
} from "./visual-continuity-types.js";
import {
  arrayValue,
  assertKnownIds,
  assertUnique,
  enumValue,
  exactKeys,
  fail,
  finiteNumber,
  freeze,
  hash,
  identifier,
  isoDateTime,
  record,
  sha256Value,
  text,
} from "./visual-continuity-internal.js";
import {
  rebuildVisualContinuitySession,
  verifyVisualContinuitySession,
} from "./visual-continuity-session.js";

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function latestAttemptFor(
  session: CompiledVisualContinuitySession,
  workItemId: string,
): VisualContinuityAttemptRecord | undefined {
  return [...session.attempts]
    .filter((attempt) => attempt.workItemId === workItemId)
    .sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
}

function workItemContext(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  workItemId: string,
): VisualContinuityPacketJob["brief"] {
  const item = session.workItems.find((candidate) => candidate.id === workItemId);
  if (!item) fail("VISUAL_CONTINUITY_REFERENCE_INVALID", `Unknown work item ${workItemId}.`);
  const entities = bible.entities.filter((entity) => item.entityIds.includes(entity.id));
  const locations = bible.locations.filter((location) => item.locationIds.includes(location.id));
  const mapProfiles = bible.mapProfiles.filter((profile) => item.mapProfileIds.includes(profile.id));
  const shot = item.shotTemplateId === undefined
    ? undefined
    : bible.shotTemplates.find((candidate) => candidate.id === item.shotTemplateId);
  const locks = bible.locks.filter((lock) => item.lockIds.includes(lock.id));
  const colours = bible.colourTokens.filter((token) => {
    const explicitIds = new Set([
      ...entities.flatMap((entity) => entity.colourTokenIds),
      ...locations.flatMap((location) => location.colourTokenIds),
      ...mapProfiles.flatMap((profile) => profile.colourTokenIds),
    ]);
    return explicitIds.size === 0 || explicitIds.has(token.id);
  });
  const previous = latestAttemptFor(session, workItemId);
  return {
    purpose: item.purpose,
    preserve: item.preserve,
    mayChange: item.mayChange,
    mustNotIntroduce: item.mustNotIntroduce,
    styleRules: [
      bible.style.intent,
      ...bible.style.renderingLanguage,
      ...bible.style.lineLanguage,
      ...bible.style.valueStructure,
      ...bible.style.materialLanguage,
      ...bible.style.lightingLanguage,
      ...bible.style.compositionLanguage,
      ...bible.style.distinctiveMotifs.map((motif) => `Preserve distinctive motif: ${motif}`),
      ...bible.style.prohibitedGenericTraits.map((trait) => `Do not use generic treatment: ${trait}`),
      ...bible.style.prohibitedModernTraits.map((trait) => `Do not introduce modern trait: ${trait}`),
    ],
    colourRules: colours.flatMap((token) => [
      `${token.id} = ${token.hex}; ${token.role}`,
      ...token.usage.map((usage) => `${token.id} usage: ${usage}`),
      ...(token.prohibitedFor ?? []).map((usage) => `${token.id} prohibited for: ${usage}`),
    ]),
    entityRules: entities.flatMap((entity) => [
      `${entity.name}: ${entity.canonicalDescription}`,
      ...entity.distinctiveFeatures.map((rule) => `Distinctive feature: ${rule}`),
      ...entity.silhouetteRules.map((rule) => `Silhouette: ${rule}`),
      ...entity.proportionRules.map((rule) => `Proportion: ${rule}`),
      ...(entity.asymmetryRules ?? []).map((rule) => `Asymmetry: ${rule}`),
      ...entity.forbiddenMutations.map((rule) => `Forbidden mutation: ${rule}`),
    ]),
    locationRules: locations.flatMap((location) => [
      `${location.name}: ${location.canonicalDescription}`,
      ...location.geographyRules.map((rule) => `Geography: ${rule}`),
      ...location.architectureRules.map((rule) => `Architecture: ${rule}`),
      ...location.landmarkRules.map((rule) => `Landmark: ${rule}`),
      ...location.forbiddenMutations.map((rule) => `Forbidden mutation: ${rule}`),
    ]),
    mapRules: mapProfiles.flatMap((profile) => [
      `${profile.title}: ${profile.projection}; ${profile.orientation}; ${profile.coordinateSpace}`,
      `Scale policy: ${profile.scalePolicy}`,
      ...profile.terrainLayers.map((rule) => `Terrain layer: ${rule}`),
      ...profile.routeGrammar.map((rule) => `Route grammar: ${rule}`),
      ...profile.labelGrammar.map((rule) => `Label grammar: ${rule}`),
      ...profile.safeAreaRules.map((rule) => `Safe area: ${rule}`),
    ]),
    shotRules: shot === undefined
      ? []
      : [
          `Shot template ${shot.title}; aspect ratio ${shot.aspectRatio}.`,
          `Camera: ${shot.camera.projection}; ${shot.camera.lensOrScale}; ${shot.camera.height}; ${shot.camera.angle}; movement ${shot.camera.movement}.`,
          ...shot.compositionRules,
          ...shot.lightingRules,
          ...shot.safeAreaRules,
        ],
    lockRules: locks.flatMap((lock) => [
      `${lock.severity.toUpperCase()} ${lock.kind}: ${lock.description}`,
      ...(lock.mustNotVary ?? []).map((rule) => `Must not vary: ${rule}`),
      ...(lock.mayVary ?? []).map((rule) => `May vary: ${rule}`),
    ]),
    repairDirectives: previous?.decision === "repair-required"
      ? previous.repairDirectives
      : [],
  };
}

function sequenceContext(
  session: CompiledVisualContinuitySession,
  workItemId: string,
): VisualContinuityPacketJob["sequenceContext"] {
  const item = session.workItems.find((candidate) => candidate.id === workItemId);
  if (!item?.sequence) return undefined;
  const acceptedSha = (neighborId: string | undefined): string | undefined => {
    if (neighborId === undefined) return undefined;
    return session.states.find((state) => state.id === neighborId)?.acceptedCandidate?.sha256;
  };
  const previousAcceptedSha256 = acceptedSha(item.sequence.previousWorkItemId);
  const nextAcceptedSha256 = acceptedSha(item.sequence.nextWorkItemId);
  return {
    ...item.sequence,
    ...(previousAcceptedSha256 === undefined ? {} : { previousAcceptedSha256 }),
    ...(nextAcceptedSha256 === undefined ? {} : { nextAcceptedSha256 }),
  };
}

function readyStates(
  session: CompiledVisualContinuitySession,
): readonly VisualContinuityWorkItemState[] {
  const stateById = new Map(session.states.map((state) => [state.id, state]));
  const ready = (state: VisualContinuityWorkItemState): boolean => {
    if (state.status !== "queued" && state.status !== "repair-required") return false;
    const item = session.workItems.find((candidate) => candidate.id === state.id);
    return (item?.dependsOn ?? []).every(
      (dependency) => stateById.get(dependency)?.status === "accepted",
    );
  };
  const repair = session.states.filter(
    (state) => state.status === "repair-required" && ready(state),
  );
  const queued = session.states.filter(
    (state) => state.status === "queued" && ready(state),
  );
  return [...repair, ...queued].slice(0, session.iteration.maximumBatchSize);
}

export function compileNextVisualContinuityWorkPacket(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
): VisualContinuityWorkPacket {
  verifyVisualContinuitySession(bible, session);
  const states = readyStates(session);
  const jobs = states.map((state) => {
    const item = session.workItems.find((candidate) => candidate.id === state.id);
    if (!item) fail("VISUAL_CONTINUITY_STATE_INVALID", `Missing work item ${state.id}.`);
    const references = bible.references
      .filter((reference) => item.referenceIds.includes(reference.id))
      .map((reference) => ({
        id: reference.id,
        role: reference.role,
        uri: reference.uri,
        sha256: reference.sha256,
        required: reference.role !== "negative-reference",
      }));
    const sequence = sequenceContext(session, item.id);
    const unsignedJob = {
      workItemId: item.id,
      attemptNumber: state.attemptCount + 1,
      mode: state.status === "repair-required" ? "repair" as const : "generate" as const,
      targetStudio: item.targetStudio,
      assetType: item.assetType,
      brief: workItemContext(bible, session, item.id),
      output: item.output,
      references,
      ...(sequence === undefined ? {} : { sequenceContext: sequence }),
      requiredMetricIds: item.requiredMetricIds,
      blockingDetections: item.blockingDetections,
      contextSha256: item.contextSha256,
    };
    return freeze({ ...unsignedJob, jobSha256: hash(unsignedJob) });
  });
  const status = jobs.length > 0
    ? "jobs-ready" as const
    : session.totals.blocked > 0
      ? "blocked" as const
      : "complete" as const;
  const unsigned = {
    schemaVersion: "1.0" as const,
    kind: VISUAL_CONTINUITY_PACKET_KIND,
    protocolVersion: VISUAL_CONTINUITY_PROTOCOL_VERSION,
    bibleSha256: bible.bibleSha256,
    sessionSha256: session.sessionSha256,
    status,
    jobs,
    resume: {
      token: hash({
        bibleSha256: bible.bibleSha256,
        sessionSha256: session.sessionSha256,
        jobSha256s: jobs.map((job) => job.jobSha256),
      }),
      instruction:
        "Resume from these hashes, not chat memory. Read the exact bible and session, complete only listed jobs, return evidence, then evaluate before requesting another packet.",
    },
    authority: {
      providerExecution: false as const,
      imageMutation: false as const,
      creativeApproval: false as const,
      canonMutation: false as const,
      targetRepositoryMutation: false as const,
    },
  };
  return freeze({ ...unsigned, packetSha256: hash(unsigned) });
}

export function verifyVisualContinuityWorkPacket(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  packet: VisualContinuityWorkPacket,
): void {
  verifyVisualContinuitySession(bible, session);
  if (
    packet.protocolVersion !== VISUAL_CONTINUITY_PROTOCOL_VERSION ||
    packet.kind !== VISUAL_CONTINUITY_PACKET_KIND ||
    packet.bibleSha256 !== bible.bibleSha256 ||
    packet.sessionSha256 !== session.sessionSha256
  ) {
    fail(
      "VISUAL_CONTINUITY_PACKET_STALE",
      "The work packet is not bound to the supplied bible and current session.",
    );
  }
  assertUnique(packet.jobs, "packet.jobs", (job) => job.workItemId);
  for (const job of packet.jobs) {
    const { jobSha256, ...unsignedJob } = job;
    if (jobSha256 !== hash(unsignedJob)) {
      fail(
        "VISUAL_CONTINUITY_PACKET_HASH_MISMATCH",
        `Work packet job ${job.workItemId} failed hash verification.`,
      );
    }
    const item = session.workItems.find((candidate) => candidate.id === job.workItemId);
    if (!item || item.contextSha256 !== job.contextSha256) {
      fail(
        "VISUAL_CONTINUITY_CONTEXT_HASH_MISMATCH",
        `Work packet job ${job.workItemId} has stale continuity context.`,
      );
    }
  }
  const { packetSha256, ...unsigned } = packet;
  if (packetSha256 !== hash(unsigned)) {
    fail(
      "VISUAL_CONTINUITY_PACKET_HASH_MISMATCH",
      "The visual continuity packet failed deterministic hash verification.",
    );
  }
}

function normalizeMetric(
  value: unknown,
  index: number,
): VisualContinuityMetricEvidence {
  const label = `attempt.metrics[${index}]`;
  const input = record(value, label);
  exactKeys(input, label, ["metricId", "score", "evidenceSha256", "note"]);
  const note = input.note === undefined ? undefined : text(input.note, `${label}.note`, 2000);
  return {
    metricId: enumValue(input.metricId, `${label}.metricId`, VISUAL_CONTINUITY_METRIC_IDS),
    score: finiteNumber(input.score, `${label}.score`, 0, 1),
    evidenceSha256: sha256Value(input.evidenceSha256, `${label}.evidenceSha256`),
    ...(note === undefined ? {} : { note }),
  };
}

function normalizeDetection(
  value: unknown,
  index: number,
): VisualContinuityDetectionEvidence {
  const label = `attempt.detections[${index}]`;
  const input = record(value, label);
  exactKeys(input, label, ["detection", "evidenceSha256", "note"]);
  const note = input.note === undefined ? undefined : text(input.note, `${label}.note`, 2000);
  return {
    detection: enumValue(input.detection, `${label}.detection`, VISUAL_CONTINUITY_DETECTIONS),
    evidenceSha256: sha256Value(input.evidenceSha256, `${label}.evidenceSha256`),
    ...(note === undefined ? {} : { note }),
  };
}

function repairDirectiveForMetric(metric: VisualContinuityMetricId): string {
  const directives: Record<VisualContinuityMetricId, string> = {
    identity: "Restore canonical identity from the named identity masters; do not redesign the subject.",
    style: "Return to the approved rendering, line, value and material language; remove stylistic averaging.",
    palette: "Use the bound colour tokens and tolerances; remove unapproved colours and palette drift.",
    silhouette: "Restore the approved silhouette and negative-space landmarks at actual runtime scale.",
    proportions: "Restore canonical construction ratios and anatomy landmarks before adding surface detail.",
    camera: "Restore the exact approved projection, angle, lens or orthographic scale and framing.",
    composition: "Restore the selected shot template and safe areas without adding decorative clutter.",
    lighting: "Restore the approved key direction, value grouping and time-of-day logic.",
    material: "Restore the approved material response and texture density; remove generic glossy treatment.",
    geography: "Restore canonical geography, landmark placement and route relationships.",
    architecture: "Restore the approved architectural construction, era and location-specific details.",
    typography: "Restore the approved label and typography grammar; do not accept corrupted generated text.",
    "map-grammar": "Restore map projection, symbols, scale, terrain layers, routes, labels and safe areas.",
    anchor: "Restore canvas, pivot, baseline and ground-contact anchors from adjacent approved work.",
    temporal: "Repair pose progression and timing so motion advances rather than flickers or freezes.",
    "neighbor-continuity": "Compare against immediate approved neighbours and repair only the discontinuous regions.",
    "loop-closure": "Repair final-to-first continuity while preserving the intended action arc.",
    "non-generic": "Remove stock generative motifs and restore the project-specific distinctive motifs.",
    "output-readiness": "Repair dimensions, alpha, crop, format and delivery constraints without altering canon.",
  };
  return directives[metric];
}

function repairDirectiveForDetection(detection: VisualContinuityDetection): string {
  return `Eliminate blocking detection ${detection} while preserving every unaffected continuity lock.`;
}

export function evaluateVisualContinuityWorkPacket(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  packet: VisualContinuityWorkPacket,
  value: unknown,
): CompiledVisualContinuitySession {
  verifyVisualContinuityWorkPacket(bible, session, packet);
  const input = record(value, "attempt");
  exactKeys(input, "attempt", [
    "schemaVersion",
    "packetSha256",
    "workItemId",
    "reviewer",
    "reviewedAt",
    "candidate",
    "metrics",
    "detections",
  ]);
  if (input.schemaVersion !== "1.0") {
    fail("VISUAL_CONTINUITY_VERSION_UNSUPPORTED", "attempt.schemaVersion must be 1.0.");
  }
  const packetSha256 = sha256Value(input.packetSha256, "attempt.packetSha256");
  if (packetSha256 !== packet.packetSha256) {
    fail("VISUAL_CONTINUITY_PACKET_STALE", "The attempt is bound to a different work packet.");
  }
  const workItemId = identifier(input.workItemId, "attempt.workItemId");
  const job = packet.jobs.find((candidate) => candidate.workItemId === workItemId);
  if (!job) {
    fail("VISUAL_CONTINUITY_REFERENCE_INVALID", `Packet has no job for ${workItemId}.`);
  }
  const candidateInput = record(input.candidate, "attempt.candidate");
  exactKeys(candidateInput, "attempt.candidate", ["artifactId", "uri", "sha256"]);
  const candidate = {
    artifactId: identifier(candidateInput.artifactId, "attempt.candidate.artifactId"),
    uri: text(candidateInput.uri, "attempt.candidate.uri", 2048),
    sha256: sha256Value(candidateInput.sha256, "attempt.candidate.sha256"),
  };
  if (
    session.attempts.some(
      (attempt) => attempt.workItemId === workItemId && attempt.candidate.sha256 === candidate.sha256,
    )
  ) {
    fail(
      "VISUAL_CONTINUITY_CANDIDATE_REUSED",
      `Candidate ${candidate.sha256} has already been evaluated for ${workItemId}.`,
    );
  }
  const metrics = arrayValue(input.metrics, "attempt.metrics", 1, 128).map(normalizeMetric);
  const detections = arrayValue(input.detections, "attempt.detections", 0, 128).map(normalizeDetection);
  assertUnique(metrics, "attempt.metrics", (metric) => metric.metricId);
  assertUnique(detections, "attempt.detections", (detection) => detection.detection);
  const metricIds = new Set(metrics.map((metric) => metric.metricId));
  assertKnownIds(
    job.requiredMetricIds,
    metricIds,
    `attempt.metrics required for ${workItemId}`,
  );
  const metricMap = new Map(metrics.map((metric) => [metric.metricId, metric]));
  const failedMetricIds = job.requiredMetricIds.filter((metricId) => {
    const threshold = bible.quality.minimumMetricScores[metricId] ?? 0.8;
    return (metricMap.get(metricId)?.score ?? -1) < threshold;
  });
  const weightedScore = job.requiredMetricIds.reduce(
    (sum, metricId) => sum + (metricMap.get(metricId)?.score ?? 0),
    0,
  ) / job.requiredMetricIds.length;
  const blockingSet = new Set(job.blockingDetections);
  const blockingDetections = detections
    .map((detection) => detection.detection)
    .filter((detection) => blockingSet.has(detection));
  const state = session.states.find((candidateState) => candidateState.id === workItemId);
  if (!state) fail("VISUAL_CONTINUITY_STATE_INVALID", `Missing state for ${workItemId}.`);
  if (state.attemptCount + 1 !== job.attemptNumber) {
    fail("VISUAL_CONTINUITY_PACKET_STALE", `Attempt number for ${workItemId} is stale.`);
  }
  const technicalFailure = weightedScore < bible.quality.technicalPassScore;
  const passed = failedMetricIds.length === 0 && blockingDetections.length === 0 && !technicalFailure;
  const exhausted = job.attemptNumber >= session.iteration.maximumAttemptsPerItem;
  const decision = passed
    ? "accepted" as const
    : exhausted
      ? "blocked" as const
      : "repair-required" as const;
  const repairDirectives = uniqueSorted([
    ...failedMetricIds.map(repairDirectiveForMetric),
    ...blockingDetections.map(repairDirectiveForDetection),
    ...(technicalFailure
      ? [
          `Raise the measured continuity score from ${weightedScore.toFixed(4)} to at least ${bible.quality.technicalPassScore.toFixed(4)} without weakening any gate.`,
        ]
      : []),
  ]);
  const nextPromptPatch = decision === "repair-required"
    ? [
        "Edit only the failed or detected regions.",
        "Keep canonical references, palette tokens, camera, canvas and unaffected details unchanged.",
        ...repairDirectives,
        "Return one bounded candidate and new independent evidence for every required metric.",
      ]
    : [];
  const unsignedAttempt = {
    schemaVersion: "1.0" as const,
    kind: VISUAL_CONTINUITY_ATTEMPT_KIND,
    sessionSha256Before: session.sessionSha256,
    packetSha256,
    workItemId,
    attemptNumber: job.attemptNumber,
    candidate,
    reviewer: text(input.reviewer, "attempt.reviewer", 300),
    reviewedAt: isoDateTime(input.reviewedAt, "attempt.reviewedAt"),
    metrics,
    detections,
    weightedScore,
    failedMetricIds,
    decision,
    repairDirectives,
    nextPromptPatch,
  };
  const attempt = freeze({
    ...unsignedAttempt,
    attemptSha256: hash(unsignedAttempt),
  });
  const states = session.states.map((currentState) => {
    if (currentState.id !== workItemId) return currentState;
    const base = {
      id: currentState.id,
      status: decision === "accepted"
        ? "accepted" as const
        : decision === "blocked"
          ? "blocked" as const
          : "repair-required" as const,
      attemptCount: job.attemptNumber,
      latestAttemptSha256: attempt.attemptSha256,
    };
    return decision === "accepted"
      ? {
          ...base,
          acceptedCandidate: {
            ...candidate,
            attemptSha256: attempt.attemptSha256,
            weightedScore,
            acceptedAt: attempt.reviewedAt,
            acceptedBy: attempt.reviewer,
          },
        }
      : base;
  });
  const { sessionSha256: _sessionSha256, totals: _totals, ...sessionWithoutDigest } = session;
  return rebuildVisualContinuitySession({
    ...sessionWithoutDigest,
    states,
    attempts: [...session.attempts, attempt],
  });
}
