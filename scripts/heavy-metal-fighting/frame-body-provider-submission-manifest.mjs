import { createHash } from "node:crypto";

import {
  HMF_PROVIDER_EXECUTION_ENVELOPE_PROTOCOL_VERSION,
  HMF_PROVIDER_EXECUTION_ENVELOPE_SCHEMA,
  buildHmfProviderExecutionEnvelopeBatch,
  heavyMetalFightingProviderExecutionEnvelope,
} from "./frame-body-provider-execution-envelope.mjs";
import { createHmfProductionReceipt } from "./work-orders.mjs";

export const HMF_PROVIDER_SUBMISSION_AUTHORIZATION_SCHEMA = "evavo.heavy-metal-fighting-provider-submission-authorization.v1";
export const HMF_PROVIDER_SUBMISSION_MANIFEST_SCHEMA = "evavo.heavy-metal-fighting-provider-submission-manifest.v1";
export const HMF_PROVIDER_SUBMISSION_MANIFEST_BATCH_SCHEMA = "evavo.heavy-metal-fighting-provider-submission-manifest-batch.v1";
export const HMF_PROVIDER_RUNTIME_SUBMISSION_INSTRUCTION_SCHEMA = "evavo.heavy-metal-fighting-provider-runtime-submission-instruction.v1";
export const HMF_PROVIDER_SUBMISSION_PROTOCOL_VERSION = "2026-08-13.1";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const AUTHORIZATION_INPUT_KEYS = new Set(["actorClass", "actorId", "occurredAt", "evidenceSha256", "reason"]);
const AUTHORIZATION_RECORD_KEYS = new Set([
  "schema",
  "protocolVersion",
  "projectId",
  "publicTitle",
  "unitId",
  "batchId",
  "frameId",
  "bodySlot",
  "executionEnvelopeSha256",
  "providerRequestInputSha256",
  "composedProviderPromptSha256",
  "generationAuthorizationReceiptSha256",
  "attempt",
  "scope",
  "reason",
  "actorClass",
  "actorId",
  "occurredAt",
  "evidenceSha256",
  "intent",
  "authority",
  "authorizationSha256",
]);

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_PROVIDER_SUBMISSION_MANIFEST_INVALID: ${message}`);
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
function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} fields must be exactly ${expected.join(", ")}.`);
}
function canonicalTimestamp(value, label) {
  assert(typeof value === "string" && value.trim() === value, `${label} must be a canonical UTC timestamp.`);
  const milliseconds = Date.parse(value);
  assert(Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value, `${label} must be a canonical UTC timestamp.`);
  return value;
}
function safeId(value, label) {
  assert(typeof value === "string" && SAFE_ID_PATTERN.test(value), `${label} must use 1 to 128 safe characters.`);
  return value;
}
function boundedText(value, label, maximum = 4096) {
  assert(typeof value === "string" && value.trim() === value && value.length >= 1 && value.length <= maximum && !value.includes("\0"), `${label} must contain 1 to ${maximum} safe characters.`);
  return value;
}
function falseAuthority() {
  return freeze({
    providerExecution: false,
    runtimeEnqueue: false,
    workerClaim: false,
    referenceArtifactAdmission: false,
    receiptPersistence: false,
    candidateApproval: false,
    candidatePromotion: false,
    baseWorkOrderMutation: false,
    choreographyOverlayMutation: false,
    receiptChainMutation: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
  });
}
function authorizationScope() {
  return freeze({
    providerCalls: 1,
    candidates: 1,
    oneImage: true,
    candidateApproval: false,
    candidatePromotion: false,
  });
}
function authorizationIntent() {
  return freeze({ explicitRuntimeSubmission: true });
}
function verifySelfHash(value, key, label) {
  assert(SHA256_PATTERN.test(String(value?.[key] ?? "")), `${label} lacks ${key}.`);
  const withoutHash = { ...value };
  delete withoutHash[key];
  assert(sha256(withoutHash) === value[key], `${label} ${key} does not match its canonical content.`);
}
function validateProviderRequest(envelope) {
  const request = envelope.providerRequestInput;
  assert(request && typeof request === "object" && !Array.isArray(request), `${envelope.unitId} is missing providerRequestInput.`);
  assert(request.schemaVersion === "1.0", `${envelope.unitId} provider request schema drifted.`);
  assert(request.operation === "generate" && request.assetKind === "sprite-frame", `${envelope.unitId} provider request operation or asset kind drifted.`);
  assert(request.candidateCount === 1 && envelope.candidatePolicy?.candidateFanout === 1, `${envelope.unitId} provider request must remain one candidate.`);
  assert(request.target?.width === 160 && request.target?.height === 160 && request.target?.transparency === "required" && request.target?.outputFormat === "png", `${envelope.unitId} provider target drifted from 160x160 transparent PNG.`);
  assert(request.sourceCanvas?.width === 640 && request.sourceCanvas?.height === 640, `${envelope.unitId} provider source canvas drifted from 640x640.`);
  assert(request.background?.strategy === "native-alpha", `${envelope.unitId} provider background must remain native-alpha.`);
  assert(request.selection?.allowFallback === false, `${envelope.unitId} provider fallback must remain disabled.`);
  assert(Array.isArray(request.references) && request.references.length >= 1 && request.references.length <= 16, `${envelope.unitId} provider references must contain 1 to 16 entries.`);
  assert(request.references.every((entry) => entry?.required === true && /^artifact_[0-9a-f]{64}$/u.test(String(entry.artifactId ?? ""))), `${envelope.unitId} provider references must remain required admitted artifacts.`);
  assert(request.references.some((entry) => entry.role === "canonical-identity"), `${envelope.unitId} provider request lacks canonical identity.`);
  if (request.continuityPhase === "in-between") {
    assert(request.references.some((entry) => entry.role === "previous-key-pose"), `${envelope.unitId} in-between lacks previous key pose.`);
    assert(request.references.some((entry) => entry.role === "next-key-pose"), `${envelope.unitId} in-between lacks next key pose.`);
  }
  assert(request.metadata?.candidateOutputPath === envelope.candidateOutputPath, `${envelope.unitId} candidate output path drifted.`);
  assert(request.metadata?.approvals && Object.values(request.metadata.approvals).every((value) => value === false), `${envelope.unitId} provider request approvals must remain false.`);
  assert(sha256(request) === envelope.providerRequestInputSha256, `${envelope.unitId} providerRequestInputSha256 mismatch.`);
  return request;
}
function validateEnvelope(envelope, { requireReady = false } = {}) {
  assert(envelope?.schema === HMF_PROVIDER_EXECUTION_ENVELOPE_SCHEMA, "provider execution envelope schema drifted.");
  assert(envelope.protocolVersion === HMF_PROVIDER_EXECUTION_ENVELOPE_PROTOCOL_VERSION, `${envelope.unitId ?? "provider envelope"} protocol drifted.`);
  verifySelfHash(envelope, "executionEnvelopeSha256", `${envelope.unitId} provider execution envelope`);
  assert(envelope.authority?.providerExecution === false && envelope.authority?.automaticGenerationAuthorization === false && envelope.authority?.referenceArtifactAdmission === false, `${envelope.unitId} provider execution envelope gained forbidden authority.`);
  if (requireReady) {
    assert(envelope.status === "ready-for-explicit-provider-submission" && envelope.submissionReady === true && envelope.blockers?.length === 0, `${envelope.unitId} provider execution envelope is not submit-ready.`);
    assert(envelope.authorization?.readyForOneProviderCall === true && envelope.authorization?.nextLegalAction === "run-provider-once", `${envelope.unitId} provider execution is not the current legal action.`);
    assert(SHA256_PATTERN.test(String(envelope.authorization?.headReceiptSha256 ?? "")), `${envelope.unitId} has no generation-authorization receipt head.`);
    validateProviderRequest(envelope);
  }
  return envelope;
}

