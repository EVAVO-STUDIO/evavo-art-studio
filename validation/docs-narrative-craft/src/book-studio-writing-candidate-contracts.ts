import { validateAndNormalizeBookAuthoringPacket } from "./book-studio-authoring-packet";
import type { BookAuthoringPacketV1 } from "./book-studio-authoring-types";
import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";
import { validateBookWritingHandoffResponse } from "./book-studio-writing-handoff-response";
import { normalizeBookWritingHandoffRequest } from "./book-studio-writing-handoff-request";
import { ISO_TIMESTAMP, SAFE_ID, SHA256, object, rejectUnknown, unique } from "./book-studio-writing-handoff-shared";
import type {
  BookWritingCandidateCompilationResultV1,
  BookWritingCandidateContextBlockV1,
  BookWritingCandidateContextRole,
  BookWritingCandidateCoordinationResultV1,
  BookWritingCandidatePromptV1,
  BookWritingCandidateResponseMode,
  BookWritingCandidateRuntimeRequestV1,
  BookWritingCandidateRuntimeResultV1,
  BookWritingCandidateStopReason,
  BookWritingCandidateStorageReceiptV1,
  CompileBookWritingCandidateInputV1,
} from "./book-studio-writing-candidate-types";
import {
  BOOK_WRITING_CANDIDATE_CONTRACT,
  BOOK_WRITING_CANDIDATE_SCHEMA_VERSION,
} from "./book-studio-writing-candidate-types";

const CONTEXT_ROLES = new Set<BookWritingCandidateContextRole>([
  "target_manuscript", "read_only_manuscript", "story_state", "continuity", "research", "fact", "voice",
  "constraint", "prior_revision", "other",
]);
const RESPONSE_MODES = new Set<BookWritingCandidateResponseMode>([
  "strict_json_schema", "forced_single_tool", "adapter_structured_output",
]);
const STOP_REASONS = new Set<BookWritingCandidateStopReason>([
  "completed", "maximum_output_tokens", "provider_pause", "content_filter", "provider_rejected", "timeout",
  "network", "invalid_request", "authentication", "rate_limited", "temporary_unavailable", "unknown",
]);
const MAX_CONTEXT_BLOCKS = 8_192;
const MAX_CONTEXT_CHARACTERS = 4_000_000;
const MAX_CANDIDATE_BYTES = 8_000_000;

type UnknownRecord = Record<string, unknown>;

