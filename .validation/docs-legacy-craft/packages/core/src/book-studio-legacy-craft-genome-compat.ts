import type {
  EvavoCraftGenomeCompileInput,
  EvavoCraftGenomePolicy,
  EvavoCraftGenomeProviderPacketInput,
  EvavoCraftInfluence,
  EvavoCraftInfluenceProvenance,
  EvavoCraftMechanismObservation,
  EvavoCraftPhraseReference,
} from "./book-studio-legacy-craft-genome-types";
import { compileEvavoCraftGenome } from "./book-studio-legacy-craft-genome-compiler";
import { scanEvavoCraftPhraseOverlap } from "./book-studio-legacy-craft-phrase-overlap";
import { createEvavoCraftGenomeProviderPacket } from "./book-studio-legacy-craft-provider-packet";
import { validateEvavoCraftGenomeProviderResponse } from "./book-studio-legacy-craft-provider-response-validation";
import { cleanCraftIds, sha256CraftText, stableCraftJson } from "./book-studio-legacy-craft-genome-utils";

export const BOOK_LEGACY_CRAFT_GENOME_CONTRACT = "evavo_docs_book_legacy_craft_genome_v1" as const;

export type BookLegacyCraftGenomeOperation =
  | "compile_profile"
  | "create_provider_packet"
  | "validate_provider_response"
  | "scan_phrase_overlap";

export type BookLegacyCraftGenomeRequestedBy =
  | "Website Book Studio craft-genome compatibility route"
  | "EVAVO Docs Suite legacy craft-genome CLI"
  | "EVAVO Docs Suite legacy craft-genome MCP";

export interface BookLegacyCraftGenomeRequestV1 {
  outputKind: "evavo_docs_book_legacy_craft_genome_request";
  schemaVersion: 1;
  contract: typeof BOOK_LEGACY_CRAFT_GENOME_CONTRACT;
  authorityMode: "compatibility_migration";
  requestId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  payload: unknown;
  requestedAt: string;
  requestedBy: BookLegacyCraftGenomeRequestedBy;
  authoritativeWritesAllowed: false;
  providerCallAllowed: false;
  canonicalManuscriptMutationAllowed: false;
  automaticCanonicalAdmissionAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookLegacyCraftGenomeResultV1 {
  outputKind: "evavo_docs_book_legacy_craft_genome_result";
  schemaVersion: 1;
  contract: typeof BOOK_LEGACY_CRAFT_GENOME_CONTRACT;
  status: "completed";
  requestId: string;
  operation: BookLegacyCraftGenomeOperation;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  requestFingerprint: string;
  result: unknown;
  blockers: string[];
  warnings: string[];
  resultFingerprint: string;
  docsSuiteCompatibilityExecutionPerformed: true;
  websiteLocalCraftExecutionPerformed: false;
  legacyWebsiteCraftSourceRetired: true;
  authoritativeWritesPerformed: false;
  providerCalled: false;
  canonicalManuscriptMutationPerformed: false;
  automaticCanonicalAdmissionAllowed: false;
  docsSuiteCanonicalWriterEnabled: false;
  dualAuthoritativeWritesAllowed: false;
  runtimeCutoverApproved: false;
  sourceDeletionApproved: false;
  publicationPerformed: false;
}

interface ParsedLegacyCraftScanInput {
  scanId: string;
  candidateId: string;
  candidateText: string;
  references: EvavoCraftPhraseReference[];
  warningNgram?: number;
  blockingNgram?: number;
}

type ParsedLegacyCraftPayload =
  | { operation: "compile_profile"; compileInput: EvavoCraftGenomeCompileInput }
  | { operation: "create_provider_packet"; compileInput: EvavoCraftGenomeCompileInput; packetInput: Omit<EvavoCraftGenomeProviderPacketInput, "profile"> }
  | { operation: "validate_provider_response"; compileInput: EvavoCraftGenomeCompileInput; packetInput: Omit<EvavoCraftGenomeProviderPacketInput, "profile">; providerResponse: unknown }
  | { operation: "scan_phrase_overlap"; scanInput: ParsedLegacyCraftScanInput };

const REQUEST_KEYS = [
  "outputKind", "schemaVersion", "contract", "authorityMode", "requestId", "sourceRepository",
  "sourceCommit", "payload", "requestedAt", "requestedBy", "authoritativeWritesAllowed",
  "providerCallAllowed", "canonicalManuscriptMutationAllowed", "automaticCanonicalAdmissionAllowed",
  "runtimeCutoverApproved", "publicationPerformed",
] as const;
const REQUESTED_BY = new Set<BookLegacyCraftGenomeRequestedBy>([
  "Website Book Studio craft-genome compatibility route",
  "EVAVO Docs Suite legacy craft-genome CLI",
  "EVAVO Docs Suite legacy craft-genome MCP",
]);
const PROVIDERS = new Set(["chatgpt", "claude", "other_compatible_model"]);
const SOURCE_KINDS = new Set(["public_domain", "licensed", "user_owned", "project_owned", "abstract_profile", "restricted_reference", "synthesized_profile"]);
const RIGHTS_BASES = new Set(["public_domain", "explicit_license", "user_owned", "project_owned", "abstract_observation", "restricted_reference", "derived_abstract_profile"]);
const SPECIFICITIES = new Set(["general", "distinctive", "phrase_level"]);

function record(value: unknown, code = "DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code = "DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID"): void {
  const actual = Object.keys(value).sort();
  const target = [...expected].sort();
  if (actual.length !== target.length || actual.some((key, index) => key !== target[index])) throw new Error(code);
}

function boundedString(value: unknown, maximum: number, code = "DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID"): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(code);
  return value;
}