export function createHmfProviderSubmissionAuthorization(envelopeInput, input = {}) {
  const envelope = validateEnvelope(envelopeInput, { requireReady: true });
  exactKeys(input, AUTHORIZATION_INPUT_KEYS, "submission authorization input");
  assert(input.actorClass === "human", `${envelope.unitId} provider submission authorization requires actorClass human.`);
  const withoutHash = {
    schema: HMF_PROVIDER_SUBMISSION_AUTHORIZATION_SCHEMA,
    protocolVersion: HMF_PROVIDER_SUBMISSION_PROTOCOL_VERSION,
    projectId: envelope.projectId,
    publicTitle: envelope.publicTitle,
    unitId: envelope.unitId,
    batchId: envelope.batchId,
    frameId: envelope.frameId,
    bodySlot: envelope.bodySlot,
    executionEnvelopeSha256: envelope.executionEnvelopeSha256,
    providerRequestInputSha256: envelope.providerRequestInputSha256,
    composedProviderPromptSha256: envelope.promptComposition.composedProviderPromptSha256,
    generationAuthorizationReceiptSha256: envelope.authorization.headReceiptSha256,
    attempt: envelope.authorization.currentAttempt,
    scope: authorizationScope(),
    reason: boundedText(input.reason, "submission authorization reason"),
    actorClass: "human",
    actorId: safeId(input.actorId, "submission authorization actorId"),
    occurredAt: canonicalTimestamp(input.occurredAt, "submission authorization occurredAt"),
    evidenceSha256: SHA256_PATTERN.test(String(input.evidenceSha256 ?? "")) ? input.evidenceSha256 : fail("submission authorization evidenceSha256 is invalid."),
    intent: authorizationIntent(),
    authority: falseAuthority(),
  };
  return freeze({ ...withoutHash, authorizationSha256: sha256(withoutHash) });
}