export async function compileBookWritingCandidateRuntimeRequest(
  inputValue: unknown,
): Promise<BookWritingCandidateCompilationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const source = object(inputValue, "Book writing candidate compile input", blockers);
  rejectUnknown(source, new Set([
    "outputKind", "schemaVersion", "packet", "handoffRequest", "requestedProvider", "modelName", "prompt",
    "contextBlocks", "maximumOutputCharacters", "maximumOutputTokens", "timeoutMilliseconds", "requestedAt",
    "providerCallAllowed", "providerRetryAllowed", "writingStudioMayMutateManuscript", "canonicalAdmissionAllowed",
    "remoteBookStateWriteAllowed", "artStudioCallAllowed", "publicationPerformed",
  ]), "Book writing candidate compile input", blockers);
  checkLiteral(source.outputKind, "evavo_docs_book_writing_candidate_compile_input", "outputKind", blockers);
  checkLiteral(source.schemaVersion, 1, "schemaVersion", blockers);
  checkLiteral(source.providerCallAllowed, true, "providerCallAllowed", blockers);
  checkLiteral(source.providerRetryAllowed, false, "providerRetryAllowed", blockers);
  checkLiteral(source.writingStudioMayMutateManuscript, false, "writingStudioMayMutateManuscript", blockers);
  checkLiteral(source.canonicalAdmissionAllowed, false, "canonicalAdmissionAllowed", blockers);
  checkLiteral(source.remoteBookStateWriteAllowed, false, "remoteBookStateWriteAllowed", blockers);
  checkLiteral(source.artStudioCallAllowed, false, "artStudioCallAllowed", blockers);
  checkLiteral(source.publicationPerformed, false, "publicationPerformed", blockers);

  const packetValidation = await validateAndNormalizeBookAuthoringPacket(source.packet);
  if (packetValidation.status !== "ready" || !packetValidation.packet) {
    blockers.push("Writing candidate compilation requires a valid Book authoring packet.", ...packetValidation.blockers);
  }
  const packet = packetValidation.packet;
  const handoffBlockers: string[] = [];
  const handoffRequest = packet
    ? await normalizeBookWritingHandoffRequest(source.handoffRequest, packet, handoffBlockers)
    : undefined;
  blockers.push(...handoffBlockers);
  if (!handoffRequest) blockers.push("Writing candidate compilation requires an exact normalized Writing Studio handoff request.");

  const requestedProvider = readProvider(source.requestedProvider, "requestedProvider", blockers);
  const modelName = readText(source.modelName, "modelName", blockers, 300);
  if (packet && requestedProvider !== packet.provider) blockers.push("Writing candidate provider differs from the exact authoring packet provider.");
  if (packet && modelName !== packet.modelName) blockers.push("Writing candidate model differs from the exact authoring packet model.");
  if (handoffRequest && !handoffRequest.allowedProviderIds.includes(requestedProvider)) blockers.push("Writing candidate provider is not allowed by the exact handoff request.");
  const responseMode = responseModeForProvider(requestedProvider);
  const prompt = await parsePrompt(source.prompt, blockers);
  const contextBlocks = await parseContextBlocks(source.contextBlocks, blockers);
  const requestedAt = readTimestamp(source.requestedAt, "requestedAt", blockers);
  if (handoffRequest && requestedAt !== handoffRequest.requestedAt) blockers.push("Writing candidate requestedAt differs from the exact handoff request.");
  const maximumOutputCharacters = readInteger(source.maximumOutputCharacters, "maximumOutputCharacters", blockers, 1_000, MAX_CANDIDATE_BYTES);
  const maximumOutputTokens = readInteger(source.maximumOutputTokens, "maximumOutputTokens", blockers, 1, 100_000);
  const timeoutMilliseconds = readInteger(source.timeoutMilliseconds, "timeoutMilliseconds", blockers, 1_000, 600_000);

  if (handoffRequest) {
    const blockIds = contextBlocks.map((block) => block.objectId);
    if (!sameOrder(blockIds, handoffRequest.contextObjectIds)) blockers.push("Writing candidate context IDs differ from the exact handoff request order or coverage.");
    for (let index = 0; index < contextBlocks.length; index += 1) {
      const block = contextBlocks[index];
      if (block && block.objectFingerprint !== handoffRequest.contextObjectFingerprints[index]) blockers.push(`Writing candidate context fingerprint differs for ${block.objectId}.`);
    }
  }
  const roles = new Set(contextBlocks.map((block) => block.role));
  if (!roles.has("target_manuscript")) blockers.push("Writing candidate context requires target_manuscript evidence.");
  if (!roles.has("voice")) blockers.push("Writing candidate context requires project-owned voice evidence.");
  const aggregateCharacters = contextBlocks.reduce((total, block) => total + block.text.length, 0)
    + prompt.systemInstruction.length + prompt.taskInstruction.length + prompt.responseInstruction.length;
  if (aggregateCharacters > MAX_CONTEXT_CHARACTERS) blockers.push(`Writing candidate input exceeds ${MAX_CONTEXT_CHARACTERS} aggregate characters.`);

  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length || !packet || !handoffRequest) return compilation("blocked", undefined, uniqueBlockers, warnings);
  const unsigned: Omit<BookWritingCandidateRuntimeRequestV1, "runtimeRequestFingerprint"> = {
    outputKind: "evavo_docs_book_candidate_runtime_request",
    schemaVersion: BOOK_WRITING_CANDIDATE_SCHEMA_VERSION,
    contract: BOOK_WRITING_CANDIDATE_CONTRACT,
    handoffRequest,
    requestedProvider,
    modelName,
    responseMode,
    prompt,
    contextBlocks,
    maximumOutputCharacters,
    maximumOutputTokens,
    timeoutMilliseconds,
    idempotencyKey: `book-candidate:${handoffRequest.requestFingerprint.slice("sha256:".length)}`,
    requestedAt,
    providerCallAllowed: true,
    providerRetryAllowed: false,
    writingStudioMayMutateManuscript: false,
    canonicalAdmissionAllowed: false,
    remoteBookStateWriteAllowed: false,
    artStudioCallAllowed: false,
    publicationPerformed: false,
  };
  const runtimeRequestFingerprint = await fingerprintBookWritingCandidateRuntimeRequest(unsigned);
  const runtimeRequest: BookWritingCandidateRuntimeRequestV1 = { ...unsigned, runtimeRequestFingerprint };
  return compilation("ready", runtimeRequest, [], warnings);
}

