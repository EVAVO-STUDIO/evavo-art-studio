import { compileBookAuthorialWritingBridge } from "./book-studio-authorial-writing-bridge";
import type {
  BookAuthorialWritingBridgeCompileInputV1,
  BookAuthorialWritingBridgeResultV1,
} from "./book-studio-authorial-writing-bridge-types";
import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";
import { compileBookUnattendedProduction } from "./book-studio-unattended-production";
import type {
  BookUnattendedProductionInputV1,
  BookUnattendedProductionResultV1,
  BookUnattendedStagePlanV1,
} from "./book-studio-unattended-production";

export const BOOK_UNATTENDED_AUTHORIAL_WRITING_CONTRACT =
  "evavo_docs_book_unattended_authorial_writing_v1" as const;

export interface BookUnattendedAuthorialDependencyReceiptV1 {
  stageId: string;
  receiptFingerprint: string;
  completedAt: string;
}

export interface BookUnattendedAuthorialWritingCompileInputV1 {
  outputKind: "evavo_docs_book_unattended_authorial_writing_compile_input";
  schemaVersion: 1;
  contract: typeof BOOK_UNATTENDED_AUTHORIAL_WRITING_CONTRACT;
  unattendedProductionInput: BookUnattendedProductionInputV1;
  expectedUnattendedResultFingerprint: string;
  volumeId: string;
  stageId: string;
  revisionCycle: number;
  priorRevisionReceiptFingerprint?: string;
  dependencyReceipts: BookUnattendedAuthorialDependencyReceiptV1[];
  authorialWritingBridgeInput: BookAuthorialWritingBridgeCompileInputV1;
  executionRequestedAt: string;
  executionRequestedBy: string;
  authoritativeWritesAllowed: false;
  canonicalManuscriptMutationAllowed: false;
  providerFallbackAllowed: false;
  automaticPublicationAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookUnattendedAuthorialWritingCompileResultV1 {
  outputKind: "evavo_docs_book_unattended_authorial_writing_compile_result";
  schemaVersion: 1;
  contract: typeof BOOK_UNATTENDED_AUTHORIAL_WRITING_CONTRACT;
  status: "ready" | "blocked";
  unattendedProduction: BookUnattendedProductionResultV1;
  selectedStage?: BookUnattendedStagePlanV1;
  sourceDispatchOperation?: string;
  effectiveDispatchOperation?: "/api/v1/book-studio/writing-candidate/authorial";
  revisionCycle: number;
  revisionCycleEvidenceId?: string;
  dependencyReceipts: BookUnattendedAuthorialDependencyReceiptV1[];
  priorRevisionReceiptFingerprint?: string;
  requiredWritingHandoffEvidenceIds: string[];
  authorialBridge: BookAuthorialWritingBridgeResultV1;
  executionRequestedAt: string;
  executionRequestedBy: string;
  executionFingerprint?: string;
  blockers: string[];
  warnings: string[];
  providerCallAllowed: boolean;
  providerCallPerformed: false;
  oneBoundedStagePerAutomationCallRequired: true;
  oneProviderAttemptPerRevisionCycleRequired: true;
  providerFallbackAllowed: false;
  authoritativeBookStateWritePerformed: false;
  canonicalManuscriptMutationPerformed: false;
  artStudioCalled: false;
  automaticCanonicalAdmissionAllowed: false;
  automaticPublicationAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

type UnknownRecord = Record<string, unknown>;
type ResultInput = Readonly<{
  status: "ready" | "blocked";
  unattendedProduction: BookUnattendedProductionResultV1;
  selectedStage?: BookUnattendedStagePlanV1;
  revisionCycle: number;
  revisionCycleEvidenceId?: string;
  dependencyReceipts: BookUnattendedAuthorialDependencyReceiptV1[];
  priorRevisionReceiptFingerprint?: string;
  requiredWritingHandoffEvidenceIds: string[];
  authorialBridge: BookAuthorialWritingBridgeResultV1;
  executionRequestedAt: string;
  executionRequestedBy: string;
  executionFingerprint?: string;
  blockers: string[];
  warnings: string[];
}>;

const INPUT_KEYS = new Set([
  "outputKind", "schemaVersion", "contract", "unattendedProductionInput",
  "expectedUnattendedResultFingerprint", "volumeId", "stageId", "revisionCycle",
  "priorRevisionReceiptFingerprint", "dependencyReceipts", "authorialWritingBridgeInput",
  "executionRequestedAt", "executionRequestedBy", "authoritativeWritesAllowed",
  "canonicalManuscriptMutationAllowed", "providerFallbackAllowed",
  "automaticPublicationAllowed", "runtimeCutoverApproved", "publicationPerformed",
]);
const RECEIPT_KEYS = new Set(["stageId", "receiptFingerprint", "completedAt"]);
const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,299}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const EFFECTIVE_DISPATCH = "/api/v1/book-studio/writing-candidate/authorial" as const;
const SOURCE_DISPATCHES = new Set(["/api/v1/book-studio/writing-candidate", EFFECTIVE_DISPATCH]);

export async function compileBookUnattendedAuthorialWritingExecution(
  input: unknown,
): Promise<BookUnattendedAuthorialWritingCompileResultV1> {
  const blockers: string[] = [];
  const source = record(input, "Unattended authorial writing input", blockers);
  rejectUnknown(source, INPUT_KEYS, "Unattended authorial writing input", blockers);
  literal(source.outputKind, "evavo_docs_book_unattended_authorial_writing_compile_input", "outputKind is invalid.", blockers);
  literal(source.schemaVersion, 1, "schemaVersion must be 1.", blockers);
  literal(source.contract, BOOK_UNATTENDED_AUTHORIAL_WRITING_CONTRACT, "contract is invalid.", blockers);
  for (const key of [
    "authoritativeWritesAllowed", "canonicalManuscriptMutationAllowed", "providerFallbackAllowed",
    "automaticPublicationAllowed", "runtimeCutoverApproved", "publicationPerformed",
  ]) falseAuthority(source[key], key, blockers);

  const expectedFingerprint = digest(source.expectedUnattendedResultFingerprint, "expectedUnattendedResultFingerprint", blockers);
  const volumeId = identifier(source.volumeId, "volumeId", blockers);
  const stageId = identifier(source.stageId, "stageId", blockers);
  const revisionCycle = integer(source.revisionCycle, "revisionCycle", 1, 64, blockers);
  const priorReceipt = optionalDigest(source.priorRevisionReceiptFingerprint, "priorRevisionReceiptFingerprint", blockers);
  const dependencyReceipts = parseReceipts(source.dependencyReceipts, blockers);
  const executionRequestedAt = timestamp(source.executionRequestedAt, "executionRequestedAt", blockers);
  const executionRequestedBy = identifier(source.executionRequestedBy, "executionRequestedBy", blockers);

  const unattendedProduction = await compileBookUnattendedProduction(source.unattendedProductionInput);
  if (unattendedProduction.resultFingerprint !== expectedFingerprint) {
    blockers.push("The unattended result fingerprint differs from the exact expected plan.");
  }
  if (unattendedProduction.status === "blocked") blockers.push("The unattended plan is blocked.");
  if (!unattendedProduction.internalWritingAutomationEnabled) {
    blockers.push("The unattended plan does not enable Writing Studio automation.");
  }
  if (Date.parse(executionRequestedAt) < Date.parse(unattendedProduction.requestedAt)) {
    blockers.push("executionRequestedAt precedes the unattended plan request.");
  }
  if (executionRequestedBy !== unattendedProduction.requestedBy) {
    blockers.push("executionRequestedBy differs from the exact unattended plan requester.");
  }

  const selectedVolume = unattendedProduction.volumes.find((item) => item.volumeId === volumeId);
  if (!selectedVolume) blockers.push(`The unattended plan does not contain volume ${volumeId}.`);
  const stageMatches = unattendedProduction.volumes
    .flatMap((item) => item.stagePlans)
    .filter((item) => item.stageId === stageId);
  if (stageMatches.length !== 1) blockers.push("stageId must identify exactly one unattended stage.");
  const selectedStage = stageMatches.length === 1 ? stageMatches[0] : undefined;
  if (selectedStage) {
    validateStage(
      selectedStage,
      volumeId,
      revisionCycle,
      dependencyReceipts,
      executionRequestedAt,
      blockers,
    );
  }

  if (revisionCycle === 1 && priorReceipt !== undefined) {
    blockers.push("priorRevisionReceiptFingerprint must be absent for revisionCycle 1.");
  }
  if (revisionCycle > 1 && priorReceipt === undefined) {
    blockers.push("priorRevisionReceiptFingerprint is required after revisionCycle 1.");
  }
  if (
    priorReceipt !== undefined
    && !bridgeInputContainsEvidence(source.authorialWritingBridgeInput, priorReceipt)
  ) {
    blockers.push("The prior revision receipt is not bound into the prevalidated authorial Writing bridge input.");
  }

  const revisionCycleEvidenceId = selectedStage
    ? await sha256BookText(canonicalBookJson({
        outputKind: "evavo_docs_book_unattended_authorial_revision_cycle_identity",
        schemaVersion: 1,
        contract: BOOK_UNATTENDED_AUTHORIAL_WRITING_CONTRACT,
        stageId: selectedStage.stageId,
        revisionCycle,
      }))
    : undefined;
  const requiredWritingHandoffEvidenceIds = selectedStage && selectedVolume && revisionCycleEvidenceId
    ? unique([
        unattendedProduction.requestFingerprint,
        unattendedProduction.readinessFingerprint,
        unattendedProduction.resultFingerprint,
        selectedVolume.planFingerprint,
        selectedStage.stageId,
        revisionCycleEvidenceId,
        ...selectedStage.sourceGateIds,
        ...selectedStage.gateIds,
        ...dependencyReceipts.map((item) => item.receiptFingerprint),
        ...(priorReceipt === undefined ? [] : [priorReceipt]),
      ]).sort()
    : [];
  const boundBridgeInput = bindWritingHandoffEvidence(
    source.authorialWritingBridgeInput,
    requiredWritingHandoffEvidenceIds,
    blockers,
  );
  const authorialBridge = await compileBookAuthorialWritingBridge(boundBridgeInput);
  if (authorialBridge.status !== "ready") {
    blockers.push("The exact authorial Writing bridge is blocked.", ...authorialBridge.blockers);
  }

  const authoring = authorialBridge.authoringPacket;
  const synthesis = authorialBridge.synthesisPacket;
  const handoff = authorialBridge.handoffRequest;
  for (const packet of [authoring, synthesis]) {
    if (!packet) continue;
    if (packet.projectId !== unattendedProduction.projectId) {
      blockers.push("The Writing packet project differs from the unattended project.");
    }
    if (packet.programmeId !== unattendedProduction.programmeId) {
      blockers.push("The Writing packet programme differs from the unattended programme.");
    }
    if (packet.volumeId !== volumeId) {
      blockers.push("The Writing packet volume differs from the selected unattended volume.");
    }
  }
  if (handoff?.requestedAt !== executionRequestedAt) {
    blockers.push("The Writing handoff requestedAt must equal executionRequestedAt.");
  }
  for (const evidenceId of requiredWritingHandoffEvidenceIds) {
    if (!handoff?.requiredEvidenceIds.includes(evidenceId)) {
      blockers.push(`The Writing handoff is missing exact unattended evidence ${evidenceId}.`);
    }
  }
  if (!authorialBridge.bridgeFingerprint) blockers.push("The authorial bridge fingerprint is required.");
  if (!authorialBridge.runtimeRequestPreview?.runtimeRequestFingerprint) {
    blockers.push("The authorial runtime preview fingerprint is required.");
  }

  const uniqueBlockers = unique(blockers).sort();
  const warnings = unique([
    ...authorialBridge.warnings,
    ...unattendedProduction.warningIds.map((id) => `Unattended readiness warning: ${id}`),
  ]).sort();
  if (
    uniqueBlockers.length
    || !selectedStage
    || !selectedVolume
    || !revisionCycleEvidenceId
    || authorialBridge.status !== "ready"
    || !authorialBridge.bridgeFingerprint
    || !authorialBridge.runtimeRequestPreview
  ) {
    return finish({
      status: "blocked",
      unattendedProduction,
      ...(selectedStage === undefined ? {} : { selectedStage }),
      revisionCycle,
      ...(revisionCycleEvidenceId === undefined ? {} : { revisionCycleEvidenceId }),
      dependencyReceipts,
      ...(priorReceipt === undefined ? {} : { priorRevisionReceiptFingerprint: priorReceipt }),
      requiredWritingHandoffEvidenceIds,
      authorialBridge,
      executionRequestedAt,
      executionRequestedBy,
      blockers: uniqueBlockers,
      warnings,
    });
  }

  const executionFingerprint = await sha256BookText(canonicalBookJson({
    outputKind: "evavo_docs_book_unattended_authorial_writing_execution_identity",
    schemaVersion: 1,
    contract: BOOK_UNATTENDED_AUTHORIAL_WRITING_CONTRACT,
    unattendedRequestFingerprint: unattendedProduction.requestFingerprint,
    unattendedReadinessFingerprint: unattendedProduction.readinessFingerprint,
    unattendedResultFingerprint: unattendedProduction.resultFingerprint,
    volumePlanFingerprint: selectedVolume.planFingerprint,
    stageId: selectedStage.stageId,
    sourceDispatchOperation: selectedStage.dispatchOperation,
    effectiveDispatchOperation: EFFECTIVE_DISPATCH,
    revisionCycle,
    revisionCycleEvidenceId,
    priorRevisionReceiptFingerprint: priorReceipt ?? null,
    dependencyReceipts,
    requiredWritingHandoffEvidenceIds,
    bridgeFingerprint: authorialBridge.bridgeFingerprint,
    runtimeRequestFingerprint: authorialBridge.runtimeRequestPreview.runtimeRequestFingerprint,
    executionRequestedAt,
    executionRequestedBy,
  }));
  return finish({
    status: "ready",
    unattendedProduction,
    selectedStage,
    revisionCycle,
    revisionCycleEvidenceId,
    dependencyReceipts,
    ...(priorReceipt === undefined ? {} : { priorRevisionReceiptFingerprint: priorReceipt }),
    requiredWritingHandoffEvidenceIds,
    authorialBridge,
    executionRequestedAt,
    executionRequestedBy,
    executionFingerprint,
    blockers: [],
    warnings,
  });
}

export function listBookUnattendedAuthorialWritingCapabilities() {
  return Object.freeze({
    outputKind: "evavo_docs_book_unattended_authorial_writing_capabilities",
    schemaVersion: 1,
    contract: BOOK_UNATTENDED_AUTHORIAL_WRITING_CONTRACT,
    sourceStageKind: "writing_candidate",
    sourceDispatchOperations: [...SOURCE_DISPATCHES].sort(),
    effectiveDispatchOperation: EFFECTIVE_DISPATCH,
    exactUnattendedResultFingerprintRequired: true,
    exactAuthorialBridgeRequired: true,
    planEvidenceInjectedIntoWritingHandoffAutomatically: true,
    stageGateEvidenceInjectedIntoWritingHandoffAutomatically: true,
    dependencyReceiptEvidenceInjectedIntoWritingHandoffAutomatically: true,
    priorRevisionReceiptEvidenceInjectedIntoWritingHandoffAutomatically: true,
    priorRevisionReceiptMustAlsoBeBoundIntoBridgeInput: true,
    priorRevisionReceiptRequiredAfterFirstCycle: true,
    oneBoundedStagePerAutomationCallRequired: true,
    oneProviderAttemptPerRevisionCycleRequired: true,
    providerFallbackAllowed: false,
    providerCallPerformed: false,
    authoritativeBookStateWritePerformed: false,
    canonicalManuscriptMutationPerformed: false,
    artStudioCalled: false,
    automaticCanonicalAdmissionAllowed: false,
    automaticPublicationAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  });
}

function validateStage(
  stage: BookUnattendedStagePlanV1,
  volumeId: string,
  revisionCycle: number,
  receipts: BookUnattendedAuthorialDependencyReceiptV1[],
  executionRequestedAt: string,
  blockers: string[],
): void {
  if (stage.volumeId !== volumeId) blockers.push("The selected stage does not belong to volumeId.");
  if (stage.kind !== "writing_candidate") {
    blockers.push("Only a writing_candidate stage can use the authorial Writing coordinator.");
  }
  if (stage.dispatchTarget !== "writing_studio") {
    blockers.push("The selected stage is not routed to Writing Studio.");
  }
  if (!SOURCE_DISPATCHES.has(stage.dispatchOperation)) {
    blockers.push("The selected stage has an unsupported Writing dispatch operation.");
  }
  if (!stage.unattendedExecutionAllowed) {
    blockers.push("The selected writing stage is not authorised for unattended execution.");
  }
  if (stage.mode !== "automatic") {
    blockers.push("The selected writing stage must remain automatic; editorial review is a separate consensus stage.");
  }
  if (revisionCycle > stage.revisionCycleLimit) {
    blockers.push(`revisionCycle ${revisionCycle} exceeds the stage limit ${stage.revisionCycleLimit}.`);
  }

  const expected = [...stage.dependencyStageIds].sort();
  const actual = receipts.map((item) => item.stageId).sort();
  if (canonicalBookJson(actual) !== canonicalBookJson(expected)) {
    blockers.push("dependencyReceipts must cover the exact selected-stage dependency set.");
  }
  for (const receipt of receipts) {
    if (Date.parse(receipt.completedAt) > Date.parse(executionRequestedAt)) {
      blockers.push(`Dependency receipt ${receipt.stageId} completes after executionRequestedAt.`);
    }
  }
}

function bridgeInputContainsEvidence(value: unknown, evidenceId: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const handoff = (value as UnknownRecord).handoff;
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) return false;
  const additionalEvidenceIds = (handoff as UnknownRecord).additionalEvidenceIds;
  return Array.isArray(additionalEvidenceIds) && additionalEvidenceIds.includes(evidenceId);
}

