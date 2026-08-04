import "server-only";

import {
  BOOK_STATE_MIGRATION_BUNDLE_CONTRACT,
  compileBookStateMigrationBundle,
} from "../../../../packages/core/src/book-studio-state-migration-bundle";
import {
  executeBookStudioOperation,
} from "../../../../packages/core/src/book-studio-operation-dispatch";

export { BOOK_STATE_MIGRATION_BUNDLE_CONTRACT };

export async function validateBookStudioStateMigrationBundle(
  input: unknown,
) {
  return compileBookStateMigrationBundle(input, executeBookStudioOperation);
}