export async function validateBookWritingCandidateRuntimeResult(
  packetInput: unknown,
  requestInput: unknown,
  resultInput: unknown,
): Promise<BookWritingCandidateCoordinationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const compilation = await compileBookWritingCandidateRuntimeRequest(requestInput);
  if (compilation.status !== "ready" || !compilation.runtimeRequest) {
    return coordination("blocked", undefined, undefined, undefined, compilation.blockers, compilation.warnings, false);
  }
  const request = compilation.runtimeRequest;
  const source = object(resultInput, "Writing candidate runtime result", blockers);
  rejectUnknown(source, new Set([
    "outputKind", "schemaVersion", "contract", "status", "runtimeRequestFingerprint", "handoffResponse",
    "candidateText", "storageReceipt", "providerRequestId", "providerStopReason", "providerAttemptCount",
    "providerCalled", "blockers", "warnings", "completedAt", "resultFingerprint", "candidateEvidenceStored",
    "authoritativeBookStateWritePerformed", "canonicalManuscriptMutationPerformed", "artStudioCalled",
    "publicationPerformed",
  ]), "Writing candidate runtime result", blockers);
  checkLiteral(source.outputKind, "evavo_docs_book_candidate_runtime_result", "result outputKind", blockers);
  checkLiteral(source.schemaVersion, 1, "result schemaVersion", blockers);
  checkLiteral(source.contract, BOOK_WRITING_CANDIDATE_CONTRACT, "result contract", blockers);
  checkLiteral(source.runtimeRequestFingerprint, request.runtimeRequestFingerprint, "runtimeRequestFingerprint", blockers);
  checkLiteral(source.authoritativeBookStateWritePerformed, false, "authoritativeBookStateWritePerformed", blockers);
  checkLiteral(source.canonicalManuscriptMutationPerformed, false, "canonicalManuscriptMutationPerformed", blockers);
  checkLiteral(source.artStudioCalled, false, "artStudioCalled", blockers);
  checkLiteral(source.publicationPerformed, false, "publicationPerformed", blockers);
  if (source.candidateText !== null) blockers.push("Writing Studio candidate prose must remain in immutable candidate storage rather than crossing the Docs Suite API response.");

  const status = readRuntimeStatus(source.status, blockers);
  const providerRequestId = readOptionalText(source.providerRequestId, "providerRequestId", blockers, 500) ?? "";
  const providerStopReason = readStopReason(source.providerStopReason, blockers);
  const providerAttemptCount = readInteger(source.providerAttemptCount, "providerAttemptCount", blockers, 0, 1) as 0 | 1;
  const providerCalled = readBoolean(source.providerCalled, "providerCalled", blockers);
  if (providerCalled !== (providerAttemptCount === 1)) blockers.push("providerCalled and providerAttemptCount disagree.");
  if (status !== "blocked" && (!providerCalled || !providerRequestId)) blockers.push("Candidate-bearing runtime results require one exact provider request identity.");
  const resultBlockers = readTextArray(source.blockers, "result blockers", blockers, 256, 2_000);
  const resultWarnings = readTextArray(source.warnings, "result warnings", blockers, 256, 2_000);
  const completedAt = readTimestamp(source.completedAt, "completedAt", blockers);
  const candidateEvidenceStored = readBoolean(source.candidateEvidenceStored, "candidateEvidenceStored", blockers);
  const storageReceipt = source.storageReceipt === undefined ? undefined : await parseStorageReceipt(source.storageReceipt, blockers);
  if (candidateEvidenceStored !== (storageReceipt !== undefined)) blockers.push("candidateEvidenceStored must match storageReceipt presence.");

  const handoffValidation = await validateBookWritingHandoffResponse(packetInput, request.handoffRequest, source.handoffResponse);
  if (handoffValidation.status === "blocked" || !handoffValidation.response) blockers.push("Writing candidate runtime returned an invalid handoff response.", ...handoffValidation.blockers);
  const handoffResponse = handoffValidation.response;
  if (handoffResponse) {
    if (handoffResponse.provider !== request.requestedProvider || handoffResponse.modelName !== request.modelName) blockers.push("Writing candidate handoff response provider or model differs from the exact runtime request.");
    if (storageReceipt) {
      if (handoffResponse.candidateObjectId !== storageReceipt.objectId || handoffResponse.candidateSha256 !== storageReceipt.candidateSha256 || handoffResponse.candidateByteLength !== storageReceipt.candidateByteLength) blockers.push("Writing candidate storage receipt differs from the handoff candidate identity.");
    }
    const expectedHandoffStatus = status === "completed" ? "complete" : status === "partial" ? "partial" : status === "needs_work" ? "needs_work" : "blocked";
    if (handoffResponse.status !== expectedHandoffStatus) blockers.push("Writing candidate runtime and handoff response statuses disagree.");
  }
  if (["completed", "partial", "needs_work"].includes(status) && !storageReceipt) blockers.push("Candidate-bearing runtime results require immutable candidate evidence.");
  if (status === "partial" && !["maximum_output_tokens", "provider_pause"].includes(providerStopReason)) warnings.push("Partial candidate result did not report a provider token limit or pause.");
  if (status === "completed" && providerStopReason !== "completed") blockers.push("Completed candidate result requires providerStopReason completed.");

  const resultFingerprint = readDigest(source.resultFingerprint, "resultFingerprint", blockers);
  const normalized: Omit<BookWritingCandidateRuntimeResultV1, "resultFingerprint"> = {
    outputKind: "evavo_docs_book_candidate_runtime_result",
    schemaVersion: 1,
    contract: BOOK_WRITING_CANDIDATE_CONTRACT,
    status,
    runtimeRequestFingerprint: request.runtimeRequestFingerprint,
    handoffResponse: handoffResponse ?? blockedHandoffResponse(request, completedAt),
    candidateText: null,
    ...(storageReceipt === undefined ? {} : { storageReceipt }),
    providerRequestId,
    providerStopReason,
    providerAttemptCount,
    providerCalled,
    blockers: resultBlockers,
    warnings: resultWarnings,
    completedAt,
    candidateEvidenceStored,
    authoritativeBookStateWritePerformed: false,
    canonicalManuscriptMutationPerformed: false,
    artStudioCalled: false,
    publicationPerformed: false,
  };
  const expectedFingerprint = await fingerprintBookWritingCandidateRuntimeResult(normalized);
  if (resultFingerprint !== expectedFingerprint) blockers.push("Writing candidate runtime result fingerprint differs from its exact canonical contents.");
  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length || !handoffResponse) return coordination("blocked", request, undefined, handoffValidation, uniqueBlockers, unique([...warnings, ...resultWarnings]), providerCalled);
  const runtimeResult: BookWritingCandidateRuntimeResultV1 = { ...normalized, resultFingerprint };
  const finalStatus: BookWritingCandidateCoordinationResultV1["status"] = status === "completed" && handoffValidation.status === "ready"
    ? "ready_for_authoring_result_validation"
    : status === "partial" || handoffValidation.status === "continuation_required"
      ? "continuation_required"
      : status === "needs_work" || handoffValidation.status === "needs_work"
        ? "needs_work"
        : "blocked";
  return coordination(finalStatus, request, runtimeResult, handoffValidation, resultBlockers, unique([...warnings, ...resultWarnings]), providerCalled);
}