export function validateHmfProviderSubmissionAuthorization(envelopeInput, authorizationInput) {
  const envelope = validateEnvelope(envelopeInput, { requireReady: true });
  exactKeys(authorizationInput, AUTHORIZATION_RECORD_KEYS, `${envelope.unitId} submission authorization`);
  const authorization = authorizationInput;
  assert(authorization.schema === HMF_PROVIDER_SUBMISSION_AUTHORIZATION_SCHEMA && authorization.protocolVersion === HMF_PROVIDER_SUBMISSION_PROTOCOL_VERSION, `${envelope.unitId} submission authorization schema or protocol drifted.`);
  verifySelfHash(authorization, "authorizationSha256", `${envelope.unitId} submission authorization`);
  assert(authorization.projectId === envelope.projectId && authorization.publicTitle === envelope.publicTitle, `${envelope.unitId} submission authorization project identity drifted.`);
  assert(authorization.unitId === envelope.unitId && authorization.batchId === envelope.batchId && authorization.frameId === envelope.frameId && authorization.bodySlot === envelope.bodySlot, `${envelope.unitId} submission authorization work-unit identity drifted.`);
  assert(authorization.executionEnvelopeSha256 === envelope.executionEnvelopeSha256, `${envelope.unitId} submission authorization is bound to another execution envelope.`);
  assert(authorization.providerRequestInputSha256 === envelope.providerRequestInputSha256, `${envelope.unitId} submission authorization provider request hash drifted.`);
  assert(authorization.composedProviderPromptSha256 === envelope.promptComposition.composedProviderPromptSha256, `${envelope.unitId} submission authorization prompt hash drifted.`);
  assert(authorization.generationAuthorizationReceiptSha256 === envelope.authorization.headReceiptSha256 && authorization.attempt === envelope.authorization.currentAttempt, `${envelope.unitId} submission authorization receipt head or attempt drifted.`);
  assert(canonicalJson(authorization.scope) === canonicalJson(authorizationScope()), `${envelope.unitId} submission authorization scope must remain one call and one candidate.`);
  assert(canonicalJson(authorization.intent) === canonicalJson(authorizationIntent()), `${envelope.unitId} submission authorization intent drifted.`);
  assert(canonicalJson(authorization.authority) === canonicalJson(falseAuthority()), `${envelope.unitId} submission authorization may not execute or mutate anything by itself.`);
  boundedText(authorization.reason, `${envelope.unitId} submission authorization reason`);
  assert(authorization.actorClass === "human", `${envelope.unitId} submission authorization requires actorClass human.`);
  safeId(authorization.actorId, `${envelope.unitId} submission authorization actorId`);
  canonicalTimestamp(authorization.occurredAt, `${envelope.unitId} submission authorization occurredAt`);
  assert(SHA256_PATTERN.test(authorization.evidenceSha256), `${envelope.unitId} submission authorization evidenceSha256 is invalid.`);
  return freeze(authorization);
}

