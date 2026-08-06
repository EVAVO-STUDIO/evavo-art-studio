import { validateAndNormalizeBookAuthoringPacket } from "./book-studio-authoring-packet";
import type { BookAuthoringOperation, BookAuthoringPacketV1 } from "./book-studio-authoring-types";
import { validateBookAuthorialSynthesisPacket } from "./book-studio-authorial-synthesis";
import type {
  BookAuthorialSynthesisOperation,
  BookAuthorialSynthesisPacketV1,
} from "./book-studio-authorial-synthesis-types";
import {
  BOOK_AUTHORIAL_WRITING_BRIDGE_CONTRACT,
  type BookAuthorialWritingBridgeResultV1,
} from "./book-studio-authorial-writing-bridge-types";
import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";
import { compileBookWritingCandidateRuntimeRequest } from "./book-studio-writing-candidate-contracts";
import type {
  BookWritingCandidateContextBlockV1,
  BookWritingCandidateContextRole,
  CompileBookWritingCandidateInputV1,
} from "./book-studio-writing-candidate-types";
import { compileBookWritingHandoffRequest } from "./book-studio-writing-handoff-request";
import {
  digest,
  enumIds,
  enumValue,
  id,
  ids,
  object,
  rejectUnknown,
  timestamp,
  unique,
} from "./book-studio-writing-handoff-shared";

const INPUT_KEYS = new Set([
  "outputKind", "schemaVersion", "authoringPacket", "synthesisPacket", "baseContextBlocks", "handoff",
  "responseInstruction", "maximumOutputCharacters", "maximumOutputTokens", "timeoutMilliseconds",
]);
const HANDOFF_KEYS = new Set([
  "requestId", "allowedProviderIds", "providerPolicyFingerprint", "voiceProfileId", "voiceProfileFingerprint",
  "factSetFingerprint", "additionalEvidenceIds", "outputContractFingerprint", "requestedAt", "expiresAt",
]);
const CONTEXT_KEYS = new Set(["objectId", "objectFingerprint", "role", "text"]);
const CONTEXT_ROLES = new Set<BookWritingCandidateContextRole>([
  "target_manuscript", "read_only_manuscript", "story_state", "continuity", "research", "fact", "voice",
  "constraint", "prior_revision", "other",
]);
const BRIDGE_OWNED_CONTEXT_ROLES = new Set<BookWritingCandidateContextRole>(["voice"]);
const BRIDGE_OWNED_CONTEXT_PREFIXES = ["authorial-voice:", "authorial-synthesis:"] as const;
const MAXIMUM_CONTEXT_BLOCKS = 8_190;
const MAXIMUM_CONTEXT_TEXT = 500_000;
const MAXIMUM_RESPONSE_INSTRUCTION = 120_000;
const MAXIMUM_RUNTIME_TIMEOUT_MS = 270_000;

const ALL_SYNTHESIS_OPERATIONS = new Set<BookAuthorialSynthesisOperation>([
  "ideate", "draft", "revise", "expand", "compress", "restructure", "line_edit", "dialogue_polish",
  "emotion_deepen", "tension_build", "description_enrich", "continuity_repair", "opening_rework", "ending_rework",
]);
const COMPATIBLE_SYNTHESIS_OPERATIONS: Readonly<
  Partial<Record<BookAuthoringOperation, ReadonlySet<BookAuthorialSynthesisOperation>>>
> = Object.freeze({
  draft_candidate: new Set<BookAuthorialSynthesisOperation>(["draft"]),
  revise_candidate: new Set<BookAuthorialSynthesisOperation>([
    "revise", "expand", "compress", "restructure", "dialogue_polish", "emotion_deepen", "tension_build",
    "description_enrich", "continuity_repair", "opening_rework", "ending_rework",
  ]),
  line_edit_candidate: new Set<BookAuthorialSynthesisOperation>(["line_edit"]),
});
const SOURCE_BOUND_SYNTHESIS_OPERATIONS = new Set<BookAuthorialSynthesisOperation>([
  "revise", "expand", "compress", "restructure", "line_edit", "dialogue_polish", "emotion_deepen",
  "tension_build", "description_enrich", "continuity_repair", "opening_rework", "ending_rework",
]);

