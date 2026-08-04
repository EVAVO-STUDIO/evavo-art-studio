export type EvavoBookStudioAgentProvider =
  | "chatgpt"
  | "claude"
  | "other_compatible_model";

export type EvavoCraftInfluenceSourceKind =
  | "public_domain"
  | "licensed"
  | "user_owned"
  | "project_owned"
  | "abstract_profile"
  | "restricted_reference"
  | "synthesized_profile";

export type EvavoCraftRightsBasis =
  | "public_domain"
  | "explicit_license"
  | "user_owned"
  | "project_owned"
  | "abstract_observation"
  | "restricted_reference"
  | "derived_abstract_profile";

export type EvavoCraftSurfaceSpecificity = "general" | "distinctive" | "phrase_level";

export interface EvavoCraftInfluenceProvenance {
  sourceId: string;
  privateLabel: string;
  sourceKind: EvavoCraftInfluenceSourceKind;
  rightsBasis: EvavoCraftRightsBasis;
  rightsEvidenceIds: string[];
  sourceFingerprint: string;
  providerContextAllowed: boolean;
  phraseComparisonAllowed: boolean;
  parentProfileId?: string;
  parentProfileFingerprint?: string;
  parentSynthesisDepth?: number;
  ancestryProfileFingerprints?: string[];
}

export interface EvavoCraftMechanismObservation {
  mechanismId: string;
  dimensionId: string;
  description: string;
  polarity: number;
  strength: number;
  confidence: number;
  evidenceIds: string[];
  surfaceSpecificity: EvavoCraftSurfaceSpecificity;
}

export interface EvavoCraftInfluence {
  influenceId: string;
  requestedWeight: number;
  provenance: EvavoCraftInfluenceProvenance;
  mechanisms: EvavoCraftMechanismObservation[];
}

export interface EvavoCraftGenomePolicy {
  minimumInfluences?: number;
  maximumInfluences?: number;
  maximumDominantWeight?: number;
  minimumInfluenceDiversity?: number;
  minimumProfileDistanceFromInfluence?: number;
  maximumSynthesisDepth?: number;
  requireProjectVoiceAnchors?: boolean;
  minimumProjectVoiceAnchors?: number;
}

export interface EvavoCraftGenomeCompileInput {
  programmeId: string;
  profileId: string;
  profileVersion: number;
  influences: EvavoCraftInfluence[];
  projectVoiceAnchorIds: string[];
  narrativeConstraintIds: string[];
  acceptedPatternIds: string[];
  rejectedPatternIds: string[];
  policy?: EvavoCraftGenomePolicy;
}

export interface EvavoNormalizedCraftInfluence {
  influenceId: string;
  normalizedWeight: number;
  sourceKind: EvavoCraftInfluenceSourceKind;
  rightsBasis: EvavoCraftRightsBasis;
  sourceFingerprint: string;
  productionMechanismIds: string[];
  withheldMechanismIds: string[];
  ancestryProfileFingerprints: string[];
  synthesisDepth: number;
}

export interface EvavoCraftGenomeDimension {
  dimensionId: string;
  value: number;
  confidence: number;
  mechanismCount: number;
  productionDirections: string[];
  sourceInfluenceIds: string[];
}

export interface EvavoCraftInfluenceDistance {
  influenceId: string;
  distance: number;
}

export interface EvavoCraftGenomeProfile {
  outputKind: "evavo_book_studio_craft_genome_profile";
  schemaVersion: 1;
  status: "ready" | "blocked";
  programmeId: string;
  profileId: string;
  profileVersion: number;
  synthesisDepth: number;
  normalizedInfluences: EvavoNormalizedCraftInfluence[];
  dimensions: EvavoCraftGenomeDimension[];
  influenceDistances: EvavoCraftInfluenceDistance[];
  pairwiseInfluenceDiversity: number;
  projectVoiceAnchorIds: string[];
  narrativeConstraintIds: string[];
  acceptedPatternIds: string[];
  rejectedPatternIds: string[];
  providerInstruction: string;
  providerBriefContainsNamedSources: false;
  directImitationPermitted: false;
  phraseLaunderingPermitted: false;
  projectOwnedExpressionRequired: true;
  blockers: string[];
  warnings: string[];
  profileFingerprint: string;
  nextAction: string;
  boundary: string;
}

