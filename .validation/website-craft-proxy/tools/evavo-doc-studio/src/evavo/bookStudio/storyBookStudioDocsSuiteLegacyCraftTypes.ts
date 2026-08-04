export const EVAVO_DOCS_SUITE_LEGACY_CRAFT_CONTRACT = "evavo_docs_book_legacy_craft_genome_v1" as const;
export const EVAVO_DOCS_SUITE_LEGACY_CRAFT_ENDPOINT = "/api/v1/book-studio/legacy-craft-genome" as const;
export const EVAVO_DOCS_SUITE_LEGACY_CRAFT_REQUESTER = "Website Book Studio craft-genome compatibility route" as const;

export type EvavoLegacyCraftOperation =
  | "compile_profile"
  | "create_provider_packet"
  | "validate_provider_response"
  | "scan_phrase_overlap";

export type EvavoLegacyCraftPublicRequest =
  | {
      operation: "compile_profile";
      compileInput: Record<string, unknown>;
    }
  | {
      operation: "create_provider_packet";
      compileInput: Record<string, unknown>;
      packetInput: Record<string, unknown>;
    }
  | {
      operation: "validate_provider_response";
      compileInput: Record<string, unknown>;
      packetInput: Record<string, unknown>;
      providerResponse: Record<string, unknown>;
    }
  | {
      operation: "scan_phrase_overlap";
      scanInput: Record<string, unknown>;
    };

export interface EvavoDocsSuiteLegacyCraftConfiguration {
  baseUrl: URL;
  token: string;
  websiteCommit: string;
  timeoutMs: number;
  maximumResponseBytes: number;
}

export interface EvavoDocsSuiteLegacyCraftRequestV1 {
  outputKind: "evavo_docs_book_legacy_craft_genome_request";
  schemaVersion: 1;
  contract: typeof EVAVO_DOCS_SUITE_LEGACY_CRAFT_CONTRACT;
  authorityMode: "compatibility_migration";
  requestId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  payload: EvavoLegacyCraftPublicRequest;
  requestedAt: string;
  requestedBy: typeof EVAVO_DOCS_SUITE_LEGACY_CRAFT_REQUESTER;
  authoritativeWritesAllowed: false;
  providerCallAllowed: false;
  canonicalManuscriptMutationAllowed: false;
  automaticCanonicalAdmissionAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface EvavoDocsSuiteLegacyCraftCompatibilityResultV1 {
  outputKind: "evavo_docs_book_legacy_craft_genome_result";
  schemaVersion: 1;
  contract: typeof EVAVO_DOCS_SUITE_LEGACY_CRAFT_CONTRACT;
  status: "completed";
  requestId: string;
  operation: EvavoLegacyCraftOperation;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  requestFingerprint: string;
  result: Record<string, unknown>;
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

export interface EvavoDocsSuiteLegacyCraftApiResponseV1 {
  ok: true;
  workspaceId: string;
  actorType: string;
  result: EvavoDocsSuiteLegacyCraftCompatibilityResultV1;
}

export interface EvavoDocsSuiteLegacyCraftProxyReceiptV1 {
  result: Record<string, unknown>;
  requestFingerprint: string;
  resultFingerprint: string;
  operation: EvavoLegacyCraftOperation;
  sourceCommit: string;
  remoteExecutionPerformed: true;
  localExecutionPerformed: false;
}