function authorizationTemplate(envelope) {
  return freeze({
    schema: HMF_PROVIDER_SUBMISSION_AUTHORIZATION_SCHEMA,
    protocolVersion: HMF_PROVIDER_SUBMISSION_PROTOCOL_VERSION,
    projectId: envelope.projectId,
    publicTitle: envelope.publicTitle,
    unitId: envelope.unitId,
    batchId: envelope.batchId,
    frameId: envelope.frameId,
    bodySlot: envelope.bodySlot,
    executionEnvelopeSha256: envelope.executionEnvelopeSha256,
    providerRequestInputSha256: envelope.providerRequestInputSha256,
    composedProviderPromptSha256: envelope.promptComposition.composedProviderPromptSha256,
    generationAuthorizationReceiptSha256: envelope.authorization.headReceiptSha256,
    attempt: envelope.authorization.currentAttempt,
    scope: authorizationScope(),
    requiredHumanFields: freeze(["reason", "actorId", "occurredAt", "evidenceSha256"]),
    actorClass: "human",
    intent: authorizationIntent(),
    authority: falseAuthority(),
  });
}

function runtimeSubmissionInstruction(envelope, authorization) {
  const withoutHash = {
    schema: HMF_PROVIDER_RUNTIME_SUBMISSION_INSTRUCTION_SCHEMA,
    protocolVersion: HMF_PROVIDER_SUBMISSION_PROTOCOL_VERSION,
    projectId: envelope.projectId,
    unitId: envelope.unitId,
    batchId: envelope.batchId,
    frameId: envelope.frameId,
    bodySlot: envelope.bodySlot,
    attempt: envelope.authorization.currentAttempt,
    executionEnvelopeSha256: envelope.executionEnvelopeSha256,
    submissionAuthorizationSha256: authorization.authorizationSha256,
    generationAuthorizationReceiptSha256: envelope.authorization.headReceiptSha256,
    providerCompiler: freeze({
      package: "@evavo/art-providers",
      export: "compileProviderCandidateRuntimeContract",
      validationRequiredAtSubmission: true,
    }),
    providerRequestInput: envelope.providerRequestInput,
    providerRequestInputSha256: envelope.providerRequestInputSha256,
    submissionIdempotencyKey: `hmf-provider-submit:${authorization.authorizationSha256.slice(0, 40)}`,
    maximumProviderCalls: 1,
    maximumCandidates: 1,
    candidateOutputPath: envelope.candidateOutputPath,
    expectedNextReceiptState: "candidates-admitted",
    requiredPostconditions: freeze([
      "Canonical provider runtime contract compiled successfully.",
      "Exactly one candidate result or one explicit provider failure receipt is recorded.",
      "Candidate bytes are stored only at the governed candidate output path.",
      "Production receipt chain advances to candidates-admitted before any QA or creative review.",
      "No candidate is approved, promoted, delivered or published by provider execution.",
    ]),
    authority: falseAuthority(),
  };
  return freeze({ ...withoutHash, runtimeSubmissionInstructionSha256: sha256(withoutHash) });
}

