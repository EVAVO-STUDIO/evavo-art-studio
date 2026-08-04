import type { BookProviderId } from "./book-studio-project-contracts";
import type { BookAuthorialSynthesisPacketV1 } from "./book-studio-authorial-synthesis-types";
import type { BookAuthoringPacketV1 } from "./book-studio-authoring-types";
import type {
  BookWritingCandidateContextBlockV1,
  BookWritingCandidateRuntimeRequestV1,
  CompileBookWritingCandidateInputV1,
} from "./book-studio-writing-candidate-types";
import type { BookWritingHandoffRequestV1 } from "./book-studio-writing-handoff-types";

export const BOOK_AUTHORIAL_WRITING_BRIDGE_CONTRACT =
  "evavo_docs_book_authorial_writing_bridge_v1" as const;

export type BookAuthorialWritingBridgeStatus = "ready" | "blocked";

export interface BookAuthorialWritingBridgeHandoffInputV1 {
  requestId: string;
  allowedProviderIds: BookProviderId[];
  providerPolicyFingerprint: string;
  voiceProfileId: string;
  voiceProfileFingerprint: string;
  factSetFingerprint: string;
  additionalEvidenceIds: string[];
  outputContractFingerprint: string;
  requestedAt: string;
  expiresAt: string;
}

export interface BookAuthorialWritingBridgeCompileInputV1 {
  outputKind: "evavo_docs_book_authorial_writing_bridge_compile_input";
  schemaVersion: 1;
  authoringPacket: unknown;
  synthesisPacket: unknown;
  baseContextBlocks: Array<Omit<BookWritingCandidateContextBlockV1, "textSha256">>;
  handoff: BookAuthorialWritingBridgeHandoffInputV1;
  responseInstruction: string;
  maximumOutputCharacters: number;
  maximumOutputTokens: number;
  timeoutMilliseconds: number;
}

export interface BookAuthorialWritingBridgeResultV1 {
  outputKind: "evavo_docs_book_authorial_writing_bridge_result";
  schemaVersion: 1;
  contract: typeof BOOK_AUTHORIAL_WRITING_BRIDGE_CONTRACT;
  status: BookAuthorialWritingBridgeStatus;
  authoringPacket?: BookAuthoringPacketV1;
  authoringPacketFingerprint?: string;
  synthesisPacket?: BookAuthorialSynthesisPacketV1;
  synthesisPacketFingerprint?: string;
  synthesisContextObjectId?: string;
  handoffRequest?: BookWritingHandoffRequestV1;
  candidateCompileInput?: CompileBookWritingCandidateInputV1;
  runtimeRequestPreview?: BookWritingCandidateRuntimeRequestV1;
  bridgeFingerprint?: string;
  blockers: string[];
  warnings: string[];
  providerCallPerformed: false;
  runtimeJobSubmitted: false;
  authoritativeBookStateWritePerformed: false;
  canonicalManuscriptMutationPerformed: false;
  artStudioCalled: false;
  automaticCanonicalAdmissionAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}
