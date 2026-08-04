import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";
import type { BookAuthoringPacketV1 } from "./book-studio-authoring-types";
import { validateAndNormalizeBookAuthoringPacket } from "./book-studio-authoring-packet";
import {
  BOOK_WRITING_HANDOFF_CONTRACT,
  type BookWritingHandoffRequestV1,
  type BookWritingHandoffValidationResultV1,
} from "./book-studio-writing-handoff-types";
import {
  validation,
  object,
  rejectUnknown,
  checkLiteral,
  id,
  enumIds,
  digest,
  ids,
  digests,
  timestamp,
  unique,
} from "./book-studio-writing-handoff-shared";

export async function compileBookWritingHandoffRequest(
  packetInput: unknown,
  input: Omit<BookWritingHandoffRequestV1,
    "outputKind" | "schemaVersion" | "contract" | "packetId" | "packetFingerprint" | "projectId" |
    "volumeId" | "manuscriptRevisionId" | "operation" | "requestFingerprint" |
    "crossRepositoryRuntimeImportAllowed" | "writingStudioMayMutateManuscript" |
    "automaticCanonicalAdmissionAllowed" | "remoteWritesAllowed" | "publicationPerformed">,
): Promise<BookWritingHandoffValidationResultV1> {
  const packetValidation = await validateAndNormalizeBookAuthoringPacket(packetInput);
  if (packetValidation.status !== "ready" || !packetValidation.packet) {
    return validation("blocked", undefined, undefined, [
      "Writing handoff requires a valid authoring packet.",
      ...packetValidation.blockers,
    ], []);
  }
  const packet = packetValidation.packet;
  const blockers: string[] = [];
  const requestId = id(input.requestId, "requestId", blockers);
  const allowedProviderIds = enumIds(input.allowedProviderIds, "allowedProviderIds", blockers);
  if (!allowedProviderIds.includes(packet.provider)) blockers.push("Writing handoff provider set does not include the packet provider.");
  const providerPolicyFingerprint = digest(input.providerPolicyFingerprint, "providerPolicyFingerprint", blockers);
  const voiceProfileId = id(input.voiceProfileId, "voiceProfileId", blockers);
  const voiceProfileFingerprint = digest(input.voiceProfileFingerprint, "voiceProfileFingerprint", blockers);
  const factSetFingerprint = digest(input.factSetFingerprint, "factSetFingerprint", blockers);
  const contextObjectIds = ids(input.contextObjectIds, "contextObjectIds", blockers, 8_192, true);
  const contextObjectFingerprints = digests(input.contextObjectFingerprints, "contextObjectFingerprints", blockers, 8_192, true);
  if (contextObjectIds.length !== contextObjectFingerprints.length) blockers.push("Writing handoff context object IDs and fingerprints must have the same length.");
  const requiredEvidenceIds = ids(input.requiredEvidenceIds, "requiredEvidenceIds", blockers, 16_384, true);
  const outputContractFingerprint = digest(input.outputContractFingerprint, "outputContractFingerprint", blockers);
  const requestedAt = timestamp(input.requestedAt, "requestedAt", blockers);
  const expiresAt = timestamp(input.expiresAt, "expiresAt", blockers);
  if (Date.parse(expiresAt) <= Date.parse(requestedAt)) blockers.push("Writing handoff expiresAt must be later than requestedAt.");
  if (Date.parse(expiresAt) - Date.parse(requestedAt) > 24 * 60 * 60 * 1_000) blockers.push("Writing handoff lifetime cannot exceed 24 hours.");
  if (blockers.length) return validation("blocked", undefined, undefined, unique(blockers), []);
  const unsigned: Omit<BookWritingHandoffRequestV1, "requestFingerprint"> = {
    outputKind: "evavo_docs_writing_handoff_request",
    schemaVersion: 1,
    contract: BOOK_WRITING_HANDOFF_CONTRACT,
    requestId,
    packetId: packet.packetId,
    packetFingerprint: packet.packetFingerprint,
    projectId: packet.projectId,
    volumeId: packet.volumeId,
    manuscriptRevisionId: packet.manuscriptRevisionId,
    operation: packet.operation,
    allowedProviderIds,
    providerPolicyFingerprint,
    voiceProfileId,
    voiceProfileFingerprint,
    factSetFingerprint,
    contextObjectIds,
    contextObjectFingerprints,
    requiredEvidenceIds,
    outputContractFingerprint,
    requestedAt,
    expiresAt,
    crossRepositoryRuntimeImportAllowed: false,
    writingStudioMayMutateManuscript: false,
    automaticCanonicalAdmissionAllowed: false,
    remoteWritesAllowed: false,
    publicationPerformed: false,
  };
  const request: BookWritingHandoffRequestV1 = {
    ...unsigned,
    requestFingerprint: await fingerprintBookWritingHandoffRequest(unsigned),
  };
  return validation("ready", request, undefined, [], []);
}