function compileManifestFromEnvelope(envelopeInput, authorizationInput = null) {
  const envelope = validateEnvelope(envelopeInput);
  const blockers = [];
  let authorization = null;
  let instruction = null;
  if (!envelope.submissionReady) {
    assert(authorizationInput === null || authorizationInput === undefined, `${envelope.unitId} cannot accept provider submission authorization while its execution envelope is blocked.`);
    blockers.push("provider-execution-envelope-not-submit-ready", ...(envelope.blockers ?? []));
  } else if (!authorizationInput) {
    blockers.push("named-human-provider-submission-authorization-required");
  } else {
    authorization = validateHmfProviderSubmissionAuthorization(envelope, authorizationInput);
    instruction = runtimeSubmissionInstruction(envelope, authorization);
  }
  const manifestReady = instruction !== null && blockers.length === 0;
  const withoutHash = {
    schema: HMF_PROVIDER_SUBMISSION_MANIFEST_SCHEMA,
    protocolVersion: HMF_PROVIDER_SUBMISSION_PROTOCOL_VERSION,
    status: manifestReady
      ? "authorized-for-explicit-runtime-submission"
      : envelope.submissionReady
        ? "awaiting-human-submission-authorization"
        : "blocked-by-provider-execution-envelope",
    projectId: envelope.projectId,
    publicTitle: envelope.publicTitle,
    unitId: envelope.unitId,
    batchId: envelope.batchId,
    frameId: envelope.frameId,
    bodySlot: envelope.bodySlot,
    bodyBankId: envelope.bodyBankId,
    bodyRoleSemanticId: envelope.bodyRoleSemanticId,
    executionEnvelopeSha256: envelope.executionEnvelopeSha256,
    providerRequestInputSha256: envelope.providerRequestInputSha256,
    generationAuthorizationReceiptSha256: envelope.authorization.headReceiptSha256,
    submissionAuthorizationTemplate: envelope.submissionReady ? authorizationTemplate(envelope) : null,
    submissionAuthorization: authorization,
    runtimeSubmissionInstruction: instruction,
    runtimeSubmissionInstructionSha256: instruction?.runtimeSubmissionInstructionSha256 ?? null,
    candidateOutputPath: envelope.candidateOutputPath,
    blockers: freeze([...new Set(blockers)]),
    manifestReady,
    authority: freeze({
      authorizationValidation: true,
      runtimeSubmissionInstructionCompilation: true,
      providerExecution: false,
      runtimeEnqueue: false,
      workerClaim: false,
      referenceArtifactAdmission: false,
      receiptPersistence: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      explicitWriteEnabledRuntimeCallRequired: true,
    }),
  };
  return freeze({ ...withoutHash, submissionManifestSha256: sha256(withoutHash) });
}

export async function heavyMetalFightingProviderSubmissionManifest(unitIdInput, input = {}) {
  const unitId = String(unitIdInput ?? "").trim();
  assert(unitId, "unitId is required.");
  assert(Array.isArray(input.receipts ?? []), "receipts must be an array.");
  assert(Array.isArray(input.artifactBindings ?? []), "artifactBindings must be an array.");
  assert(input.submissionAuthorization === undefined || input.submissionAuthorization === null || (typeof input.submissionAuthorization === "object" && !Array.isArray(input.submissionAuthorization)), "submissionAuthorization must be one object or null.");
  const envelope = await heavyMetalFightingProviderExecutionEnvelope(unitId, {
    receipts: input.receipts ?? [],
    artifactBindings: input.artifactBindings ?? [],
  });
  return compileManifestFromEnvelope(envelope, input.submissionAuthorization ?? null);
}