function stringArray(value: unknown, maximumItems: number, maximumItemLength = 2048, allowEmpty = true): string[] {
  if (!Array.isArray(value) || value.length > maximumItems || (!allowEmpty && value.length === 0)) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  if (value.some((item) => typeof item !== "string" || !item.trim() || item.length > maximumItemLength)) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  return value as string[];
}

function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  return value;
}

function parseProvenance(value: unknown): EvavoCraftInfluenceProvenance {
  const source = record(value);
  exactKeys(source, [
    "sourceId", "privateLabel", "sourceKind", "rightsBasis", "rightsEvidenceIds", "sourceFingerprint",
    "providerContextAllowed", "phraseComparisonAllowed",
    ...(Object.hasOwn(source, "parentProfileId") ? ["parentProfileId"] : []),
    ...(Object.hasOwn(source, "parentProfileFingerprint") ? ["parentProfileFingerprint"] : []),
    ...(Object.hasOwn(source, "parentSynthesisDepth") ? ["parentSynthesisDepth"] : []),
    ...(Object.hasOwn(source, "ancestryProfileFingerprints") ? ["ancestryProfileFingerprints"] : []),
  ]);
  const sourceKind = boundedString(source.sourceKind, 64);
  const rightsBasis = boundedString(source.rightsBasis, 64);
  if (!SOURCE_KINDS.has(sourceKind) || !RIGHTS_BASES.has(rightsBasis)) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  const parsed: EvavoCraftInfluenceProvenance = {
    sourceId: boundedString(source.sourceId, 256),
    privateLabel: boundedString(source.privateLabel, 256),
    sourceKind: sourceKind as EvavoCraftInfluenceProvenance["sourceKind"],
    rightsBasis: rightsBasis as EvavoCraftInfluenceProvenance["rightsBasis"],
    rightsEvidenceIds: stringArray(source.rightsEvidenceIds, 64, 256, false),
    sourceFingerprint: boundedString(source.sourceFingerprint, 71),
    providerContextAllowed: boolean(source.providerContextAllowed),
    phraseComparisonAllowed: boolean(source.phraseComparisonAllowed),
  };
  if (Object.hasOwn(source, "parentProfileId")) parsed.parentProfileId = boundedString(source.parentProfileId, 128);
  if (Object.hasOwn(source, "parentProfileFingerprint")) parsed.parentProfileFingerprint = boundedString(source.parentProfileFingerprint, 71);
  if (Object.hasOwn(source, "parentSynthesisDepth")) parsed.parentSynthesisDepth = finite(source.parentSynthesisDepth);
  if (Object.hasOwn(source, "ancestryProfileFingerprints")) parsed.ancestryProfileFingerprints = stringArray(source.ancestryProfileFingerprints, 32, 71);
  return parsed;
}