export async function compileBookAuthorialWritingBridge(
  input: unknown,
): Promise<BookAuthorialWritingBridgeResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const source = object(input, "Authorial writing bridge input", blockers);
  rejectUnknown(source, INPUT_KEYS, "Authorial writing bridge input", blockers);
  if (source.outputKind !== "evavo_docs_book_authorial_writing_bridge_compile_input") {
    blockers.push("Authorial writing bridge input outputKind is invalid.");
  }
  if (source.schemaVersion !== 1) blockers.push("Authorial writing bridge input schemaVersion is invalid.");

  const authoringValidation = await validateAndNormalizeBookAuthoringPacket(source.authoringPacket);
  if (authoringValidation.status !== "ready" || !authoringValidation.packet) {
    blockers.push("Authorial writing bridge requires an exact valid Book authoring packet.", ...authoringValidation.blockers);
  }
  const authoringPacket = authoringValidation.packet;

  const synthesisBlockers = await validateBookAuthorialSynthesisPacket(source.synthesisPacket);
  blockers.push(...synthesisBlockers.map((item) => `Authorial synthesis packet: ${item}`));
  const synthesisSurfaceValid = validateSynthesisBridgeSurface(source.synthesisPacket, blockers);
  const synthesisPacket = synthesisBlockers.length || !synthesisSurfaceValid
    ? undefined
    : source.synthesisPacket as BookAuthorialSynthesisPacketV1;

  const baseContextInputs = parseBaseContextBlocks(source.baseContextBlocks, blockers);
  const baseContextBlocks: BookWritingCandidateContextBlockV1[] = await Promise.all(
    baseContextInputs.map(async (block) => ({
      ...block,
      textSha256: await sha256BookText(block.text),
    })),
  );
  const responseInstruction = multilineText(
    source.responseInstruction,
    "responseInstruction",
    blockers,
    MAXIMUM_RESPONSE_INSTRUCTION,
  );
  const maximumOutputCharacters = boundedInteger(
    source.maximumOutputCharacters,
    "maximumOutputCharacters",
    blockers,
    1_000,
    2_000_000,
  );
  const maximumOutputTokens = boundedInteger(
    source.maximumOutputTokens,
    "maximumOutputTokens",
    blockers,
    1,
    100_000,
  );
  const timeoutMilliseconds = boundedInteger(
    source.timeoutMilliseconds,
    "timeoutMilliseconds",
    blockers,
    1_000,
    MAXIMUM_RUNTIME_TIMEOUT_MS,
  );

  if (authoringPacket && synthesisPacket) {
    validatePacketCompatibility(authoringPacket, synthesisPacket, blockers);
    if (maximumOutputCharacters > authoringPacket.maximumOutputCharacters) {
      blockers.push(
        `maximumOutputCharacters ${maximumOutputCharacters} exceeds the authoring packet limit ${authoringPacket.maximumOutputCharacters}.`,
      );
    }
  }

  const targetBlocks = baseContextBlocks.filter((item) => item.role === "target_manuscript");
  if (targetBlocks.length !== 1) blockers.push("Authorial writing bridge requires exactly one target_manuscript context block.");
  if (baseContextBlocks.some((item) => BRIDGE_OWNED_CONTEXT_ROLES.has(item.role))) {
    blockers.push("Base context blocks cannot supply a voice role; the bridge creates the exact synthesis-bound voice context.");
  }
  for (const block of baseContextBlocks) {
    if (BRIDGE_OWNED_CONTEXT_PREFIXES.some((prefix) => block.objectId.startsWith(prefix))) {
      blockers.push(`Base context block ${block.objectId} uses a bridge-owned identity prefix.`);
    }
  }

  if (
    synthesisPacket
    && SOURCE_BOUND_SYNTHESIS_OPERATIONS.has(synthesisPacket.operation)
    && targetBlocks.length === 1
  ) {
    if (synthesisPacket.sourceTextSha256 !== targetBlocks[0]!.textSha256) {
      blockers.push("The exact target_manuscript text does not match the synthesis packet sourceTextSha256.");
    }
  }

  const handoffSource = object(source.handoff, "Authorial writing bridge handoff", blockers);
  rejectUnknown(handoffSource, HANDOFF_KEYS, "Authorial writing bridge handoff", blockers);
  const requestId = id(handoffSource.requestId, "handoff.requestId", blockers);
  const allowedProviderIds = enumIds(handoffSource.allowedProviderIds, "handoff.allowedProviderIds", blockers);
  const providerPolicyFingerprint = digest(
    handoffSource.providerPolicyFingerprint,
    "handoff.providerPolicyFingerprint",
    blockers,
  );
  const voiceProfileId = id(handoffSource.voiceProfileId, "handoff.voiceProfileId", blockers);
  const voiceProfileFingerprint = digest(
    handoffSource.voiceProfileFingerprint,
    "handoff.voiceProfileFingerprint",
    blockers,
  );
  const factSetFingerprint = digest(handoffSource.factSetFingerprint, "handoff.factSetFingerprint", blockers);
  const additionalEvidenceIds = ids(
    handoffSource.additionalEvidenceIds,
    "handoff.additionalEvidenceIds",
    blockers,
    8_192,
    false,
  );
  const outputContractFingerprint = digest(
    handoffSource.outputContractFingerprint,
    "handoff.outputContractFingerprint",
    blockers,
  );
  const requestedAt = timestamp(handoffSource.requestedAt, "handoff.requestedAt", blockers);
  const expiresAt = timestamp(handoffSource.expiresAt, "handoff.expiresAt", blockers);

  if (authoringPacket) {
    if (outputContractFingerprint !== authoringPacket.responseContractFingerprint) {
      blockers.push("The handoff output contract differs from the exact authoring response contract.");
    }
    if (Date.parse(requestedAt) < Date.parse(authoringPacket.createdAt)) {
      blockers.push("The handoff requestedAt precedes the authoring packet creation time.");
    }
    if (Date.parse(expiresAt) > Date.parse(authoringPacket.expiresAt)) {
      blockers.push("The handoff expires after the authoring packet expires.");
    }
  }
  if (synthesisPacket && voiceProfileFingerprint !== synthesisPacket.authorialVoiceProfileFingerprint) {
    blockers.push("The handoff voice profile differs from the exact authorial synthesis voice profile.");
  }

  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length || !authoringPacket || !synthesisPacket) {
    return blocked(uniqueBlockers, warnings);
  }

  const voiceContext = await buildVoiceContext(synthesisPacket);
  const synthesisContext = synthesisContextBlock(synthesisPacket);
  const contextBlocks: BookWritingCandidateContextBlockV1[] = [
    ...baseContextBlocks,
    voiceContext,
    synthesisContext,
  ].sort((left, right) => left.objectId.localeCompare(right.objectId));
  if (new Set(contextBlocks.map((item) => item.objectId)).size !== contextBlocks.length) {
    return blocked(["Authorial writing bridge context blocks contain duplicate object identities."], warnings);
  }

  const contextObjectIds = contextBlocks.map((item) => item.objectId);
  const contextObjectFingerprints = contextBlocks.map((item) => item.objectFingerprint);
  const requiredEvidenceIds = unique([
    ...authoringPacket.contextEvidenceIds,
    ...synthesisPacket.evidenceIds,
    ...additionalEvidenceIds,
    synthesisPacket.synthesisId,
    synthesisContext.objectId,
    voiceContext.objectId,
  ]).sort();
  const handoffValidation = await compileBookWritingHandoffRequest(authoringPacket, {
    requestId,
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
  });
  if (handoffValidation.status !== "ready" || !handoffValidation.request) {
    return blocked(["The exact Writing Studio handoff could not be compiled.", ...handoffValidation.blockers], warnings);
  }
  const handoffRequest = handoffValidation.request;

  const candidateCompileInput: CompileBookWritingCandidateInputV1 = {
    outputKind: "evavo_docs_book_writing_candidate_compile_input",
    schemaVersion: 1,
    packet: authoringPacket,
    handoffRequest,
    requestedProvider: authoringPacket.provider,
    modelName: authoringPacket.modelName,
    prompt: buildPrompt(authoringPacket, synthesisPacket, responseInstruction),
    contextBlocks: contextBlocks.map((block) => ({
      objectId: block.objectId,
      objectFingerprint: block.objectFingerprint,
      role: block.role,
      text: block.text,
    })),
    maximumOutputCharacters,
    maximumOutputTokens,
    timeoutMilliseconds,
    requestedAt,
    providerCallAllowed: true,
    providerRetryAllowed: false,
    writingStudioMayMutateManuscript: false,
    canonicalAdmissionAllowed: false,
    remoteBookStateWriteAllowed: false,
    artStudioCallAllowed: false,
    publicationPerformed: false,
  };
  const runtimeCompilation = await compileBookWritingCandidateRuntimeRequest(candidateCompileInput);
  if (runtimeCompilation.status !== "ready" || !runtimeCompilation.runtimeRequest) {
    return blocked([
      "The authorial synthesis could not be compiled into an exact Writing Studio runtime request.",
      ...runtimeCompilation.blockers,
    ], [...warnings, ...runtimeCompilation.warnings]);
  }
  const runtimeRequestPreview = runtimeCompilation.runtimeRequest;
  const bridgeFingerprint = await sha256BookText(canonicalBookJson({
    outputKind: "evavo_docs_book_authorial_writing_bridge_identity",
    schemaVersion: 1,
    contract: BOOK_AUTHORIAL_WRITING_BRIDGE_CONTRACT,
    authoringPacketFingerprint: authoringPacket.packetFingerprint,
    synthesisPacketFingerprint: synthesisPacket.packetFingerprint,
    synthesisContextObjectId: synthesisContext.objectId,
    voiceContextObjectId: voiceContext.objectId,
    handoffRequestFingerprint: handoffRequest.requestFingerprint,
    runtimeRequestFingerprint: runtimeRequestPreview.runtimeRequestFingerprint,
  }));

  return {
    outputKind: "evavo_docs_book_authorial_writing_bridge_result",
    schemaVersion: 1,
    contract: BOOK_AUTHORIAL_WRITING_BRIDGE_CONTRACT,
    status: "ready",
    authoringPacket,
    authoringPacketFingerprint: authoringPacket.packetFingerprint,
    synthesisPacket,
    synthesisPacketFingerprint: synthesisPacket.packetFingerprint,
    synthesisContextObjectId: synthesisContext.objectId,
    handoffRequest,
    candidateCompileInput,
    runtimeRequestPreview,
    bridgeFingerprint,
    blockers: [],
    warnings: unique([...warnings, ...runtimeCompilation.warnings]),
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    authoritativeBookStateWritePerformed: false,
    canonicalManuscriptMutationPerformed: false,
    artStudioCalled: false,
    automaticCanonicalAdmissionAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

export function listBookAuthorialWritingBridgeCapabilities() {
  return Object.freeze({
    outputKind: "evavo_docs_book_authorial_writing_bridge_capabilities",
    schemaVersion: 1,
    contract: BOOK_AUTHORIAL_WRITING_BRIDGE_CONTRACT,
    supportedAuthoringOperations: Object.keys(COMPATIBLE_SYNTHESIS_OPERATIONS).sort(),
    maximumRuntimeTimeoutMilliseconds: MAXIMUM_RUNTIME_TIMEOUT_MS,
    synthesisContextInjectedAutomatically: true,
    voiceContextInjectedAutomatically: true,
    runtimeRequestPrevalidated: true,
    providerCallPerformed: false,
    providerRetryAllowed: false,
    authoritativeBookStateWritePerformed: false,
    canonicalManuscriptMutationPerformed: false,
    artStudioCalled: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  });
}

function validateSynthesisBridgeSurface(value: unknown, blockers: string[]): boolean {
  const before = blockers.length;
  const source = object(value, "Authorial synthesis bridge packet", blockers);
  id(source.programmeId, "synthesis.programmeId", blockers);
  id(source.projectId, "synthesis.projectId", blockers);
  id(source.volumeId, "synthesis.volumeId", blockers);
  id(source.manuscriptRevisionId, "synthesis.manuscriptRevisionId", blockers);
  id(source.synthesisId, "synthesis.synthesisId", blockers);
  const operation = enumValue(
    source.operation,
    ALL_SYNTHESIS_OPERATIONS,
    "synthesis.operation",
    blockers,
    "draft",
  );
  ids(source.targetUnitIds, "synthesis.targetUnitIds", blockers, 2_048, true);
  digest(source.authorialVoiceProfileFingerprint, "synthesis.authorialVoiceProfileFingerprint", blockers);
  digest(source.packetFingerprint, "synthesis.packetFingerprint", blockers);
  ids(source.evidenceIds, "synthesis.evidenceIds", blockers, 8_192, true);
  multilineText(source.objective, "synthesis.objective", blockers, 4_000);
  if (SOURCE_BOUND_SYNTHESIS_OPERATIONS.has(operation)) {
    digest(source.sourceTextSha256, "synthesis.sourceTextSha256", blockers);
  }
  const context = object(source.writingContextBlock, "synthesis.writingContextBlock", blockers);
  id(context.objectId, "synthesis.writingContextBlock.objectId", blockers);
  digest(context.objectFingerprint, "synthesis.writingContextBlock.objectFingerprint", blockers);
  digest(context.textSha256, "synthesis.writingContextBlock.textSha256", blockers);
  multilineText(context.text, "synthesis.writingContextBlock.text", blockers, MAXIMUM_CONTEXT_TEXT);
  if (context.role !== "constraint") blockers.push("synthesis.writingContextBlock role must be constraint.");
  return blockers.length === before;
}

function validatePacketCompatibility(
  authoring: BookAuthoringPacketV1,
  synthesis: BookAuthorialSynthesisPacketV1,
  blockers: string[],
): void {
  if (
    authoring.programmeId !== synthesis.programmeId
    || authoring.projectId !== synthesis.projectId
    || authoring.volumeId !== synthesis.volumeId
    || authoring.manuscriptRevisionId !== synthesis.manuscriptRevisionId
  ) blockers.push("Authoring and authorial synthesis book identities do not match.");
  if (!sameOrder(authoring.targetUnitIds, synthesis.targetUnitIds)) {
    blockers.push("Authoring and authorial synthesis target unit identities do not match exactly.");
  }
  if (!sameOrder(authoring.expectedChangedUnitIds, synthesis.targetUnitIds)) {
    blockers.push("Authoring expected changed units must equal the authorial synthesis target units.");
  }
  const compatible = COMPATIBLE_SYNTHESIS_OPERATIONS[authoring.operation];
  if (!compatible || !compatible.has(synthesis.operation)) {
    blockers.push(`Authoring operation ${authoring.operation} is not compatible with synthesis operation ${synthesis.operation}.`);
  }
}

function parseBaseContextBlocks(
  value: unknown,
  blockers: string[],
): Array<Omit<BookWritingCandidateContextBlockV1, "textSha256">> {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAXIMUM_CONTEXT_BLOCKS) {
    blockers.push(`baseContextBlocks must contain 1-${MAXIMUM_CONTEXT_BLOCKS} records.`);
    return [];
  }
  const blocks = value.map((item, index) => {
    const source = object(item, `baseContextBlocks[${index}]`, blockers);
    rejectUnknown(source, CONTEXT_KEYS, `baseContextBlocks[${index}]`, blockers);
    return {
      objectId: id(source.objectId, `baseContextBlocks[${index}].objectId`, blockers),
      objectFingerprint: digest(source.objectFingerprint, `baseContextBlocks[${index}].objectFingerprint`, blockers),
      role: enumValue(source.role, CONTEXT_ROLES, `baseContextBlocks[${index}].role`, blockers, "other"),
      text: multilineText(source.text, `baseContextBlocks[${index}].text`, blockers, MAXIMUM_CONTEXT_TEXT),
    };
  }).sort((left, right) => left.objectId.localeCompare(right.objectId));
  if (new Set(blocks.map((item) => item.objectId)).size !== blocks.length) {
    blockers.push("baseContextBlocks contain duplicate object identities.");
  }
  return blocks;
}

