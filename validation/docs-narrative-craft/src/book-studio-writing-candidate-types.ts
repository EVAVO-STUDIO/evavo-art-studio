import type { BookProviderId } from "./book-studio-project-contracts";
import type {
  BookWritingHandoffRequestV1,
  BookWritingHandoffResponseV1,
  BookWritingHandoffValidationResultV1,
} from "./book-studio-writing-handoff-types";

export const BOOK_WRITING_CANDIDATE_CONTRACT = "evavo_docs_book_candidate_runtime_v1" as const;
export const BOOK_WRITING_CANDIDATE_SCHEMA_VERSION = 1 as const;

export type BookWritingCandidateContextRole =
  | "target_manuscript"
  | "read_only_manuscript"
  | "story_state"
  | "continuity"
  | "research"
  | "fact"
  | "voice"
  | "constraint"
  | "prior_revision"
  | "other";

export type BookWritingCandidateResponseMode =
  | "strict_json_schema"
  | "forced_single_tool"
  | "adapter_structured_output";

export type BookWritingCandidateStopReason =
  | "completed"
  | "maximum_output_tokens"
  | "provider_pause"
  | "content_filter"
  | "provider_rejected"
  | "timeout"
  | "network"
  | "invalid_request"
  | "authentication"
  | "rate_limited"
  | "temporary_unavailable"
  | "unknown";

export interface BookWritingCandidateContextBlockV1 {
  objectId: string;
  objectFingerprint: string;
  role: BookWritingCandidateContextRole;
  text: string;
  textSha256: string;
}

export interface BookWritingCandidatePromptV1 {
  systemInstruction: string;
  taskInstruction: string;
  responseInstruction: string;
  promptFingerprint: string;
}

export interface BookWritingCandidateRuntimeRequestV1 {
  outputKind: "evavo_docs_book_candidate_runtime_request";
  schemaVersion: typeof BOOK_WRITING_CANDIDATE_SCHEMA_VERSION;
  contract: typeof BOOK_WRITING_CANDIDATE_CONTRACT;
  handoffRequest: BookWritingHandoffRequestV1;
  requestedProvider: BookProviderId;
  modelName: string;
  responseMode: BookWritingCandidateResponseMode;
  prompt: BookWritingCandidatePromptV1;
  contextBlocks: BookWritingCandidateContextBlockV1[];
  maximumOutputCharacters: number;
  maximumOutputTokens: number;
  timeoutMilliseconds: number;
  idempotencyKey: string;
  requestedAt: string;
  runtimeRequestFingerprint: string;
  providerCallAllowed: true;
  providerRetryAllowed: false;
  writingStudioMayMutateManuscript: false;
  canonicalAdmissionAllowed: false;
  remoteBookStateWriteAllowed: false;
  artStudioCallAllowed: false;
  publicationPerformed: false;
}

export interface BookWritingCandidateStorageReceiptV1 {
  disposition: "written" | "idempotent_replay";
  objectId: string;
  candidateSha256: string;
  candidateByteLength: number;
  storedAt: string;
  storageReceiptFingerprint: string;
}

export interface BookWritingCandidateRuntimeResultV1 {
  outputKind: "evavo_docs_book_candidate_runtime_result";
  schemaVersion: typeof BOOK_WRITING_CANDIDATE_SCHEMA_VERSION;
  contract: typeof BOOK_WRITING_CANDIDATE_CONTRACT;
  status: "completed" | "partial" | "needs_work" | "blocked";
  runtimeRequestFingerprint: string;
  handoffResponse: BookWritingHandoffResponseV1;
  candidateText: string | null;
  storageReceipt?: BookWritingCandidateStorageReceiptV1;
  providerRequestId: string;
  providerStopReason: BookWritingCandidateStopReason;
  providerAttemptCount: 0 | 1;
  providerCalled: boolean;
  blockers: string[];
  warnings: string[];
  completedAt: string;
  resultFingerprint: string;
  candidateEvidenceStored: boolean;
  authoritativeBookStateWritePerformed: false;
  canonicalManuscriptMutationPerformed: false;
  artStudioCalled: false;
  publicationPerformed: false;
}

export interface CompileBookWritingCandidateInputV1 {
  outputKind: "evavo_docs_book_writing_candidate_compile_input";
  schemaVersion: 1;
  packet: unknown;
  handoffRequest: unknown;
  requestedProvider: BookProviderId;
  modelName: string;
  prompt: Omit<BookWritingCandidatePromptV1, "promptFingerprint">;
  contextBlocks: Array<Omit<BookWritingCandidateContextBlockV1, "textSha256">>;
  maximumOutputCharacters: number;
  maximumOutputTokens: number;
  timeoutMilliseconds: number;
  requestedAt: string;
  providerCallAllowed: true;
  providerRetryAllowed: false;
  writingStudioMayMutateManuscript: false;
  canonicalAdmissionAllowed: false;
  remoteBookStateWriteAllowed: false;
  artStudioCallAllowed: false;
  publicationPerformed: false;
}

export interface BookWritingCandidateCompilationResultV1 {
  outputKind: "evavo_docs_book_writing_candidate_compilation";
  schemaVersion: 1;
  status: "ready" | "blocked";
  runtimeRequest?: BookWritingCandidateRuntimeRequestV1;
  blockers: string[];
  warnings: string[];
  runtimeRequestFingerprint?: string;
  providerCalled: false;
  authoritativeBookStateWritePerformed: false;
  canonicalManuscriptMutationPerformed: false;
  artStudioCalled: false;
  publicationPerformed: false;
}

export interface BookWritingCandidateCoordinationResultV1 {
  outputKind: "evavo_docs_book_writing_candidate_coordination";
  schemaVersion: 1;
  status: "ready_for_authoring_result_validation" | "continuation_required" | "needs_work" | "blocked";
  runtimeRequest?: BookWritingCandidateRuntimeRequestV1;
  runtimeResult?: BookWritingCandidateRuntimeResultV1;
  handoffValidation?: BookWritingHandoffValidationResultV1;
  blockers: string[];
  warnings: string[];
  providerCalled: boolean;
  authoritativeBookStateWritePerformed: false;
  canonicalManuscriptMutationPerformed: false;
  artStudioCalled: false;
  publicationPerformed: false;
}