function parseMechanism(value: unknown): EvavoCraftMechanismObservation {
  const source = record(value);
  exactKeys(source, ["mechanismId", "dimensionId", "description", "polarity", "strength", "confidence", "evidenceIds", "surfaceSpecificity"]);
  const specificity = boundedString(source.surfaceSpecificity, 32);
  if (!SPECIFICITIES.has(specificity)) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  return {
    mechanismId: boundedString(source.mechanismId, 128),
    dimensionId: boundedString(source.dimensionId, 128),
    description: boundedString(source.description, 600),
    polarity: finite(source.polarity),
    strength: finite(source.strength),
    confidence: finite(source.confidence),
    evidenceIds: stringArray(source.evidenceIds, 64, 256, false),
    surfaceSpecificity: specificity as EvavoCraftMechanismObservation["surfaceSpecificity"],
  };
}

function parseInfluence(value: unknown): EvavoCraftInfluence {
  const source = record(value);
  exactKeys(source, ["influenceId", "requestedWeight", "provenance", "mechanisms"]);
  if (!Array.isArray(source.mechanisms) || !source.mechanisms.length || source.mechanisms.length > 64) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  return {
    influenceId: boundedString(source.influenceId, 128),
    requestedWeight: finite(source.requestedWeight),
    provenance: parseProvenance(source.provenance),
    mechanisms: source.mechanisms.map(parseMechanism),
  };
}

