import {
  BOOK_AUTHORING_CONTRACT,
  type BookAuthoringPacketV1,
  type BookAuthoringPacketValidationResultV1,
} from "./book-studio-authoring-types";
import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";

const SHA256 = /^sha256:[a-f0-9]{64}$/;

export async function validateAndNormalizeBookAuthoringPacket(
  value: unknown,
): Promise<BookAuthoringPacketValidationResultV1> {
  const blockers: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return blocked(["Book authoring packet must be an object."]);
  }
  const source = value as Record<string, unknown>;
  if (
    source.outputKind !== "evavo_docs_book_authoring_packet"
    || source.schemaVersion !== 1
    || source.contract !== BOOK_AUTHORING_CONTRACT
    || source.authorityMode !== "shadow_migration"
  ) blockers.push("Book authoring packet identity is invalid.");
  for (const key of [
    "providerMayMutateCanonicalState",
    "automaticCanonicalAdmissionAllowed",
    "dualAuthoritativeWritesAllowed",
    "runtimeCutoverApproved",
    "publicationPerformed",
  ]) if (source[key] !== false) blockers.push(`Book authoring packet ${key} must remain false.`);
  if (source.websiteCompatibilityRuntimeStillAuthoritative !== true) {
    blockers.push("Book authoring packet compatibility authority is invalid.");
  }
  for (const key of [
    "packetId", "projectId", "programmeId", "volumeId", "manuscriptRevisionId",
    "executionTaskId", "modelName", "checkpointId", "idempotencyKey",
  ]) if (typeof source[key] !== "string" || !(source[key] as string).length) {
    blockers.push(`Book authoring packet ${key} is invalid.`);
  }
  for (const key of [
    "manuscriptSha256", "projectFingerprint", "storyStateFingerprint", "taskFingerprint",
    "responseContractFingerprint", "checkpointFingerprint",
  ]) if (typeof source[key] !== "string" || !SHA256.test(source[key] as string)) {
    blockers.push(`Book authoring packet ${key} is invalid.`);
  }
  for (const key of [
    "targetUnitIds", "readOnlyUnitIds", "expectedChangedUnitIds", "allowedActionIds",
    "prohibitedActionIds", "requiredOutputStateIds", "contextEvidenceIds",
    "projectVoiceAnchorIds", "factClaimIds", "researchClaimIds", "narrativeConstraintIds",
    "acceptedPatternIds", "rejectedPatternIds", "unresolvedIssueIds", "unresolvedResearchIds",
    "remainingUnitIds",
  ]) if (!Array.isArray(source[key])) blockers.push(`Book authoring packet ${key} is invalid.`);
  if (source.provider !== "chatgpt" && source.provider !== "claude" && source.provider !== "other_compatible_model") {
    blockers.push("Book authoring packet provider is invalid.");
  }
  if (typeof source.operation !== "string") blockers.push("Book authoring packet operation is invalid.");
  if (!Number.isSafeInteger(source.maximumOutputCharacters)) blockers.push("Book authoring packet maximumOutputCharacters is invalid.");

  const { packetFingerprint: declared, ...unsigned } = source;
  const packetFingerprint = await sha256BookText(canonicalBookJson(unsigned));
  if (declared !== undefined && declared !== packetFingerprint) {
    blockers.push("Book authoring packet fingerprint differs from exact contents.");
  }
  if (blockers.length) return blocked([...new Set(blockers)]);
  const packet = { ...unsigned, packetFingerprint } as unknown as BookAuthoringPacketV1;
  return {
    outputKind: "evavo_docs_book_authoring_packet_validation",
    schemaVersion: 1,
    status: "ready",
    packet,
    packetFingerprint,
    blockers: [],
    warnings: [],
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
}

function blocked(blockers: string[]): BookAuthoringPacketValidationResultV1 {
  return {
    outputKind: "evavo_docs_book_authoring_packet_validation",
    schemaVersion: 1,
    status: "blocked",
    blockers,
    warnings: [],
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
}