export async function fingerprintBookWritingCandidatePrompt(
  value: Omit<BookWritingCandidatePromptV1, "promptFingerprint"> | BookWritingCandidatePromptV1,
): Promise<string> {
  const { promptFingerprint: _discarded, ...unsigned } = value as BookWritingCandidatePromptV1;
  return sha256BookText(canonicalBookJson(unsigned));
}

export async function fingerprintBookWritingCandidateRuntimeRequest(
  value: Omit<BookWritingCandidateRuntimeRequestV1, "runtimeRequestFingerprint"> | BookWritingCandidateRuntimeRequestV1,
): Promise<string> {
  const { runtimeRequestFingerprint: _discarded, ...unsigned } = value as BookWritingCandidateRuntimeRequestV1;
  return sha256BookText(canonicalBookJson({
    ...unsigned,
    contextBlocks: [...unsigned.contextBlocks].sort((left, right) => left.objectId.localeCompare(right.objectId)),
  }));
}

export async function fingerprintBookWritingCandidateStorageReceipt(
  value: Omit<BookWritingCandidateStorageReceiptV1, "storageReceiptFingerprint"> | BookWritingCandidateStorageReceiptV1,
): Promise<string> {
  const { storageReceiptFingerprint: _discarded, ...unsigned } = value as BookWritingCandidateStorageReceiptV1;
  return sha256BookText(canonicalBookJson(unsigned));
}

