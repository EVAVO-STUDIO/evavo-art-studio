import type { BookAuthorialVoiceEnhancementTargetId } from "./book-studio-authorial-voice-types";

export const BOOK_AUTHORIAL_SYNTHESIS_CONTRACT = "evavo_docs_book_authorial_synthesis_v1" as const;
export const BOOK_AUTHORIAL_SYNTHESIS_SCHEMA_VERSION = 1 as const;

export type BookAuthorialUnitKind =
  | "story_concept"
  | "outline"
  | "synopsis"
  | "prologue"
  | "chapter"
  | "scene"
  | "dialogue_exchange"
  | "action_sequence"
  | "description"
  | "reflection"
  | "interlude"
  | "epilogue"
  | "codex_entry"
  | "letter_or_document"
  | "poem_or_song_fragment"
  | "title"
  | "chapter_title"
  | "blurb"
  | "author_note"
  | "line_level_pass";

export type BookAuthorialSynthesisOperation =
  | "ideate"
  | "draft"
  | "revise"
  | "expand"
  | "compress"
  | "restructure"
  | "line_edit"
  | "dialogue_polish"
  | "emotion_deepen"
  | "tension_build"
  | "description_enrich"
  | "continuity_repair"
  | "opening_rework"
  | "ending_rework";

export type BookProseDeviceId =
  | "anaphora"
  | "epistrophe"
  | "strategic_repetition"
  | "parallelism"
  | "asyndeton"
  | "polysyndeton"
  | "fragment"
  | "periodic_sentence"
  | "cumulative_sentence"
  | "free_indirect_thought"
  | "juxtaposition"
  | "callback"
  | "defamiliarisation"
  | "metonymy"
  | "synecdoche"
  | "understatement"
  | "negative_space"
  | "withheld_subject"
  | "sensory_crossfade"
  | "sonic_echo"
  | "image_turn"
  | "motif_transformation";

export type BookDialogueTextureId =
  | "plain_direct"
  | "guarded"
  | "status_formal"
  | "intimate_indirect"
  | "hostile_courteous"
  | "comic_deflection"
  | "procedural"
  | "ritualised"
  | "fragmented_under_pressure"
  | "misunderstanding_and_repair"
  | "strategic_silence"
  | "mixed";

export type BookAuthorialChangeLayerId =
  | "meaning"
  | "canon"
  | "causality"
  | "character_motive"
  | "viewpoint"
  | "scene_structure"
  | "paragraph_structure"
  | "sentence_structure"
  | "diction"
  | "imagery"
  | "dialogue_surface"
  | "punctuation";

export interface BookProseDeviceBudgetV1 {
  deviceId: BookProseDeviceId;
  maximumPerThousandWords: number;
  purpose: string;
  evidenceIds: string[];
}

export interface BookAuthorialEnhancementBudgetV1 {
  targetId: BookAuthorialVoiceEnhancementTargetId;
  strength: number;
  maximumVoiceDriftContribution: number;
  evidenceIds: string[];
}

export interface BookAuthorialFlavourPlanV1 {
  imageSourceDomainIds: string[];
  motifIds: string[];
  dialogueTextureIds: BookDialogueTextureId[];
  proseDeviceBudgets: BookProseDeviceBudgetV1[];
  prohibitedDeviceIds: BookProseDeviceId[];
  authorialRiskBudget: number;
  maximumNewMotifs: number;
  maximumFigurativeClustersPerThousandWords: number;
  evidenceIds: string[];
}

export interface BookAuthorialChangePolicyV1 {
  semanticPreservationRequired: boolean;
  maximumSurfaceChangeRatio: number;
  lockedLayerIds: BookAuthorialChangeLayerId[];
  flexibleLayerIds: BookAuthorialChangeLayerId[];
  requireBeforeAfterEvidence: boolean;
  requireVoiceComparison: boolean;
  requireNarrativeCraftEvaluation: boolean;
  requirePhraseOverlapScan: boolean;
  requireIndependentReview: boolean;
}