function parsePolicy(value: unknown): EvavoCraftGenomePolicy {
  const source = record(value);
  const allowed = new Set(["minimumInfluences", "maximumInfluences", "maximumDominantWeight", "minimumInfluenceDiversity", "minimumProfileDistanceFromInfluence", "maximumSynthesisDepth", "requireProjectVoiceAnchors", "minimumProjectVoiceAnchors"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  const policy: EvavoCraftGenomePolicy = {};
  if (Object.hasOwn(source, "minimumInfluences")) policy.minimumInfluences = finite(source.minimumInfluences);
  if (Object.hasOwn(source, "maximumInfluences")) policy.maximumInfluences = finite(source.maximumInfluences);
  if (Object.hasOwn(source, "maximumDominantWeight")) policy.maximumDominantWeight = finite(source.maximumDominantWeight);
  if (Object.hasOwn(source, "minimumInfluenceDiversity")) policy.minimumInfluenceDiversity = finite(source.minimumInfluenceDiversity);
  if (Object.hasOwn(source, "minimumProfileDistanceFromInfluence")) policy.minimumProfileDistanceFromInfluence = finite(source.minimumProfileDistanceFromInfluence);
  if (Object.hasOwn(source, "maximumSynthesisDepth")) policy.maximumSynthesisDepth = finite(source.maximumSynthesisDepth);
  if (Object.hasOwn(source, "requireProjectVoiceAnchors")) policy.requireProjectVoiceAnchors = boolean(source.requireProjectVoiceAnchors);
  if (Object.hasOwn(source, "minimumProjectVoiceAnchors")) policy.minimumProjectVoiceAnchors = finite(source.minimumProjectVoiceAnchors);
  return policy;
}

function compileInput(value: unknown): EvavoCraftGenomeCompileInput {
  const source = record(value);
  exactKeys(source, [
    "programmeId", "profileId", "profileVersion", "influences", "projectVoiceAnchorIds",
    "narrativeConstraintIds", "acceptedPatternIds", "rejectedPatternIds",
    ...(Object.hasOwn(source, "policy") ? ["policy"] : []),
  ]);
  if (!Array.isArray(source.influences) || source.influences.length < 2 || source.influences.length > 24) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  const parsed: EvavoCraftGenomeCompileInput = {
    programmeId: boundedString(source.programmeId, 256),
    profileId: boundedString(source.profileId, 128),
    profileVersion: finite(source.profileVersion),
    influences: source.influences.map(parseInfluence),
    projectVoiceAnchorIds: stringArray(source.projectVoiceAnchorIds, 256),
    narrativeConstraintIds: stringArray(source.narrativeConstraintIds, 256, 2048, false),
    acceptedPatternIds: stringArray(source.acceptedPatternIds, 256),
    rejectedPatternIds: stringArray(source.rejectedPatternIds, 256),
  };
  if (Object.hasOwn(source, "policy")) parsed.policy = parsePolicy(source.policy);
  return parsed;
}

function packetInput(value: unknown): Omit<EvavoCraftGenomeProviderPacketInput, "profile"> {
  const source = record(value);
  exactKeys(source, ["packetId", "provider", "modelName", "objective", "targetUnitIds", "contextEvidenceIds"]);
  const provider = boundedString(source.provider, 64);
  if (!PROVIDERS.has(provider)) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  return {
    packetId: boundedString(source.packetId, 128),
    provider: provider as EvavoCraftGenomeProviderPacketInput["provider"],
    modelName: boundedString(source.modelName, 256),
    objective: boundedString(source.objective, 20_000),
    targetUnitIds: stringArray(source.targetUnitIds, 256, 256, false),
    contextEvidenceIds: stringArray(source.contextEvidenceIds, 512, 256, false),
  };
}

function phraseReference(value: unknown): EvavoCraftPhraseReference {
  const source = record(value);
  exactKeys(source, [
    "referenceId", "sourceKind", "rightsEvidenceIds", "text",
    ...(Object.hasOwn(source, "textSha256") ? ["textSha256"] : []),
    ...(Object.hasOwn(source, "allowQuotedUse") ? ["allowQuotedUse"] : []),
  ]);
  const sourceKind = boundedString(source.sourceKind, 64);
  if (!SOURCE_KINDS.has(sourceKind)) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  const parsed: EvavoCraftPhraseReference = {
    referenceId: boundedString(source.referenceId, 256),
    sourceKind: sourceKind as EvavoCraftPhraseReference["sourceKind"],
    rightsEvidenceIds: stringArray(source.rightsEvidenceIds, 64, 256, false),
    text: boundedString(source.text, 1_000_000),
  };
  if (Object.hasOwn(source, "textSha256")) parsed.textSha256 = boundedString(source.textSha256, 71);
  if (Object.hasOwn(source, "allowQuotedUse")) parsed.allowQuotedUse = boolean(source.allowQuotedUse);
  return parsed;
}

function scanInput(value: unknown): ParsedLegacyCraftScanInput {
  const source = record(value);
  exactKeys(source, [
    "scanId", "candidateId", "candidateText", "references",
    ...(Object.hasOwn(source, "warningNgram") ? ["warningNgram"] : []),
    ...(Object.hasOwn(source, "blockingNgram") ? ["blockingNgram"] : []),
  ]);
  if (!Array.isArray(source.references) || !source.references.length || source.references.length > 64) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  const parsed: ParsedLegacyCraftScanInput = {
    scanId: boundedString(source.scanId, 256),
    candidateId: boundedString(source.candidateId, 256),
    candidateText: boundedString(source.candidateText, 500_000),
    references: source.references.map(phraseReference),
  };
  if (Object.hasOwn(source, "warningNgram")) parsed.warningNgram = finite(source.warningNgram);
  if (Object.hasOwn(source, "blockingNgram")) parsed.blockingNgram = finite(source.blockingNgram);
  return parsed;
}

function parsePayload(value: unknown): ParsedLegacyCraftPayload {
  const payload = record(value);
  const operation = boundedString(payload.operation, 64);
  switch (operation) {
    case "compile_profile":
      exactKeys(payload, ["operation", "compileInput"]);
      return { operation, compileInput: compileInput(payload.compileInput) };
    case "create_provider_packet":
      exactKeys(payload, ["operation", "compileInput", "packetInput"]);
      return { operation, compileInput: compileInput(payload.compileInput), packetInput: packetInput(payload.packetInput) };
    case "validate_provider_response":
      exactKeys(payload, ["operation", "compileInput", "packetInput", "providerResponse"]);
      return { operation, compileInput: compileInput(payload.compileInput), packetInput: packetInput(payload.packetInput), providerResponse: payload.providerResponse };
    case "scan_phrase_overlap":
      exactKeys(payload, ["operation", "scanInput"]);
      return { operation, scanInput: scanInput(payload.scanInput) };
    default:
      throw new Error("DOCS_BOOK_LEGACY_CRAFT_OPERATION_UNSUPPORTED");
  }
}

function executePayload(payload: ParsedLegacyCraftPayload): unknown {
  switch (payload.operation) {
    case "compile_profile":
      return compileEvavoCraftGenome(payload.compileInput);
    case "create_provider_packet": {
      const profile = compileEvavoCraftGenome(payload.compileInput);
      return createEvavoCraftGenomeProviderPacket({ ...payload.packetInput, profile });
    }
    case "validate_provider_response": {
      const profile = compileEvavoCraftGenome(payload.compileInput);
      const packet = createEvavoCraftGenomeProviderPacket({ ...payload.packetInput, profile });
      return validateEvavoCraftGenomeProviderResponse(packet, payload.providerResponse);
    }
    case "scan_phrase_overlap":
      return scanEvavoCraftPhraseOverlap(payload.scanInput);
  }
}

function parseRequest(value: unknown): { request: BookLegacyCraftGenomeRequestV1; payload: ParsedLegacyCraftPayload } {
  const source = record(value);
  exactKeys(source, REQUEST_KEYS);
  const requestedBy = boundedString(source.requestedBy, 96) as BookLegacyCraftGenomeRequestedBy;
  if (
    source.outputKind !== "evavo_docs_book_legacy_craft_genome_request"
    || source.schemaVersion !== 1
    || source.contract !== BOOK_LEGACY_CRAFT_GENOME_CONTRACT
    || source.authorityMode !== "compatibility_migration"
    || source.sourceRepository !== "EVAVO-STUDIO/Website"
    || !REQUESTED_BY.has(requestedBy)
    || source.authoritativeWritesAllowed !== false
    || source.providerCallAllowed !== false
    || source.canonicalManuscriptMutationAllowed !== false
    || source.automaticCanonicalAdmissionAllowed !== false
    || source.runtimeCutoverApproved !== false
    || source.publicationPerformed !== false
  ) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  const requestId = boundedString(source.requestId, 128);
  if (!/^[A-Za-z0-9._:-]+$/.test(requestId)) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID");
  const sourceCommit = boundedString(source.sourceCommit, 64).toLowerCase();
  if (!/^[a-f0-9]{40,64}$/.test(sourceCommit)) throw new Error("DOCS_BOOK_LEGACY_CRAFT_SOURCE_COMMIT_INVALID");
  const requestedAt = boundedString(source.requestedAt, 64);
  if (Number.isNaN(Date.parse(requestedAt))) throw new Error("DOCS_BOOK_LEGACY_CRAFT_REQUESTED_AT_INVALID");
  const payload = parsePayload(source.payload);
  return {
    request: {
      outputKind: "evavo_docs_book_legacy_craft_genome_request",
      schemaVersion: 1,
      contract: BOOK_LEGACY_CRAFT_GENOME_CONTRACT,
      authorityMode: "compatibility_migration",
      requestId,
      sourceRepository: "EVAVO-STUDIO/Website",
      sourceCommit,
      payload: source.payload,
      requestedAt,
      requestedBy,
      authoritativeWritesAllowed: false,
      providerCallAllowed: false,
      canonicalManuscriptMutationAllowed: false,
      automaticCanonicalAdmissionAllowed: false,
      runtimeCutoverApproved: false,
      publicationPerformed: false,
    },
    payload,
  };
}

export function validateBookLegacyCraftGenomeRequest(value: unknown): BookLegacyCraftGenomeRequestV1 {
  return parseRequest(value).request;
}

function resultMessages(result: unknown): { blockers: string[]; warnings: string[] } {
  if (!result || typeof result !== "object" || Array.isArray(result)) return { blockers: [], warnings: [] };
  const source = result as Record<string, unknown>;
  return {
    blockers: Array.isArray(source.blockers) ? cleanCraftIds(source.blockers.filter((item): item is string => typeof item === "string")) : [],
    warnings: Array.isArray(source.warnings) ? cleanCraftIds(source.warnings.filter((item): item is string => typeof item === "string")) : [],
  };
}

export function executeBookLegacyCraftGenomeRequest(value: unknown): BookLegacyCraftGenomeResultV1 {
  const parsed = parseRequest(value);
  const result = executePayload(parsed.payload);
  const requestFingerprint = sha256CraftText(stableCraftJson(parsed.request));
  const messages = resultMessages(result);
  const unsigned: Omit<BookLegacyCraftGenomeResultV1, "resultFingerprint"> = {
    outputKind: "evavo_docs_book_legacy_craft_genome_result",
    schemaVersion: 1,
    contract: BOOK_LEGACY_CRAFT_GENOME_CONTRACT,
    status: "completed",
    requestId: parsed.request.requestId,
    operation: parsed.payload.operation,
    sourceRepository: parsed.request.sourceRepository,
    sourceCommit: parsed.request.sourceCommit,
    requestFingerprint,
    result,
    blockers: messages.blockers,
    warnings: messages.warnings,
    docsSuiteCompatibilityExecutionPerformed: true,
    websiteLocalCraftExecutionPerformed: false,
    legacyWebsiteCraftSourceRetired: true,
    authoritativeWritesPerformed: false,
    providerCalled: false,
    canonicalManuscriptMutationPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    docsSuiteCanonicalWriterEnabled: false,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  return { ...unsigned, resultFingerprint: sha256CraftText(stableCraftJson(unsigned)) };
}

export function listBookLegacyCraftGenomeCapabilities() {
  return {
    outputKind: "evavo_docs_book_legacy_craft_genome_capabilities",
    schemaVersion: 1,
    contract: BOOK_LEGACY_CRAFT_GENOME_CONTRACT,
    operations: ["compile_profile", "create_provider_packet", "validate_provider_response", "scan_phrase_overlap"] as const,
    providers: ["chatgpt", "claude", "other_compatible_model"] as const,
    providerExecutionModes: {
      chatgpt: "strict_json_schema",
      claude: "forced_single_tool",
      other_compatible_model: "adapter_json_schema",
    } as const,
    legacyWebsiteCraftSourceRetired: true,
    websiteLocalCraftExecutionAllowed: false,
    providerCallPerformed: false,
    authoritativeWritesPerformed: false,
    canonicalManuscriptMutationPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
    boundary: "Docs Suite preserves the exact legacy Website craft-genome calculation and response contracts only for compatibility. Native project-owned authorial intelligence remains the preferred path. This endpoint performs deterministic compilation, validation and phrase comparison only; it cannot call a model, mutate canon or publish.",
  };
}