export async function fingerprintBookWritingCandidateRuntimeResult(
  value: Omit<BookWritingCandidateRuntimeResultV1, "resultFingerprint"> | BookWritingCandidateRuntimeResultV1,
): Promise<string> {
  const { resultFingerprint: _discarded, ...unsigned } = value as BookWritingCandidateRuntimeResultV1;
  return sha256BookText(canonicalBookJson(unsigned));
}

async function parsePrompt(value: unknown, blockers: string[]): Promise<BookWritingCandidatePromptV1> {
  const source = object(value, "Writing candidate prompt", blockers);
  rejectUnknown(source, new Set(["systemInstruction", "taskInstruction", "responseInstruction"]), "Writing candidate prompt", blockers);
  const unsigned = {
    systemInstruction: readText(source.systemInstruction, "prompt systemInstruction", blockers, 120_000),
    taskInstruction: readText(source.taskInstruction, "prompt taskInstruction", blockers, 500_000),
    responseInstruction: readText(source.responseInstruction, "prompt responseInstruction", blockers, 120_000),
  };
  return { ...unsigned, promptFingerprint: await fingerprintBookWritingCandidatePrompt(unsigned) };
}

async function parseContextBlocks(value: unknown, blockers: string[]): Promise<BookWritingCandidateContextBlockV1[]> {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CONTEXT_BLOCKS) {
    blockers.push(`contextBlocks must contain 1-${MAX_CONTEXT_BLOCKS} entries.`);
    return [];
  }
  const blocks: BookWritingCandidateContextBlockV1[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const source = object(value[index], `contextBlocks[${index}]`, blockers);
    rejectUnknown(source, new Set(["objectId", "objectFingerprint", "role", "text"]), `contextBlocks[${index}]`, blockers);
    const text = readText(source.text, `contextBlocks[${index}].text`, blockers, 500_000);
    blocks.push({
      objectId: readId(source.objectId, `contextBlocks[${index}].objectId`, blockers),
      objectFingerprint: readDigest(source.objectFingerprint, `contextBlocks[${index}].objectFingerprint`, blockers),
      role: readContextRole(source.role, `contextBlocks[${index}].role`, blockers),
      text,
      textSha256: await sha256BookText(text),
    });
  }
  const sorted = [...blocks].sort((left, right) => left.objectId.localeCompare(right.objectId));
  if (new Set(sorted.map((block) => block.objectId)).size !== sorted.length) blockers.push("contextBlocks contain duplicate object IDs.");
  return sorted;
}