function bindWritingHandoffEvidence(
  value: unknown,
  requiredEvidenceIds: string[],
  blockers: string[],
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push("authorialWritingBridgeInput must be an object before evidence can be bound.");
    return value;
  }
  const source = value as UnknownRecord;
  const handoffValue = source.handoff;
  if (!handoffValue || typeof handoffValue !== "object" || Array.isArray(handoffValue)) {
    blockers.push("authorialWritingBridgeInput.handoff must be an object before evidence can be bound.");
    return value;
  }
  const handoff = handoffValue as UnknownRecord;
  if (
    !Array.isArray(handoff.additionalEvidenceIds)
    || handoff.additionalEvidenceIds.some((item) => typeof item !== "string")
  ) {
    blockers.push("authorialWritingBridgeInput.handoff.additionalEvidenceIds must be a string array.");
    return value;
  }
  return {
    ...source,
    handoff: {
      ...handoff,
      additionalEvidenceIds: unique([
        ...handoff.additionalEvidenceIds as string[],
        ...requiredEvidenceIds,
      ]).sort(),
    },
  };
}

function parseReceipts(value: unknown, blockers: string[]): BookUnattendedAuthorialDependencyReceiptV1[] {
  if (!Array.isArray(value) || value.length > 256) {
    blockers.push("dependencyReceipts must be a bounded array.");
    return [];
  }
  const receipts = value.map((item, index) => {
    const source = record(item, `dependencyReceipts[${index}]`, blockers);
    rejectUnknown(source, RECEIPT_KEYS, `dependencyReceipts[${index}]`, blockers);
    return {
      stageId: identifier(source.stageId, `dependencyReceipts[${index}].stageId`, blockers),
      receiptFingerprint: digest(
        source.receiptFingerprint,
        `dependencyReceipts[${index}].receiptFingerprint`,
        blockers,
      ),
      completedAt: timestamp(source.completedAt, `dependencyReceipts[${index}].completedAt`, blockers),
    };
  });
  if (new Set(receipts.map((item) => item.stageId)).size !== receipts.length) {
    blockers.push("dependencyReceipts contain duplicate stage identities.");
  }
  if (new Set(receipts.map((item) => item.receiptFingerprint)).size !== receipts.length) {
    blockers.push("dependencyReceipts contain duplicate receipt fingerprints.");
  }
  return receipts.sort((left, right) => left.stageId.localeCompare(right.stageId));
}

