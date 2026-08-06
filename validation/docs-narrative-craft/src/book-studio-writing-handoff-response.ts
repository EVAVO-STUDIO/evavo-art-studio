import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";
import { BOOK_WRITING_HANDOFF_CONTRACT, type BookWritingHandoffRequestV1, type BookWritingHandoffResponseV1, type BookWritingHandoffValidationResultV1 } from "./book-studio-writing-handoff-types";
import { validateAndNormalizeBookAuthoringPacket } from "./book-studio-authoring-packet";
import { normalizeBookWritingHandoffRequest } from "./book-studio-writing-handoff-request";
import { PROVIDERS, SHA256, validation, object, rejectUnknown, checkLiteral, optionalId, ids, enumValue, text, optionalDigest, optionalInteger, bool, timestamp, unique } from "./book-studio-writing-handoff-shared";

export async function validateBookWritingHandoffResponse(
  packetInput: unknown,
  requestInput: unknown,
  responseInput: unknown,
): Promise<BookWritingHandoffValidationResultV1> {
  const packetValidation = await validateAndNormalizeBookAuthoringPacket(packetInput);
  const blockers: string[] = [];
  const requiredActions: string[] = [];
  if (packetValidation.status !== "ready" || !packetValidation.packet) {
    return validation("blocked", undefined, undefined, ["Writing response requires a valid authoring packet.", ...packetValidation.blockers], []);
  }
  const request = await normalizeBookWritingHandoffRequest(requestInput, packetValidation.packet, blockers);
  const responseSource = object(responseInput, "Writing handoff response", blockers);
  const allowed = new Set([
    "outputKind", "schemaVersion", "contract", "requestId", "requestFingerprint", "packetId", "packetFingerprint",
    "provider", "modelName", "status", "candidateObjectId", "candidateSha256", "candidateByteLength",
    "voiceEvidenceIds", "factEvidenceIds", "qualityReceiptIds", "unresolvedRiskIds", "continuationRequired",
    "exactPartialTailSha256", "completedAt", "responseFingerprint", "writingStudioMayMutateManuscript",
    "canonicalAdmissionAllowed", "publicationPerformed",
  ]);
  rejectUnknown(responseSource, allowed, "Writing handoff response", blockers);
  checkLiteral(responseSource.outputKind, "evavo_docs_writing_handoff_response", "response outputKind", blockers);
  checkLiteral(responseSource.schemaVersion, 1, "response schemaVersion", blockers);
  checkLiteral(responseSource.contract, BOOK_WRITING_HANDOFF_CONTRACT, "response contract", blockers);
  if (request) {
    if (responseSource.requestId !== request.requestId) blockers.push("Writing response requestId does not match the exact request.");
    if (responseSource.requestFingerprint !== request.requestFingerprint) blockers.push("Writing response requestFingerprint does not match the exact request.");
    if (responseSource.packetId !== request.packetId || responseSource.packetFingerprint !== request.packetFingerprint) blockers.push("Writing response packet identity does not match the request.");
  }
  const provider = enumValue(responseSource.provider, PROVIDERS, "response provider", blockers, "other_compatible_model");
  if (request && !request.allowedProviderIds.includes(provider)) blockers.push("Writing response provider is not allowed by the request.");
  const modelName = text(responseSource.modelName, "response modelName", blockers, 300);
  const status = enumValue(responseSource.status, new Set(["complete", "partial", "needs_work", "blocked"]), "response status", blockers, "blocked");
  const candidateObjectId = optionalId(responseSource.candidateObjectId, "candidateObjectId", blockers);
  const candidateSha256 = optionalDigest(responseSource.candidateSha256, "candidateSha256", blockers);
  const candidateByteLength = optionalInteger(responseSource.candidateByteLength, "candidateByteLength", blockers, 0, 8_000_000);
  if (["complete", "partial", "needs_work"].includes(status) && (!candidateObjectId || !candidateSha256 || !candidateByteLength)) blockers.push("Candidate-bearing writing responses require object, SHA-256 and byte-length evidence.");
  const voiceEvidenceIds = ids(responseSource.voiceEvidenceIds, "voiceEvidenceIds", blockers, 8_192, status === "complete");
  const factEvidenceIds = ids(responseSource.factEvidenceIds, "factEvidenceIds", blockers, 16_384, false);
  const qualityReceiptIds = ids(responseSource.qualityReceiptIds, "qualityReceiptIds", blockers, 8_192, status === "complete");
  const unresolvedRiskIds = ids(responseSource.unresolvedRiskIds, "unresolvedRiskIds", blockers, 16_384, false);
  const continuationRequired = bool(responseSource.continuationRequired, "continuationRequired", blockers);
  const exactPartialTailSha256 = optionalDigest(responseSource.exactPartialTailSha256, "exactPartialTailSha256", blockers);
  if (status === "partial" && (!continuationRequired || !exactPartialTailSha256)) blockers.push("Partial writing responses require exact continuation evidence.");
  if (status !== "partial" && (continuationRequired || exactPartialTailSha256)) blockers.push("Non-partial writing responses cannot carry continuation evidence.");
  const completedAt = timestamp(responseSource.completedAt, "completedAt", blockers);
  if (request && Date.parse(completedAt) < Date.parse(request.requestedAt)) blockers.push("Writing response completedAt predates the request.");
  if (responseSource.writingStudioMayMutateManuscript !== false || responseSource.canonicalAdmissionAllowed !== false || responseSource.publicationPerformed !== false) blockers.push("Writing response cannot claim manuscript mutation, canonical admission or publication.");
  if (status === "complete" && unresolvedRiskIds.length) requiredActions.push(`Resolve Writing Studio risks before authoring-result validation: ${unresolvedRiskIds.join(", ")}.`);
  if (responseSource.responseFingerprint !== undefined && (typeof responseSource.responseFingerprint !== "string" || !SHA256.test(responseSource.responseFingerprint))) blockers.push("responseFingerprint is invalid.");
  if (blockers.length || !request) return validation("blocked", request, undefined, unique(blockers), requiredActions);
  const unsigned: Omit<BookWritingHandoffResponseV1, "responseFingerprint"> = {
    outputKind: "evavo_docs_writing_handoff_response",
    schemaVersion: 1,
    contract: BOOK_WRITING_HANDOFF_CONTRACT,
    requestId: request.requestId,
    requestFingerprint: request.requestFingerprint,
    packetId: request.packetId,
    packetFingerprint: request.packetFingerprint,
    provider,
    modelName,
    status,
    ...(candidateObjectId === undefined ? {} : { candidateObjectId }),
    ...(candidateSha256 === undefined ? {} : { candidateSha256 }),
    ...(candidateByteLength === undefined ? {} : { candidateByteLength }),
    voiceEvidenceIds,
    factEvidenceIds,
    qualityReceiptIds,
    unresolvedRiskIds,
    continuationRequired,
    ...(exactPartialTailSha256 === undefined ? {} : { exactPartialTailSha256 }),
    completedAt,
    writingStudioMayMutateManuscript: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
  const responseFingerprint = await fingerprintBookWritingHandoffResponse(unsigned);
  if (typeof responseSource.responseFingerprint === "string" && responseSource.responseFingerprint !== responseFingerprint) blockers.push("responseFingerprint differs from exact canonical response.");
  if (blockers.length) return validation("blocked", request, undefined, unique(blockers), requiredActions);
  const response: BookWritingHandoffResponseV1 = { ...unsigned, responseFingerprint };
  const finalStatus: BookWritingHandoffValidationResultV1["status"] = status === "partial"
    ? "continuation_required"
    : status === "complete" && !requiredActions.length
      ? "ready"
      : status === "blocked"
        ? "blocked"
        : "needs_work";
  return validation(finalStatus, request, response, [], requiredActions);
}

export async function fingerprintBookWritingHandoffResponse(value: Omit<BookWritingHandoffResponseV1, "responseFingerprint"> | BookWritingHandoffResponseV1): Promise<string> {
  const { responseFingerprint: _discarded, ...unsigned } = value as BookWritingHandoffResponseV1;
  return sha256BookText(canonicalBookJson(unsigned));
}