async function parseStorageReceipt(value: unknown, blockers: string[]): Promise<BookWritingCandidateStorageReceiptV1> {
  const source = object(value, "Writing candidate storage receipt", blockers);
  rejectUnknown(source, new Set(["disposition", "objectId", "candidateSha256", "candidateByteLength", "storedAt", "storageReceiptFingerprint"]), "Writing candidate storage receipt", blockers);
  const disposition = source.disposition === "written" || source.disposition === "idempotent_replay" ? source.disposition : "written";
  if (source.disposition !== disposition) blockers.push("Writing candidate storage receipt disposition is invalid.");
  const unsigned = {
    disposition,
    objectId: readId(source.objectId, "storage receipt objectId", blockers),
    candidateSha256: readDigest(source.candidateSha256, "storage receipt candidateSha256", blockers),
    candidateByteLength: readInteger(source.candidateByteLength, "storage receipt candidateByteLength", blockers, 1, MAX_CANDIDATE_BYTES),
    storedAt: readTimestamp(source.storedAt, "storage receipt storedAt", blockers),
  };
  const storageReceiptFingerprint = readDigest(source.storageReceiptFingerprint, "storageReceiptFingerprint", blockers);
  const expected = await fingerprintBookWritingCandidateStorageReceipt(unsigned);
  if (storageReceiptFingerprint !== expected) blockers.push("Writing candidate storage receipt fingerprint differs from its exact canonical contents.");
  return { ...unsigned, storageReceiptFingerprint };
}

function blockedHandoffResponse(request: BookWritingCandidateRuntimeRequestV1, completedAt: string): BookWritingCandidateRuntimeResultV1["handoffResponse"] {
  return {
    outputKind: "evavo_docs_writing_handoff_response", schemaVersion: 1, contract: "evavo_docs_writing_handoff_v1",
    requestId: request.handoffRequest.requestId, requestFingerprint: request.handoffRequest.requestFingerprint,
    packetId: request.handoffRequest.packetId, packetFingerprint: request.handoffRequest.packetFingerprint,
    provider: request.requestedProvider, modelName: request.modelName, status: "blocked", voiceEvidenceIds: [],
    factEvidenceIds: [], qualityReceiptIds: [], unresolvedRiskIds: ["writing-candidate-runtime-blocked"],
    continuationRequired: false, completedAt, responseFingerprint: `sha256:${"0".repeat(64)}`,
    writingStudioMayMutateManuscript: false, canonicalAdmissionAllowed: false, publicationPerformed: false,
  };
}

function compilation(status: "ready" | "blocked", runtimeRequest: BookWritingCandidateRuntimeRequestV1 | undefined, blockers: string[], warnings: string[]): BookWritingCandidateCompilationResultV1 {
  return {
    outputKind: "evavo_docs_book_writing_candidate_compilation", schemaVersion: 1, status,
    ...(runtimeRequest === undefined ? {} : { runtimeRequest, runtimeRequestFingerprint: runtimeRequest.runtimeRequestFingerprint }),
    blockers: unique(blockers), warnings: unique(warnings), providerCalled: false,
    authoritativeBookStateWritePerformed: false, canonicalManuscriptMutationPerformed: false,
    artStudioCalled: false, publicationPerformed: false,
  };
}