async function buildVoiceContext(
  synthesis: BookAuthorialSynthesisPacketV1,
): Promise<BookWritingCandidateContextBlockV1> {
  const text = canonicalBookJson({
    outputKind: "evavo_docs_book_authorial_voice_context_reference",
    schemaVersion: 1,
    projectId: synthesis.projectId,
    volumeId: synthesis.volumeId,
    manuscriptRevisionId: synthesis.manuscriptRevisionId,
    authorialVoiceProfileFingerprint: synthesis.authorialVoiceProfileFingerprint,
    authorialSynthesisPacketFingerprint: synthesis.packetFingerprint,
    projectVoiceRemainsAuthoritative: true,
    namedCreatorInstructionPermitted: false,
    canonicalManuscriptMutationAllowed: false,
    publicationPerformed: false,
  });
  const textSha256 = await sha256BookText(text);
  const objectFingerprint = await sha256BookText(canonicalBookJson({
    contract: BOOK_AUTHORIAL_WRITING_BRIDGE_CONTRACT,
    role: "voice",
    authorialVoiceProfileFingerprint: synthesis.authorialVoiceProfileFingerprint,
    textSha256,
  }));
  return {
    objectId: `authorial-voice:${synthesis.authorialVoiceProfileFingerprint.slice("sha256:".length, "sha256:".length + 24)}`,
    objectFingerprint,
    role: "voice",
    text,
    textSha256,
  };
}