export interface EvavoCraftPhraseReference {
  referenceId: string;
  sourceKind: EvavoCraftInfluenceSourceKind;
  rightsEvidenceIds: string[];
  text: string;
  textSha256?: string;
  allowQuotedUse?: boolean;
}

export interface EvavoCraftPhraseOverlapFinding {
  findingId: string;
  referenceId: string;
  overlapWords: number;
  matchedText: string;
  candidateTokenIndex: number;
  referenceTokenIndex: number;
  severity: "info" | "warning" | "blocking";
  allowedQuotedUse: boolean;
}

export interface EvavoCraftPhraseOverlapScan {
  outputKind: "evavo_book_studio_craft_phrase_overlap_scan";
  schemaVersion: 1;
  scanId: string;
  candidateId: string;
  candidateTextSha256: string;
  warningNgram: number;
  blockingNgram: number;
  referenceFingerprints: Array<{ referenceId: string; textSha256: string }>;
  findings: EvavoCraftPhraseOverlapFinding[];
  blockingFindingIds: string[];
  accepted: boolean;
  boundary: string;
}

export type EvavoCraftGenomeProviderExecutionMode =
  | "strict_json_schema"
  | "forced_single_tool"
  | "adapter_json_schema";

export interface EvavoCraftGenomeProviderPacketInput {
  packetId: string;
  provider: EvavoBookStudioAgentProvider;
  modelName: string;
  objective: string;
  targetUnitIds: string[];
  contextEvidenceIds: string[];
  profile: EvavoCraftGenomeProfile;
}

export interface EvavoCraftGenomeProviderPacket {
  outputKind: "evavo_book_studio_craft_genome_provider_packet";
  schemaVersion: 1;
  packetId: string;
  provider: EvavoBookStudioAgentProvider;
  modelName: string;
  objective: string;
  targetUnitIds: string[];
  contextEvidenceIds: string[];
  profileId: string;
  profileVersion: number;
  profileFingerprint: string;
  providerExecutionMode: EvavoCraftGenomeProviderExecutionMode;
  responseToolName: "evavo_book_studio_craft_genome_response";
  systemInstruction: string;
  taskInstruction: string;
  responseContractFormat: "json_schema";
  responseContractStrict: true;
  responseContract: string;
  responseContractSha256: string;
  blockers: string[];
  ready: boolean;
  boundary: string;
  packetFingerprint: string;
}

export interface EvavoCraftGenomeProviderResponse {
  outputKind: "evavo_book_studio_craft_genome_provider_response";
  schemaVersion: 1;
  packetId: string;
  provider: EvavoBookStudioAgentProvider;
  modelName: string;
  profileFingerprint: string;
  targetUnitIds: string[];
  candidateText: string;
  appliedDimensionIds: string[];
  preservedVoiceAnchorIds: string[];
  rejectedPatternChecks: Record<string, { passed: boolean; evidence: string }>;
  unresolvedRisks: string[];
  phraseOverlapScanRequired: true;
  continuation: {
    complete: boolean;
    remainingUnitIds: string[];
    exactTail: string;
  };
}

export interface EvavoCraftGenomeProviderResponseAcceptance {
  outputKind: "evavo_book_studio_craft_genome_provider_response_acceptance";
  schemaVersion: 1;
  status: "accepted_for_phrase_scan" | "continuation_required" | "needs_work" | "blocked";
  packetId: string;
  packetFingerprint: string;
  responseContractSha256: string;
  acceptedForPhraseScan: boolean;
  canonicalAdmissionAllowed: false;
  blockers: string[];
  requiredActions: string[];
  normalizedResponse?: EvavoCraftGenomeProviderResponse;
  nextAction: string;
  boundary: string;
}