function coordination(
  status: BookWritingCandidateCoordinationResultV1["status"],
  runtimeRequest: BookWritingCandidateRuntimeRequestV1 | undefined,
  runtimeResult: BookWritingCandidateRuntimeResultV1 | undefined,
  handoffValidation: BookWritingCandidateCoordinationResultV1["handoffValidation"] | undefined,
  blockers: string[], warnings: string[], providerCalled: boolean,
): BookWritingCandidateCoordinationResultV1 {
  return {
    outputKind: "evavo_docs_book_writing_candidate_coordination", schemaVersion: 1, status,
    ...(runtimeRequest === undefined ? {} : { runtimeRequest }),
    ...(runtimeResult === undefined ? {} : { runtimeResult }),
    ...(handoffValidation === undefined ? {} : { handoffValidation }),
    blockers: unique(blockers), warnings: unique(warnings), providerCalled,
    authoritativeBookStateWritePerformed: false, canonicalManuscriptMutationPerformed: false,
    artStudioCalled: false, publicationPerformed: false,
  };
}

function responseModeForProvider(provider: BookAuthoringPacketV1["provider"]): BookWritingCandidateResponseMode {
  return provider === "chatgpt" ? "strict_json_schema" : provider === "claude" ? "forced_single_tool" : "adapter_structured_output";
}
function readProvider(value: unknown, label: string, blockers: string[]): BookAuthoringPacketV1["provider"] {
  if (value !== "chatgpt" && value !== "claude" && value !== "other_compatible_model") { blockers.push(`${label} is unsupported.`); return "other_compatible_model"; }
  return value;
}
function readContextRole(value: unknown, label: string, blockers: string[]): BookWritingCandidateContextRole {
  if (typeof value !== "string" || !CONTEXT_ROLES.has(value as BookWritingCandidateContextRole)) { blockers.push(`${label} is unsupported.`); return "other"; }
  return value as BookWritingCandidateContextRole;
}
function readStopReason(value: unknown, blockers: string[]): BookWritingCandidateStopReason {
  if (typeof value !== "string" || !STOP_REASONS.has(value as BookWritingCandidateStopReason)) { blockers.push("providerStopReason is unsupported."); return "unknown"; }
  return value as BookWritingCandidateStopReason;
}
function readRuntimeStatus(value: unknown, blockers: string[]): BookWritingCandidateRuntimeResultV1["status"] {
  if (value !== "completed" && value !== "partial" && value !== "needs_work" && value !== "blocked") { blockers.push("Writing candidate runtime status is unsupported."); return "blocked"; }
  return value;
}
function readId(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SAFE_ID.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) { blockers.push(`${label} is invalid.`); return "invalid-id"; }
  return value;
}
function readDigest(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SHA256.test(value)) { blockers.push(`${label} must be an exact sha256 digest.`); return `sha256:${"0".repeat(64)}`; }
  return value;
}
function readTimestamp(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) { blockers.push(`${label} must be canonical UTC ISO-8601.`); return "1970-01-01T00:00:00.000Z"; }
  return value;
}
function readInteger(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) { blockers.push(`${label} must be an integer from ${minimum} to ${maximum}.`); return minimum; }
  return Number(value);
}
function readBoolean(value: unknown, label: string, blockers: string[]): boolean {
  if (value !== true && value !== false) { blockers.push(`${label} must be boolean.`); return false; }
  return value;
}
function readText(value: unknown, label: string, blockers: string[], maximum: number): string {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) { blockers.push(`${label} is invalid or unbounded.`); return "invalid"; }
  return value;
}
function readOptionalText(value: unknown, label: string, blockers: string[], maximum: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return readText(value, label, blockers, maximum);
}
function readTextArray(value: unknown, label: string, blockers: string[], maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) { blockers.push(`${label} is invalid or unbounded.`); return []; }
  const result = value.map((item) => readText(item, label, blockers, maximumLength));
  if (new Set(result).size !== result.length) blockers.push(`${label} contains duplicates.`);
  return unique(result);
}
function checkLiteral(value: unknown, expected: unknown, label: string, blockers: string[]): void { if (value !== expected) blockers.push(`${label} is invalid.`); }
function sameOrder(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