export async function buildHmfProviderSubmissionManifestBatch(identifier, input = {}) {
  assert(Array.isArray(input.receipts ?? []), "receipts must be an array.");
  assert(Array.isArray(input.artifactBindings ?? []), "artifactBindings must be an array.");
  assert(Array.isArray(input.submissionAuthorizations ?? []), "submissionAuthorizations must be an array.");
  const envelopeBatch = await buildHmfProviderExecutionEnvelopeBatch(identifier, {
    receipts: input.receipts ?? [],
    artifactBindings: input.artifactBindings ?? [],
  });
  const knownUnits = new Set(envelopeBatch.envelopes.map((envelope) => envelope.unitId));
  const authorizationByUnit = new Map();
  for (const [index, authorization] of (input.submissionAuthorizations ?? []).entries()) {
    assert(authorization && typeof authorization === "object" && !Array.isArray(authorization), `submissionAuthorizations[${index}] must be an object.`);
    assert(typeof authorization.unitId === "string" && knownUnits.has(authorization.unitId), `submissionAuthorizations[${index}] belongs to a unit outside ${envelopeBatch.batchId}.`);
    assert(!authorizationByUnit.has(authorization.unitId), `${envelopeBatch.batchId} submission authorization for ${authorization.unitId} is duplicated.`);
    authorizationByUnit.set(authorization.unitId, authorization);
  }
  const manifests = freeze(envelopeBatch.envelopes.map((envelope) => compileManifestFromEnvelope(
    envelope,
    authorizationByUnit.get(envelope.unitId) ?? null,
  )));
  const authorized = manifests.filter((manifest) => manifest.manifestReady).length;
  const awaiting = manifests.filter((manifest) => manifest.status === "awaiting-human-submission-authorization").length;
  const blocked = manifests.length - authorized - awaiting;
  const withoutHash = {
    schema: HMF_PROVIDER_SUBMISSION_MANIFEST_BATCH_SCHEMA,
    protocolVersion: HMF_PROVIDER_SUBMISSION_PROTOCOL_VERSION,
    status: authorized === manifests.length
      ? "authorized-for-explicit-runtime-submission"
      : authorized > 0
        ? "partially-authorized"
        : awaiting > 0
          ? "awaiting-human-submission-authorization"
          : "blocked",
    projectId: envelopeBatch.projectId,
    batchId: envelopeBatch.batchId,
    frameId: envelopeBatch.frameId,
    executionEnvelopeBatchSha256: envelopeBatch.executionEnvelopeBatchSha256,
    manifestCount: manifests.length,
    authorizedManifestCount: authorized,
    awaitingAuthorizationCount: awaiting,
    blockedManifestCount: blocked,
    manifests,
    authority: freeze({
      authorizationValidation: true,
      runtimeSubmissionInstructionCompilation: true,
      providerExecution: false,
      runtimeEnqueue: false,
      workerClaim: false,
      receiptPersistence: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
      explicitWriteEnabledRuntimeCallRequired: true,
    }),
  };
  return freeze({ ...withoutHash, submissionManifestBatchSha256: sha256(withoutHash) });
}

function verificationArtifactBindings(envelope) {
  return envelope.referenceRequirements.map((requirement) => freeze({
    unitId: envelope.unitId,
    bindingKey: requirement.bindingKey,
    sourcePath: requirement.sourcePath,
    artifactId: `artifact_${sha256(`${envelope.unitId}:${requirement.bindingKey}:${requirement.sourcePath}`)}`,
    evidenceSha256: sha256(`submission-verification-admission:${envelope.unitId}:${requirement.bindingKey}`),
    actorClass: "human",
    actorId: "hmf-submission-verification-reviewer",
    occurredAt: "2026-08-13T02:00:00.000Z",
  }));
}

