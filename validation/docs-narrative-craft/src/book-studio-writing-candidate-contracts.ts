import { validateAndNormalizeBookAuthoringPacket } from "./book-studio-authoring-packet";
import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";
import { normalizeBookWritingHandoffRequest } from "./book-studio-writing-handoff-request";
import {
  ISO_TIMESTAMP,
  SAFE_ID,
  SHA256,
  object,
  rejectUnknown,
  unique,
} from "./book-studio-writing-handoff-shared";
import type {
  BookWritingCandidateCompilationResultV1,
  BookWritingCandidateContextBlockV1,
  BookWritingCandidateContextRole,
  BookWritingCandidatePromptV1,
  BookWritingCandidateResponseMode,
  BookWritingCandidateRuntimeRequestV1,
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
const MAX_CONTEXT_BLOCKS = 8_192;
const MAX_CONTEXT_CHARACTERS = 4_000_000;
const MAX_CANDIDATE_BYTES = 8_000_000;

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
  literal(source.outputKind, "evavo_docs_book_writing_candidate_compile_input", "outputKind", blockers);
  literal(source.schemaVersion, 1, "schemaVersion", blockers);
  literal(source.providerCallAllowed, true, "providerCallAllowed", blockers);
  literal(source.providerRetryAllowed, false, "providerRetryAllowed", blockers);
  literal(source.writingStudioMayMutateManuscript, false, "writingStudioMayMutateManuscript", blockers);
  literal(source.canonicalAdmissionAllowed, false, "canonicalAdmissionAllowed", blockers);
  literal(source.remoteBookStateWriteAllowed, false, "remoteBookStateWriteAllowed", blockers);
  literal(source.artStudioCallAllowed, false, "artStudioCallAllowed", blockers);
  literal(source.publicationPerformed, false, "publicationPerformed", blockers);

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

  const requestedProvider = source.requestedProvider === "chatgpt"
    || source.requestedProvider === "claude"
    || source.requestedProvider === "other_compatible_model"
    ? source.requestedProvider
    : (blockers.push("requestedProvider is unsupported."), "other_compatible_model");
  const modelName = text(source.modelName, "modelName", blockers, 300);
  if (packet && requestedProvider !== packet.provider) blockers.push("Writing candidate provider differs from the exact authoring packet provider.");
  if (packet && modelName !== packet.modelName) blockers.push("Writing candidate model differs from the exact authoring packet model.");
  if (handoffRequest && !handoffRequest.allowedProviderIds.includes(requestedProvider)) blockers.push("Writing candidate provider is not allowed by the exact handoff request.");

  const prompt = await parsePrompt(source.prompt, blockers);
  const contextBlocks = await parseContextBlocks(source.contextBlocks, blockers);
  const requestedAt = readTimestamp(source.requestedAt, "requestedAt", blockers);
  if (handoffRequest && requestedAt !== handoffRequest.requestedAt) blockers.push("Writing candidate requestedAt differs from the exact handoff request.");
  const maximumOutputCharacters = integer(source.maximumOutputCharacters, "maximumOutputCharacters", blockers, 1_000, MAX_CANDIDATE_BYTES);
  const maximumOutputTokens = integer(source.maximumOutputTokens, "maximumOutputTokens", blockers, 1, 100_000);
  const timeoutMilliseconds = integer(source.timeoutMilliseconds, "timeoutMilliseconds", blockers, 1_000, 600_000);

  if (handoffRequest) {
    const blockIds = contextBlocks.map((block) => block.objectId);
    if (!sameOrder(blockIds, handoffRequest.contextObjectIds)) blockers.push("Writing candidate context IDs differ from the exact handoff request order or coverage.");
    for (let index = 0; index < contextBlocks.length; index += 1) {
      const block = contextBlocks[index];
      if (block && block.objectFingerprint !== handoffRequest.contextObjectFingerprints[index]) {
        blockers.push(`Writing candidate context fingerprint differs for ${block.objectId}.`);
      }
    }
  }
  const roles = new Set(contextBlocks.map((block) => block.role));
  if (!roles.has("target_manuscript")) blockers.push("Writing candidate context requires target_manuscript evidence.");
  if (!roles.has("voice")) blockers.push("Writing candidate context requires project-owned voice evidence.");
  const aggregateCharacters = contextBlocks.reduce((total, block) => total + block.text.length, 0)
    + prompt.systemInstruction.length + prompt.taskInstruction.length + prompt.responseInstruction.length;
  if (aggregateCharacters > MAX_CONTEXT_CHARACTERS) blockers.push(`Writing candidate input exceeds ${MAX_CONTEXT_CHARACTERS} aggregate characters.`);

  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length || !packet || !handoffRequest) {
    return compilation("blocked", undefined, uniqueBlockers, warnings);
  }
  const responseMode: BookWritingCandidateResponseMode = requestedProvider === "chatgpt"
    ? "strict_json_schema"
    : requestedProvider === "claude"
      ? "forced_single_tool"
      : "adapter_structured_output";
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
  const runtimeRequestFingerprint = await sha256BookText(canonicalBookJson({
    ...unsigned,
    contextBlocks: [...unsigned.contextBlocks].sort((left, right) => left.objectId.localeCompare(right.objectId)),
  }));
  return compilation("ready", { ...unsigned, runtimeRequestFingerprint }, [], warnings);
}