export interface BookAuthorialSynthesisCompileInputV1 {
  outputKind: "evavo_docs_book_authorial_synthesis_compile_input";
  schemaVersion: 1;
  programmeId: string;
  projectId: string;
  volumeId: string;
  manuscriptRevisionId: string;
  synthesisId: string;
  synthesisVersion: number;
  unitKind: BookAuthorialUnitKind;
  operation: BookAuthorialSynthesisOperation;
  targetUnitIds: string[];
  sourceTextSha256?: string;
  authorialVoiceProfile: unknown;
  narrativeRegisterProfile: unknown;
  narrativeCraftPacket: unknown;
  ideaLabEvaluation?: unknown;
  selectedIdeaId?: string;
  enhancementBudgets: BookAuthorialEnhancementBudgetV1[];
  flavourPlan: BookAuthorialFlavourPlanV1;
  changePolicy: BookAuthorialChangePolicyV1;
  objective: string;
  exactMeaningIds: string[];
  canonEvidenceIds: string[];
  factEvidenceIds: string[];
  continuityEvidenceIds: string[];
  evidenceIds: string[];
}

export interface BookAuthorialSynthesisQualityGateV1 {
  gateId: string;
  mandatory: boolean;
  passCondition: string;
  requiredEvidenceKinds: string[];
}

export interface BookAuthorialSynthesisContextBlockV1 {
  objectId: string;
  objectFingerprint: string;
  role: "constraint";
  text: string;
  textSha256: string;
}

export interface BookAuthorialSynthesisPacketV1 {
  outputKind: "evavo_docs_book_authorial_synthesis_packet";
  schemaVersion: 1;
  contract: typeof BOOK_AUTHORIAL_SYNTHESIS_CONTRACT;
  status: "ready";
  programmeId: string;
  projectId: string;
  volumeId: string;
  manuscriptRevisionId: string;
  synthesisId: string;
  synthesisVersion: number;
  unitKind: BookAuthorialUnitKind;
  operation: BookAuthorialSynthesisOperation;
  targetUnitIds: string[];
  sourceTextSha256?: string;
  authorialVoiceProfileFingerprint: string;
  narrativeRegisterProfileFingerprint: string;
  narrativeCraftPacketFingerprint: string;
  ideaLabEvaluationFingerprint?: string;
  selectedIdeaId?: string;
  enhancementBudgets: BookAuthorialEnhancementBudgetV1[];
  flavourPlan: BookAuthorialFlavourPlanV1;
  changePolicy: BookAuthorialChangePolicyV1;
  objective: string;
  exactMeaningIds: string[];
  canonEvidenceIds: string[];
  factEvidenceIds: string[];
  continuityEvidenceIds: string[];
  evidenceIds: string[];
  precedenceRules: string[];
  operationProtocol: string[];
  qualityGates: BookAuthorialSynthesisQualityGateV1[];
  providerInstruction: string;
  writingContextBlock: BookAuthorialSynthesisContextBlockV1;
  packetFingerprint: string;
  projectVoiceRemainsAuthoritative: true;
  genreRegisterMayReplaceVoice: false;
  ideaMayOverrideCanon: false;
  namedCreatorInstructionPermitted: false;
  rawSourceTextPersisted: false;
  providerCallPerformed: false;
  automaticCanonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  publicationPerformed: false;
}

export interface BookAuthorialSynthesisCompileResultV1 {
  outputKind: "evavo_docs_book_authorial_synthesis_compile_result";
  schemaVersion: 1;
  status: "ready" | "blocked";
  packet?: BookAuthorialSynthesisPacketV1;
  packetFingerprint?: string;
  blockers: string[];
  warnings: string[];
  providerCallPerformed: false;
  automaticCanonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  publicationPerformed: false;
}
