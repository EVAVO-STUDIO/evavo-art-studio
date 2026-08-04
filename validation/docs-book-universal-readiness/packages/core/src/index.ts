/**
 * @evavo-docs/core
 *
 * Shared, dependency-light contracts for EVAVO Docs Suite.
 */

export const packageName = "@evavo-docs/core";
export * from "./book-studio-art-contracts";
export * from "./book-studio-art-brief-exact";
export * from "./book-studio-art-plan-translation";
export * from "./book-studio-art-legacy-compat";
export * from "./book-studio-legacy-art-use-safe";
export * from "./book-studio-legacy-art-use-boundary";
export * from "./book-studio-legacy-art-use-batch";
export * from "./book-studio-art-promotion-join";
export {
  fingerprintArtStudioBookPromotionBatch,
  fingerprintWebsiteBookArtworkUseIntent,
  joinBookArtPromotionsToUseIntents,
} from "./book-studio-art-promotion-join";
export * from "./book-studio-artwork-use-persistence-safe";
export {
  InMemoryBookArtworkUsePersistenceAdapterV1,
  persistBookArtworkUseBatch,
} from "./book-studio-artwork-use-persistence-safe";
export * from "./book-studio-project-contracts";
export {
  BOOK_UNIVERSAL_READINESS_CONTRACT,
  SUPPORTED_BOOK_CONTENT_CLASSES,
  type BookAutomationOwner,
  type BookAutomationStageKind,
  type BookAutomationStageV1,
  type BookCoverReadinessV1,
  type BookIllustrationReadinessV1,
  type BookReadinessFindingV1,
  type BookReadinessScope,
  type BookReadinessSeverity,
  type BookUniversalReadinessResultV1,
  type BookUniversalReadinessStatus,
  type BookUniversalReadinessTotalsV1,
  type BookVolumeUniversalReadinessV1,
} from "./book-studio-universal-readiness";
export {
  compileGovernedBookUniversalReadiness,
  compileGovernedBookUniversalReadiness as compileBookUniversalReadiness,
} from "./book-studio-universal-readiness-governance";
export * from "./book-studio-manuscript-contracts";
export * from "./book-studio-legacy-project-import";
export * from "./book-studio-execution-contracts";
export * from "./book-studio-execution-plan";
export * from "./book-studio-execution-state";
export * from "./book-studio-legacy-execution-import";
export * from "./book-studio-story-contracts";
export * from "./book-studio-legacy-story-import";
export * from "./book-studio-authoring";
export * from "./book-studio-writing-handoff";
export * from "./book-studio-writing-candidate";
export * from "./book-studio-legacy-authoring-import";
export * from "./book-studio-review-craft";
export * from "./book-studio-canonical-mutation";
export * from "./book-studio-writing-art-link";
export * from "./book-studio-writing-art-release";
export * from "./book-studio-publication";
export * from "./book-studio-operation";
export * from "./book-studio-state-migration-bundle";
export * from "./book-studio-state-shadow-import";
export * from "./book-studio-legacy-writer";
export * from "./book-studio-autopilot";
export * from "./book-studio-autopilot-routing";