function synthesisContextBlock(
  synthesis: BookAuthorialSynthesisPacketV1,
): BookWritingCandidateContextBlockV1 {
  return {
    objectId: synthesis.writingContextBlock.objectId,
    objectFingerprint: synthesis.writingContextBlock.objectFingerprint,
    role: "constraint",
    text: synthesis.writingContextBlock.text,
    textSha256: synthesis.writingContextBlock.textSha256,
  };
}

function buildPrompt(
  authoring: BookAuthoringPacketV1,
  synthesis: BookAuthorialSynthesisPacketV1,
  responseInstruction: string,
): CompileBookWritingCandidateInputV1["prompt"] {
  return {
    systemInstruction: [
      "Execute one bounded EVAVO Book candidate operation from exact project-owned evidence.",
      "The authorial synthesis constraint is authoritative for voice, register, causality, character, viewpoint, prose, originality and rights.",
      "Return a candidate only. Do not mutate canonical manuscript state, call Art Studio, admit canon, submit to Amazon or publish.",
      "Make no provider fallback or hidden retry.",
    ].join("\n"),
    taskInstruction: [
      `Authoring operation: ${authoring.operation}.`,
      `Authorial synthesis operation: ${synthesis.operation}.`,
      `Unit kind: ${synthesis.unitKind}.`,
      `Target units: ${synthesis.targetUnitIds.join(", ")}.`,
      `Objective: ${synthesis.objective}`,
      `Allowed actions: ${authoring.allowedActionIds.join(", ")}.`,
      `Prohibited actions: ${authoring.prohibitedActionIds.join(", ")}.`,
      `Required output states: ${authoring.requiredOutputStateIds.join(", ")}.`,
      `Unresolved issue identities: ${authoring.unresolvedIssueIds.join(", ") || "none"}.`,
      `Unresolved research identities: ${authoring.unresolvedResearchIds.join(", ") || "none"}.`,
      "Read and obey the exact authorial-synthesis constraint context before producing any candidate text.",
    ].join("\n"),
    responseInstruction: [
      responseInstruction,
      `Response contract fingerprint: ${authoring.responseContractFingerprint}.`,
      "Do not include canonical-write, Art, publication or authority claims.",
    ].join("\n"),
  };
}

function multilineText(value: unknown, label: string, blockers: string[], maximum: number): string {
  if (
    typeof value !== "string"
    || value !== value.trim()
    || value.length < 1
    || value.length > maximum
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    blockers.push(`${label} is invalid or unbounded.`);
    return "invalid";
  }
  return value;
}

function boundedInteger(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    blockers.push(`${label} must be an integer from ${minimum} to ${maximum}.`);
    return minimum;
  }
  return Number(value);
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function blocked(blockers: string[], warnings: string[]): BookAuthorialWritingBridgeResultV1 {
  return {
    outputKind: "evavo_docs_book_authorial_writing_bridge_result",
    schemaVersion: 1,
    contract: BOOK_AUTHORIAL_WRITING_BRIDGE_CONTRACT,
    status: "blocked",
    blockers: unique(blockers),
    warnings: unique(warnings),
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    authoritativeBookStateWritePerformed: false,
    canonicalManuscriptMutationPerformed: false,
    artStudioCalled: false,
    automaticCanonicalAdmissionAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}
