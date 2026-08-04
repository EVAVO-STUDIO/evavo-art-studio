export const BOOK_STATE_MIGRATION_BUNDLE_CONTRACT =
  "evavo_docs_book_state_migration_bundle_v1" as const;

export interface ValidationResult {
  status: "blocked" | "needs_resolution" | "ready_for_cutover_review";
}

export async function compileBookStateMigrationBundle(
  _input: unknown,
  _executeOperation: (request: unknown) => Promise<unknown>,
): Promise<ValidationResult> {
  return { status: "ready_for_cutover_review" };
}