function finish(input: ResultInput): BookUnattendedAuthorialWritingCompileResultV1 {
  const ready = input.status === "ready";
  return {
    outputKind: "evavo_docs_book_unattended_authorial_writing_compile_result",
    schemaVersion: 1,
    contract: BOOK_UNATTENDED_AUTHORIAL_WRITING_CONTRACT,
    status: input.status,
    unattendedProduction: input.unattendedProduction,
    ...(input.selectedStage === undefined ? {} : {
      selectedStage: input.selectedStage,
      sourceDispatchOperation: input.selectedStage.dispatchOperation,
      effectiveDispatchOperation: EFFECTIVE_DISPATCH,
    }),
    revisionCycle: input.revisionCycle,
    ...(input.revisionCycleEvidenceId === undefined
      ? {}
      : { revisionCycleEvidenceId: input.revisionCycleEvidenceId }),
    dependencyReceipts: input.dependencyReceipts,
    ...(input.priorRevisionReceiptFingerprint === undefined
      ? {}
      : { priorRevisionReceiptFingerprint: input.priorRevisionReceiptFingerprint }),
    requiredWritingHandoffEvidenceIds: input.requiredWritingHandoffEvidenceIds,
    authorialBridge: input.authorialBridge,
    executionRequestedAt: input.executionRequestedAt,
    executionRequestedBy: input.executionRequestedBy,
    ...(input.executionFingerprint === undefined
      ? {}
      : { executionFingerprint: input.executionFingerprint }),
    blockers: input.blockers,
    warnings: input.warnings,
    providerCallAllowed: ready,
    providerCallPerformed: false,
    oneBoundedStagePerAutomationCallRequired: true,
    oneProviderAttemptPerRevisionCycleRequired: true,
    providerFallbackAllowed: false,
    authoritativeBookStateWritePerformed: false,
    canonicalManuscriptMutationPerformed: false,
    artStudioCalled: false,
    automaticCanonicalAdmissionAllowed: false,
    automaticPublicationAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function record(value: unknown, label: string, blockers: string[]): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push(`${label} must be an object.`);
    return {};
  }
  return value as UnknownRecord;
}
function rejectUnknown(
  source: UnknownRecord,
  allowed: ReadonlySet<string>,
  label: string,
  blockers: string[],
): void {
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) blockers.push(`${label} contains unsupported field ${key}.`);
  }
}
function literal(value: unknown, expected: unknown, message: string, blockers: string[]): void {
  if (value !== expected) blockers.push(message);
}
function falseAuthority(value: unknown, label: string, blockers: string[]): void {
  if (value !== false) blockers.push(`${label} must remain false.`);
}
function identifier(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    blockers.push(`${label} must be a bounded safe identity.`);
    return "invalid";
  }
  return value;
}
function digest(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    blockers.push(`${label} must be a canonical sha256 fingerprint.`);
    return "sha256:invalid";
  }
  return value;
}
function optionalDigest(value: unknown, label: string, blockers: string[]): string | undefined {
  return value === undefined ? undefined : digest(value, label, blockers);
}
function timestamp(value: unknown, label: string, blockers: string[]): string {
  if (
    typeof value !== "string"
    || !ISO_UTC.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    blockers.push(`${label} must be canonical UTC ISO-8601.`);
    return "1970-01-01T00:00:00.000Z";
  }
  return value;
}
function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  blockers: string[],
): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    blockers.push(`${label} must be an integer between ${minimum} and ${maximum}.`);
    return minimum;
  }
  return value as number;
}
function unique(values: string[]): string[] {
  return [...new Set(values)];
}