async function parsePrompt(value: unknown, blockers: string[]): Promise<BookWritingCandidatePromptV1> {
  const source = object(value, "Writing candidate prompt", blockers);
  rejectUnknown(source, new Set(["systemInstruction", "taskInstruction", "responseInstruction"]), "Writing candidate prompt", blockers);
  const unsigned = {
    systemInstruction: text(source.systemInstruction, "prompt systemInstruction", blockers, 120_000),
    taskInstruction: text(source.taskInstruction, "prompt taskInstruction", blockers, 500_000),
    responseInstruction: text(source.responseInstruction, "prompt responseInstruction", blockers, 120_000),
  };
  return {
    ...unsigned,
    promptFingerprint: await sha256BookText(canonicalBookJson(unsigned)),
  };
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
    const blockText = text(source.text, `contextBlocks[${index}].text`, blockers, 500_000);
    const role = typeof source.role === "string" && CONTEXT_ROLES.has(source.role as BookWritingCandidateContextRole)
      ? source.role as BookWritingCandidateContextRole
      : (blockers.push(`contextBlocks[${index}].role is unsupported.`), "other");
    blocks.push({
      objectId: readId(source.objectId, `contextBlocks[${index}].objectId`, blockers),
      objectFingerprint: readDigest(source.objectFingerprint, `contextBlocks[${index}].objectFingerprint`, blockers),
      role,
      text: blockText,
      textSha256: await sha256BookText(blockText),
    });
  }
  const sorted = [...blocks].sort((left, right) => left.objectId.localeCompare(right.objectId));
  if (new Set(sorted.map((block) => block.objectId)).size !== sorted.length) blockers.push("contextBlocks contain duplicate object IDs.");
  return sorted;
}

function compilation(
  status: "ready" | "blocked",
  runtimeRequest: BookWritingCandidateRuntimeRequestV1 | undefined,
  blockers: string[],
  warnings: string[],
): BookWritingCandidateCompilationResultV1 {
  return {
    outputKind: "evavo_docs_book_writing_candidate_compilation",
    schemaVersion: 1,
    status,
    ...(runtimeRequest === undefined ? {} : {
      runtimeRequest,
      runtimeRequestFingerprint: runtimeRequest.runtimeRequestFingerprint,
    }),
    blockers: unique(blockers),
    warnings: unique(warnings),
    providerCalled: false,
    authoritativeBookStateWritePerformed: false,
    canonicalManuscriptMutationPerformed: false,
    artStudioCalled: false,
    publicationPerformed: false,
  };
}

function literal(value: unknown, expected: unknown, label: string, blockers: string[]): void {
  if (value !== expected) blockers.push(`${label} is invalid.`);
}
function readId(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    blockers.push(`${label} is invalid.`);
    return "invalid-id";
  }
  return value;
}
function readDigest(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    blockers.push(`${label} must be an exact sha256 digest.`);
    return `sha256:${"0".repeat(64)}`;
  }
  return value;
}
function readTimestamp(value: unknown, label: string, blockers: string[]): string {
  if (
    typeof value !== "string"
    || !ISO_TIMESTAMP.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) {
    blockers.push(`${label} must be canonical UTC ISO-8601.`);
    return "1970-01-01T00:00:00.000Z";
  }
  return value;
}
function integer(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    blockers.push(`${label} must be an integer from ${minimum} to ${maximum}.`);
    return minimum;
  }
  return Number(value);
}
function text(value: unknown, label: string, blockers: string[], maximum: number): string {
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
function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
