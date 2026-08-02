/**
 * @evavo-docs/core
 *
 * Shared, dependency-light contracts for EVAVO Docs Suite.
 */

export const packageName = "@evavo-docs/core";
export * from "./book-studio-art-contracts";
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