export async function normalizeBookWritingHandoffRequest(
  value: unknown,
  packet: BookAuthoringPacketV1,
  blockers: string[],
): Promise<BookWritingHandoffRequestV1 | undefined> {
  const source = object(value, "Writing handoff request", blockers);
  const allowed = new Set([
    "outputKind", "schemaVersion", "contract", "requestId", "packetId", "packetFingerprint", "projectId", "volumeId",
    "manuscriptRevisionId", "operation", "allowedProviderIds", "providerPolicyFingerprint", "voiceProfileId",
    "voiceProfileFingerprint", "factSetFingerprint", "contextObjectIds", "contextObjectFingerprints", "requiredEvidenceIds",
    "outputContractFingerprint", "requestedAt", "expiresAt", "requestFingerprint", "crossRepositoryRuntimeImportAllowed",
    "writingStudioMayMutateManuscript", "automaticCanonicalAdmissionAllowed", "remoteWritesAllowed", "publicationPerformed",
  ]);
  rejectUnknown(source, allowed, "Writing handoff request", blockers);
  checkLiteral(source.outputKind, "evavo_docs_writing_handoff_request", "request outputKind", blockers);
  checkLiteral(source.schemaVersion, 1, "request schemaVersion", blockers);
  checkLiteral(source.contract, BOOK_WRITING_HANDOFF_CONTRACT, "request contract", blockers);
  if (source.packetId !== packet.packetId || source.packetFingerprint !== packet.packetFingerprint) blockers.push("Writing request packet identity does not match the authoring packet.");
  if (source.projectId !== packet.projectId || source.volumeId !== packet.volumeId || source.manuscriptRevisionId !== packet.manuscriptRevisionId || source.operation !== packet.operation) blockers.push("Writing request book identity or operation does not match the authoring packet.");
  if (
    source.crossRepositoryRuntimeImportAllowed !== false
    || source.writingStudioMayMutateManuscript !== false
    || source.automaticCanonicalAdmissionAllowed !== false
    || source.remoteWritesAllowed !== false
    || source.publicationPerformed !== false
  ) blockers.push("Writing request authority flags are invalid.");
  const requestId = id(source.requestId, "requestId", blockers);
  const allowedProviderIds = enumIds(source.allowedProviderIds, "allowedProviderIds", blockers);
  const providerPolicyFingerprint = digest(source.providerPolicyFingerprint, "providerPolicyFingerprint", blockers);
  const voiceProfileId = id(source.voiceProfileId, "voiceProfileId", blockers);
  const voiceProfileFingerprint = digest(source.voiceProfileFingerprint, "voiceProfileFingerprint", blockers);
  const factSetFingerprint = digest(source.factSetFingerprint, "factSetFingerprint", blockers);
  const contextObjectIds = ids(source.contextObjectIds, "contextObjectIds", blockers, 8_192, true);
  const contextObjectFingerprints = digests(source.contextObjectFingerprints, "contextObjectFingerprints", blockers, 8_192, true);
  if (contextObjectIds.length !== contextObjectFingerprints.length) blockers.push("Writing request context object IDs and fingerprints differ in length.");
  const requiredEvidenceIds = ids(source.requiredEvidenceIds, "requiredEvidenceIds", blockers, 16_384, true);
  const outputContractFingerprint = digest(source.outputContractFingerprint, "outputContractFingerprint", blockers);
  const requestedAt = timestamp(source.requestedAt, "requestedAt", blockers);
  const expiresAt = timestamp(source.expiresAt, "expiresAt", blockers);
  if (!allowedProviderIds.includes(packet.provider)) blockers.push("Writing request does not allow the packet provider.");
  if (blockers.length) return undefined;
  const unsigned: Omit<BookWritingHandoffRequestV1, "requestFingerprint"> = {
    outputKind: "evavo_docs_writing_handoff_request",
    schemaVersion: 1,
    contract: BOOK_WRITING_HANDOFF_CONTRACT,
    requestId,
    packetId: packet.packetId,
    packetFingerprint: packet.packetFingerprint,
    projectId: packet.projectId,
    volumeId: packet.volumeId,
    manuscriptRevisionId: packet.manuscriptRevisionId,
    operation: packet.operation,
    allowedProviderIds,
    providerPolicyFingerprint,
    voiceProfileId,
    voiceProfileFingerprint,
    factSetFingerprint,
    contextObjectIds,
    contextObjectFingerprints,
    requiredEvidenceIds,
    outputContractFingerprint,
    requestedAt,
    expiresAt,
    crossRepositoryRuntimeImportAllowed: false,
    writingStudioMayMutateManuscript: false,
    automaticCanonicalAdmissionAllowed: false,
    remoteWritesAllowed: false,
    publicationPerformed: false,
  };
  const fingerprint = await fingerprintBookWritingHandoffRequest(unsigned);
  if (source.requestFingerprint !== fingerprint) blockers.push("Writing request fingerprint differs from exact canonical request.");
  if (blockers.length) return undefined;
  return { ...unsigned, requestFingerprint: fingerprint };
}

export async function fingerprintBookWritingHandoffRequest(
  value: Omit<BookWritingHandoffRequestV1, "requestFingerprint"> | BookWritingHandoffRequestV1,
): Promise<string> {
  const { requestFingerprint: _discarded, ...unsigned } = value as BookWritingHandoffRequestV1;
  return sha256BookText(canonicalBookJson(unsigned));
}