export async function verifyHmfProviderSubmissionManifests() {
  const unitId = "hmf.frame-animation.bastion.slot-121";
  const blockedEnvelope = await heavyMetalFightingProviderExecutionEnvelope(unitId);
  const blockedManifest = await heavyMetalFightingProviderSubmissionManifest(unitId);
  const referencesLocked = await createHmfProductionReceipt({
    unitId,
    state: "references-locked",
    attempt: 1,
    evidenceSha256: sha256("submission-verification-references-locked"),
    actorClass: "agent",
    actorId: "hmf-submission-verification-agent",
    occurredAt: "2026-08-13T02:01:00.000Z",
  });
  const generationAuthorized = await createHmfProductionReceipt({
    unitId,
    state: "generation-authorized",
    attempt: 1,
    evidenceSha256: sha256("submission-verification-generation-authorized"),
    actorClass: "human",
    actorId: "hmf-submission-verification-reviewer",
    occurredAt: "2026-08-13T02:02:00.000Z",
  }, referencesLocked);
  const evidence = {
    receipts: [referencesLocked, generationAuthorized],
    artifactBindings: verificationArtifactBindings(blockedEnvelope),
  };
  const readyEnvelope = await heavyMetalFightingProviderExecutionEnvelope(unitId, evidence);
  const awaiting = await heavyMetalFightingProviderSubmissionManifest(unitId, evidence);
  const authorization = createHmfProviderSubmissionAuthorization(readyEnvelope, {
    actorClass: "human",
    actorId: "hmf-submission-verification-reviewer",
    occurredAt: "2026-08-13T02:03:00.000Z",
    evidenceSha256: sha256("submission-verification-provider-submit"),
    reason: "Authorize one governed provider call for the exact Bastion GRAVEBELL hero-impact body cel.",
  });
  const authorized = await heavyMetalFightingProviderSubmissionManifest(unitId, {
    ...evidence,
    submissionAuthorization: authorization,
  });
  const batch = await buildHmfProviderSubmissionManifestBatch(blockedEnvelope.batchId);
  const check = (id, passed) => freeze({ id, passed });
  const checks = freeze([
    check("blocked-envelope-stays-blocked", blockedManifest.status === "blocked-by-provider-execution-envelope" && blockedManifest.manifestReady === false),
    check("ready-envelope-awaits-second-human-gate", awaiting.status === "awaiting-human-submission-authorization" && awaiting.manifestReady === false),
    check("authorization-is-human-and-hash-bound", authorization.actorClass === "human" && authorization.executionEnvelopeSha256 === readyEnvelope.executionEnvelopeSha256 && SHA256_PATTERN.test(authorization.authorizationSha256)),
    check("one-call-one-candidate", authorization.scope.providerCalls === 1 && authorization.scope.candidates === 1 && authorized.runtimeSubmissionInstruction?.maximumProviderCalls === 1 && authorized.runtimeSubmissionInstruction?.maximumCandidates === 1),
    check("authorized-manifest", authorized.status === "authorized-for-explicit-runtime-submission" && authorized.manifestReady === true && authorized.blockers.length === 0),
    check("canonical-compiler-boundary", authorized.runtimeSubmissionInstruction?.providerCompiler.package === "@evavo/art-providers" && authorized.runtimeSubmissionInstruction?.providerCompiler.export === "compileProviderCandidateRuntimeContract"),
    check("exact-request-hash", authorized.runtimeSubmissionInstruction?.providerRequestInputSha256 === readyEnvelope.providerRequestInputSha256 && authorized.runtimeSubmissionInstruction?.providerRequestInput.candidateCount === 1),
    check("next-state", authorized.runtimeSubmissionInstruction?.expectedNextReceiptState === "candidates-admitted"),
    check("idempotency", /^hmf-provider-submit:[0-9a-f]{40}$/u.test(authorized.runtimeSubmissionInstruction?.submissionIdempotencyKey ?? "")),
    check("bounded-batch", batch.manifestCount >= 1 && batch.manifestCount <= 10 && batch.authorizedManifestCount === 0),
    check("no-runtime-authority", authorized.authority.providerExecution === false && authorized.authority.runtimeEnqueue === false && authorized.authority.candidateApproval === false && authorized.authority.targetRepositoryMutation === false),
  ]);
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-provider-submission-manifest-verification.v1",
    status: failed.length ? "failed" : "passed",
    blockedManifestSha256: blockedManifest.submissionManifestSha256,
    awaitingManifestSha256: awaiting.submissionManifestSha256,
    authorizedManifestSha256: authorized.submissionManifestSha256,
    authorizationSha256: authorization.authorizationSha256,
    sampleBatchId: batch.batchId,
    checks,
    failed,
  });
}
