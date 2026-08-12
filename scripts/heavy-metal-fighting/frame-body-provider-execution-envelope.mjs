import { createHash } from "node:crypto";

import {
  buildHmfBodyChoreographyOverlayBatch,
  heavyMetalFightingBodyChoreographyOverlay,
} from "./frame-body-choreography-overlay.mjs";
import {
  buildHmfProductionWorkOrderBatch,
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";

export const HMF_PROVIDER_EXECUTION_ENVELOPE_SCHEMA = "evavo.heavy-metal-fighting-provider-execution-envelope.v1";
export const HMF_PROVIDER_EXECUTION_ENVELOPE_BATCH_SCHEMA = "evavo.heavy-metal-fighting-provider-execution-envelope-batch.v1";
export const HMF_PROVIDER_EXECUTION_ENVELOPE_PROTOCOL_VERSION = "2026-08-13.1";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ARTIFACT_ID_PATTERN = /^artifact_[0-9a-f]{64}$/u;
const REFERENCE_ROLE_BY_BINDING = Object.freeze({
  styleNorthStar: "direction-master",
  stylePalette: "palette-reference",
  styleMaterials: "material-reference",
  styleLighting: "direction-master",
  pixelGrammar: "line-reference",
  antiGeneric: "direction-master",
  frameConstruction: "canonical-identity",
  frameLandmarks: "pose-control",
  frameHardpoints: "edge-control",
  framePalette: "palette-reference",
  previousCel: "previous-key-pose",
  nextCel: "next-key-pose",
});

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_PROVIDER_EXECUTION_ENVELOPE_INVALID: ${message}`);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  }
  return value;
}
function canonicalJson(value) {
  return `${JSON.stringify(sortObject(value), null, 2)}\n`;
}
function sha256(value) {
  const bytes = typeof value === "string" ? value : canonicalJson(value);
  return createHash("sha256").update(bytes).digest("hex");
}
function uniqueStrings(values, maximum = 64) {
  return freeze([...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))].slice(0, maximum));
}
function validateTimestamp(value, label) {
  assert(typeof value === "string" && value.trim() === value && Number.isFinite(Date.parse(value)), `${label} must be an ISO-compatible timestamp.`);
  return value;
}
function frameBodyOrder(order) {
  assert(order?.assetContract?.kind === "frame-body-cel", `${order?.unitId ?? "work order"} is not a Frame body-cel work order.`);
  assert(order.subjectContract?.type === "frame" && typeof order.subjectContract.id === "string", `${order.unitId} has no canonical Frame subject contract.`);
  assert(order.candidatePolicy?.candidateFanout === 1, `${order.unitId} candidate fanout must remain exactly one.`);
  assert(order.authority?.providerExecution === false && order.authority?.automaticGenerationAuthorization === false, `${order.unitId} base work order gained provider or automatic authorization authority.`);
  assert(SHA256_PATTERN.test(order.workOrderSha256), `${order.unitId} has no valid workOrderSha256.`);
  return order;
}
function validateOverlay(order, overlay) {
  assert(overlay?.unitId === order.unitId && overlay.batchId === order.batchId, `${order.unitId} choreography overlay identity drifted.`);
  assert(overlay.baseWorkOrderSha256 === order.workOrderSha256, `${order.unitId} choreography overlay is bound to a different base work order.`);
  assert(overlay.frameId === order.subjectContract.id, `${order.unitId} choreography overlay Frame identity drifted.`);
  assert(SHA256_PATTERN.test(overlay.overlaySha256), `${order.unitId} choreography overlay has no valid overlaySha256.`);
  assert(overlay.authority?.baseWorkOrderMutation === false && overlay.authority?.receiptChainMutation === false, `${order.unitId} choreography overlay gained mutation authority.`);
  assert(overlay.authority?.providerExecution === false && overlay.authority?.simulationTiming === false && overlay.authority?.targetRepositoryMutation === false, `${order.unitId} choreography overlay gained execution or game authority.`);
  return overlay;
}
function continuityPhase(order, overlay) {
  if (overlay.bodySlot === 0) return "identity-master";
  const previous = typeof order.referenceBindings?.previousCel === "string";
  const next = typeof order.referenceBindings?.nextCel === "string";
  return previous && next ? "in-between" : "key-pose";
}
function referenceRequirements(order) {
  const requirements = [];
  for (const [bindingKey, sourcePath] of Object.entries(order.referenceBindings ?? {})) {
    assert(typeof sourcePath === "string" && sourcePath.trim(), `${order.unitId}.${bindingKey} reference path is invalid.`);
    const role = REFERENCE_ROLE_BY_BINDING[bindingKey];
    assert(role, `${order.unitId} contains unsupported provider reference binding ${bindingKey}.`);
    requirements.push(freeze({
      bindingKey,
      sourcePath,
      role,
      strength: 1,
      required: true,
      admissionRequired: true,
      note: `Governed HEAVY METAL FIGHTING ${bindingKey} authority for ${order.unitId}.`,
    }));
  }
  assert(requirements.length >= 1 && requirements.length <= 16, `${order.unitId} must resolve 1 to 16 provider reference requirements.`);
  assert(requirements.some((entry) => entry.role === "canonical-identity"), `${order.unitId} must retain a canonical-identity reference requirement.`);
  const phase = continuityPhase(order, { bodySlot: Number(order.unitId.match(/slot-(\d+)$/u)?.[1] ?? -1) });
  if (phase === "in-between") {
    assert(requirements.some((entry) => entry.role === "previous-key-pose"), `${order.unitId} in-between is missing previous-key-pose.`);
    assert(requirements.some((entry) => entry.role === "next-key-pose"), `${order.unitId} in-between is missing next-key-pose.`);
  }
  return freeze(requirements);
}
function normalizeArtifactBindings(unitId, requirements, input) {
  assert(Array.isArray(input), "artifactBindings must be an array.");
  const relevant = input.filter((entry) => entry?.unitId === undefined || entry.unitId === unitId);
  const requirementByKey = new Map(requirements.map((entry) => [entry.bindingKey, entry]));
  const admitted = [];
  const seen = new Set();
  for (const [index, entry] of relevant.entries()) {
    assert(entry && typeof entry === "object" && !Array.isArray(entry), `artifactBindings[${index}] must be an object.`);
    assert(entry.unitId === undefined || entry.unitId === unitId, `artifactBindings[${index}] belongs to another work order.`);
    assert(typeof entry.bindingKey === "string" && requirementByKey.has(entry.bindingKey), `artifactBindings[${index}].bindingKey is not required by ${unitId}.`);
    assert(!seen.has(entry.bindingKey), `${unitId} artifact binding ${entry.bindingKey} is duplicated.`);
    seen.add(entry.bindingKey);
    const requirement = requirementByKey.get(entry.bindingKey);
    assert(entry.sourcePath === requirement.sourcePath, `${unitId}.${entry.bindingKey} sourcePath does not match the immutable work order.`);
    assert(ARTIFACT_ID_PATTERN.test(String(entry.artifactId ?? "")), `${unitId}.${entry.bindingKey} artifactId must use artifact_<sha256> format.`);
    assert(SHA256_PATTERN.test(String(entry.evidenceSha256 ?? "")), `${unitId}.${entry.bindingKey} requires evidenceSha256.`);
    assert(entry.actorClass === "human", `${unitId}.${entry.bindingKey} reference admission requires actorClass human.`);
    assert(typeof entry.actorId === "string" && entry.actorId.trim(), `${unitId}.${entry.bindingKey} reference admission requires actorId.`);
    validateTimestamp(entry.occurredAt, `${unitId}.${entry.bindingKey}.occurredAt`);
    admitted.push(freeze({
      unitId,
      bindingKey: entry.bindingKey,
      sourcePath: requirement.sourcePath,
      artifactId: entry.artifactId,
      role: requirement.role,
      strength: requirement.strength,
      required: true,
      evidenceSha256: entry.evidenceSha256,
      actorClass: "human",
      actorId: entry.actorId,
      occurredAt: entry.occurredAt,
      note: requirement.note,
    }));
  }
  const admittedByKey = new Map(admitted.map((entry) => [entry.bindingKey, entry]));
  const missingBindingKeys = requirements.filter((entry) => !admittedByKey.has(entry.bindingKey)).map((entry) => entry.bindingKey);
  return freeze({
    admitted: freeze(requirements.filter((entry) => admittedByKey.has(entry.bindingKey)).map((entry) => admittedByKey.get(entry.bindingKey))),
    missingBindingKeys: freeze(missingBindingKeys),
    complete: missingBindingKeys.length === 0,
  });
}
function providerRequestInput(order, overlay, composedPrompt, admissions) {
  const subject = order.subjectContract;
  const dimensions = order.assetContract.nativeDimensions;
  const authoring = order.assetContract.authoringCanvas;
  assert(dimensions?.width === 160 && dimensions?.height === 160, `${order.unitId} provider target must remain 160x160.`);
  assert(authoring?.width === 640 && authoring?.height === 640, `${order.unitId} provider source canvas must remain 640x640.`);
  assert(composedPrompt.length <= 32_000, `${order.unitId} composed provider prompt exceeds the provider protocol limit.`);
  const bodyRole = overlay.bodyRole;
  const move = overlay.moveBinding;
  const mustAvoid = uniqueStrings([...(order.failureCodes?.technical ?? []), ...(order.failureCodes?.style ?? [])]);
  const mustHave = uniqueStrings([
    `Exact semantic body role ${bodyRole.semanticId}.`,
    `Exact Frame motion identity ${subject.motionIdentity}.`,
    "One coherent physical Frame body only.",
    "True transparent alpha with the governed 80,152 pivot.",
    ...(subject.silhouetteLocks ?? []),
    ...(subject.motionRules ?? []),
    ...(move?.bodyNotes ?? []),
  ]);
  const separateAssets = uniqueStrings([
    "all combat effects",
    "all typography and labels",
    "all arena and UI context",
    ...(move?.separateEffects ?? []),
  ]);
  return freeze({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "sprite-frame",
    continuityPhase: continuityPhase(order, overlay),
    assetId: order.unitId,
    candidateFamilyId: `hmf:${overlay.frameId}:${overlay.bodyBankId}`,
    frameId: overlay.frameId,
    creativeIntent: composedPrompt,
    negativeIntent: `Reject any candidate matching governed failure codes: ${mustAvoid.join("; ")}.`,
    style: freeze({
      styleName: "HEAVY METAL FIGHTING production-master-v3",
      intent: `Original premium 1994-1997 arcade and DOS giant-machine fighter pixel art. Preserve ${subject.motionIdentity} and the exact ${bodyRole.semanticId} held-cel purpose without copying any existing franchise artwork.`,
      mustHave,
      mustAvoid,
      identityLocks: uniqueStrings([
        `${subject.id.toUpperCase()} ${subject.code} ${subject.epithet}`,
        ...(subject.silhouetteLocks ?? []),
        ...(subject.mirrorPolicy?.rules ?? []),
      ]),
      palette: uniqueStrings(subject.materialRamps ?? []),
      lineTreatment: freeze([
        "Deliberate native pixel clusters with hard material separation.",
        "No painterly blur, global anti-aliasing, soft PBR gradients or generated micro-detail crawl.",
      ]),
      materials: uniqueStrings(subject.materialRamps ?? []),
      cameraRules: freeze([
        "Fixed 2D fighting-game side presentation.",
        "Authored body faces right; runtime mirroring remains a separate game responsibility.",
      ]),
      compositionRules: freeze([
        "Full physical body remains inside the 160x160 cell.",
        "Foot contact and body balance remain aligned to pivot 80,152.",
        "No effects, typography, contact sheet, extra pose or second image in this work unit.",
      ]),
      eraRules: freeze([
        "Use an original hand-authored mid-1990s arcade sprite language rather than modern 3D, vector or cinematic rendering.",
      ]),
    }),
    shot: freeze({
      subject: `${subject.id.toUpperCase()} physical Frame body cel ${overlay.bodySlot}.`,
      action: move
        ? `${move.publicName}: ${bodyRole.semanticId}; actor role ${move.actorRole}.`
        : `${bodyRole.semanticId}; state animation body role.`,
      direction: "Gameplay side view, authored facing right.",
      include: uniqueStrings([
        ...mustHave,
        ...(overlay.frameMotionRealization?.bodyRules ?? []),
      ]),
      exclude: mustAvoid,
      separateAssets,
      framing: freeze([
        "One complete Frame body, centred by the governed pivot rather than by canvas bounds.",
        "Preserve transparent safety margins and readable silhouette at native 160x160 scale.",
      ]),
    }),
    target: freeze({ width: 160, height: 160, transparency: "required", outputFormat: "png" }),
    sourceCanvas: freeze({ width: 640, height: 640 }),
    background: freeze({ strategy: "native-alpha" }),
    quality: "high",
    candidateCount: 1,
    references: freeze(admissions.admitted.map((entry) => freeze({
      artifactId: entry.artifactId,
      role: entry.role,
      strength: entry.strength,
      required: true,
      note: entry.note,
    }))),
    selection: freeze({ allowedAdapterIds: freeze([]), allowFallback: false, requireSeed: false }),
    metadata: freeze({
      schema: "evavo.heavy-metal-fighting-provider-request-metadata.v1",
      projectId: order.projectId,
      publicTitle: order.publicTitle,
      unitId: order.unitId,
      batchId: order.batchId,
      registrySha256: order.registrySha256,
      baseWorkOrderSha256: order.workOrderSha256,
      choreographyOverlaySha256: overlay.overlaySha256,
      bodySlot: overlay.bodySlot,
      bodyBankId: overlay.bodyBankId,
      bodyRoleSemanticId: bodyRole.semanticId,
      candidateOutputPath: order.executionPaths.candidatePathTemplate.replace("{candidate:02}", "01"),
      masteringRequired: true,
      approvals: freeze({ generation: false, creative: false, identity: false, technical: false, promotion: false, publication: false }),
    }),
  });
}
function authorizationState(unitState) {
  const ready = unitState.currentState === "generation-authorized"
    && unitState.nextAction === "run-provider-once"
    && SHA256_PATTERN.test(String(unitState.headReceiptSha256 ?? ""));
  return freeze({
    requiredState: "generation-authorized",
    currentState: unitState.currentState,
    currentAttempt: unitState.currentAttempt,
    currentOutcome: unitState.currentOutcome,
    headReceiptSha256: unitState.headReceiptSha256,
    nextLegalAction: unitState.nextAction,
    readyForOneProviderCall: ready,
  });
}
function compileEnvelope(orderInput, overlayInput, unitState, artifactBindings) {
  const order = frameBodyOrder(orderInput);
  const overlay = validateOverlay(order, overlayInput);
  assert(unitState?.unitId === order.unitId && unitState.workOrderSha256 === order.workOrderSha256, `${order.unitId} resume state is bound to another work order.`);
  const requirements = referenceRequirements(order);
  const admissions = normalizeArtifactBindings(order.unitId, requirements, artifactBindings);
  const authorization = authorizationState(unitState);
  const composedProviderPrompt = `${order.providerPrompt}\n\n${overlay.supplementalProviderPrompt}`;
  const promptComposition = freeze({
    separator: "\\n\\n",
    baseProviderPromptSha256: sha256(order.providerPrompt),
    supplementalProviderPromptSha256: sha256(overlay.supplementalProviderPrompt),
    composedProviderPromptSha256: sha256(composedProviderPrompt),
  });
  const request = admissions.complete ? providerRequestInput(order, overlay, composedProviderPrompt, admissions) : null;
  const blockers = [];
  if (!authorization.readyForOneProviderCall) blockers.push(`provider-execution-not-current-legal-action:${authorization.nextLegalAction}`);
  if (!admissions.complete) blockers.push("reference-artifact-admission-required");
  const submissionReady = blockers.length === 0 && request !== null;
  const withoutHash = {
    schema: HMF_PROVIDER_EXECUTION_ENVELOPE_SCHEMA,
    protocolVersion: HMF_PROVIDER_EXECUTION_ENVELOPE_PROTOCOL_VERSION,
    status: submissionReady ? "ready-for-explicit-provider-submission" : "blocked",
    projectId: order.projectId,
    publicTitle: order.publicTitle,
    unitId: order.unitId,
    batchId: order.batchId,
    frameId: overlay.frameId,
    bodySlot: overlay.bodySlot,
    bodyBankId: overlay.bodyBankId,
    bodyRoleSemanticId: overlay.bodyRole.semanticId,
    registrySha256: order.registrySha256,
    baseWorkOrderSha256: order.workOrderSha256,
    choreographyOverlaySha256: overlay.overlaySha256,
    promptComposition,
    composedProviderPrompt,
    referenceRequirements: requirements,
    referenceAdmissions: admissions.admitted,
    missingReferenceBindingKeys: admissions.missingBindingKeys,
    authorization,
    providerRequestInput: request,
    providerRequestInputSha256: request ? sha256(request) : null,
    candidateOutputPath: order.executionPaths.candidatePathTemplate.replace("{candidate:02}", "01"),
    candidatePolicy: order.candidatePolicy,
    blockers: freeze(blockers),
    submissionReady,
    authority: freeze({
      promptComposition: true,
      providerRequestCompilation: true,
      providerExecution: false,
      automaticGenerationAuthorization: false,
      referenceArtifactAdmission: false,
      receiptPersistence: false,
      baseWorkOrderMutation: false,
      choreographyOverlayMutation: false,
      receiptChainMutation: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      namedHumanApprovalRequired: true,
      explicitWriteEnabledRuntimeCallRequired: true,
    }),
  };
  return freeze({ ...withoutHash, executionEnvelopeSha256: sha256(withoutHash) });
}

export async function heavyMetalFightingProviderExecutionEnvelope(unitIdInput, input = {}) {
  const unitId = String(unitIdInput ?? "").trim();
  assert(unitId, "unitId is required.");
  assert(Array.isArray(input.receipts ?? []), "receipts must be an array.");
  assert(Array.isArray(input.artifactBindings ?? []), "artifactBindings must be an array.");
  const [order, overlay] = await Promise.all([
    heavyMetalFightingProductionWorkOrder(unitId),
    heavyMetalFightingBodyChoreographyOverlay(unitId),
  ]);
  const resume = await heavyMetalFightingProductionBatchResumePlan(order.batchId, input.receipts ?? []);
  const unitState = resume.unitStates.find((state) => state.unitId === unitId);
  assert(unitState, `${unitId} is missing from its governed batch resume plan.`);
  return compileEnvelope(order, overlay, unitState, input.artifactBindings ?? []);
}

export async function buildHmfProviderExecutionEnvelopeBatch(identifier, input = {}) {
  assert(Array.isArray(input.receipts ?? []), "receipts must be an array.");
  assert(Array.isArray(input.artifactBindings ?? []), "artifactBindings must be an array.");
  const [bundle, overlayBatch, resume] = await Promise.all([
    buildHmfProductionWorkOrderBatch(identifier),
    buildHmfBodyChoreographyOverlayBatch(identifier),
    heavyMetalFightingProductionBatchResumePlan(identifier, input.receipts ?? []),
  ]);
  assert(bundle.familyId === "frame-animation", `${bundle.batchId} is ${bundle.familyId}; provider execution envelopes currently apply only to Frame body-animation batches.`);
  assert(bundle.batchId === overlayBatch.batchId && bundle.workOrderBatchSha256 === overlayBatch.workOrderBatchSha256, `${bundle.batchId} work-order and choreography-overlay batches disagree.`);
  const overlayByUnit = new Map(overlayBatch.overlays.map((overlay) => [overlay.unitId, overlay]));
  const stateByUnit = new Map(resume.unitStates.map((state) => [state.unitId, state]));
  const envelopes = freeze(bundle.workOrders.map((order) => compileEnvelope(
    order,
    overlayByUnit.get(order.unitId),
    stateByUnit.get(order.unitId),
    input.artifactBindings ?? [],
  )));
  const ready = envelopes.filter((envelope) => envelope.submissionReady).length;
  const withoutHash = {
    schema: HMF_PROVIDER_EXECUTION_ENVELOPE_BATCH_SCHEMA,
    protocolVersion: HMF_PROVIDER_EXECUTION_ENVELOPE_PROTOCOL_VERSION,
    status: ready === envelopes.length ? "ready-for-explicit-provider-submission" : ready > 0 ? "partially-ready" : "blocked",
    projectId: bundle.projectId,
    batchId: bundle.batchId,
    frameId: overlayBatch.frameId,
    workOrderBatchSha256: bundle.workOrderBatchSha256,
    choreographyOverlayBatchSha256: overlayBatch.overlayBatchSha256,
    envelopeCount: envelopes.length,
    readyEnvelopeCount: ready,
    blockedEnvelopeCount: envelopes.length - ready,
    envelopes,
    authority: freeze({
      providerRequestCompilation: true,
      providerExecution: false,
      automaticGenerationAuthorization: false,
      referenceArtifactAdmission: false,
      receiptPersistence: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
      explicitWriteEnabledRuntimeCallRequired: true,
    }),
  };
  return freeze({ ...withoutHash, executionEnvelopeBatchSha256: sha256(withoutHash) });
}

function verificationArtifactBindings(envelope) {
  return envelope.referenceRequirements.map((requirement) => freeze({
    unitId: envelope.unitId,
    bindingKey: requirement.bindingKey,
    sourcePath: requirement.sourcePath,
    artifactId: `artifact_${sha256(`${envelope.unitId}:${requirement.bindingKey}:${requirement.sourcePath}`)}`,
    evidenceSha256: sha256(`verification-admission:${envelope.unitId}:${requirement.bindingKey}`),
    actorClass: "human",
    actorId: "hmf-verification-reviewer",
    occurredAt: "2026-08-13T00:00:00.000Z",
  }));
}

export async function verifyHmfProviderExecutionEnvelopes() {
  const unitId = "hmf.frame-animation.bastion.slot-121";
  const blocked = await heavyMetalFightingProviderExecutionEnvelope(unitId);
  const referencesLocked = await createHmfProductionReceipt({
    unitId,
    state: "references-locked",
    attempt: 1,
    evidenceSha256: sha256("verification-references-locked"),
    actorClass: "agent",
    actorId: "hmf-verification-agent",
    occurredAt: "2026-08-13T00:01:00.000Z",
  });
  const generationAuthorized = await createHmfProductionReceipt({
    unitId,
    state: "generation-authorized",
    attempt: 1,
    evidenceSha256: sha256("verification-generation-authorized"),
    actorClass: "human",
    actorId: "hmf-verification-reviewer",
    occurredAt: "2026-08-13T00:02:00.000Z",
  }, referencesLocked);
  const ready = await heavyMetalFightingProviderExecutionEnvelope(unitId, {
    receipts: [referencesLocked, generationAuthorized],
    artifactBindings: verificationArtifactBindings(blocked),
  });
  const batch = await buildHmfProviderExecutionEnvelopeBatch(blocked.batchId);
  const check = (id, passed) => freeze({ id, passed });
  const checks = freeze([
    check("blocked-without-evidence", blocked.status === "blocked" && blocked.submissionReady === false),
    check("immutable-hash-bindings", SHA256_PATTERN.test(blocked.baseWorkOrderSha256) && SHA256_PATTERN.test(blocked.choreographyOverlaySha256) && SHA256_PATTERN.test(blocked.executionEnvelopeSha256)),
    check("exact-prompt-composition", blocked.composedProviderPromptSha256 === undefined && blocked.promptComposition.composedProviderPromptSha256 === sha256(blocked.composedProviderPrompt)),
    check("one-candidate", blocked.candidatePolicy.candidateFanout === 1 && ready.providerRequestInput?.candidateCount === 1),
    check("reference-admission-gate", blocked.missingReferenceBindingKeys.length === blocked.referenceRequirements.length && ready.missingReferenceBindingKeys.length === 0),
    check("human-authorization-gate", blocked.authorization.readyForOneProviderCall === false && ready.authorization.readyForOneProviderCall === true),
    check("provider-request-ready", ready.status === "ready-for-explicit-provider-submission" && ready.submissionReady === true && ready.providerRequestInput !== null),
    check("provider-request-geometry", ready.providerRequestInput?.target.width === 160 && ready.providerRequestInput?.target.height === 160 && ready.providerRequestInput?.sourceCanvas.width === 640 && ready.providerRequestInput?.sourceCanvas.height === 640),
    check("provider-request-continuity", ready.providerRequestInput?.continuityPhase === "in-between" && ready.providerRequestInput.references.some((reference) => reference.role === "canonical-identity") && ready.providerRequestInput.references.some((reference) => reference.role === "previous-key-pose") && ready.providerRequestInput.references.some((reference) => reference.role === "next-key-pose")),
    check("gravebell-binding", ready.bodyRoleSemanticId === "standing-heavy:hero-impact" && ready.composedProviderPrompt.includes("GRAVEBELL")),
    check("governed-batch", batch.envelopeCount >= 1 && batch.envelopeCount <= 10 && batch.readyEnvelopeCount === 0),
    check("no-execution-authority", ready.authority.providerExecution === false && ready.authority.referenceArtifactAdmission === false && ready.authority.targetRepositoryMutation === false && ready.authority.gitMutation === false),
  ]);
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-provider-execution-envelope-verification.v1",
    status: failed.length ? "failed" : "passed",
    blockedEnvelopeSha256: blocked.executionEnvelopeSha256,
    readyEnvelopeSha256: ready.executionEnvelopeSha256,
    sampleBatchId: batch.batchId,
    sampleBatchEnvelopeCount: batch.envelopeCount,
    checks,
    failed,
  });
}
