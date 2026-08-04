import "server-only";

import {
  BOOK_STATE_SHADOW_IMPORT_CONTRACT,
  BOOK_STATE_SHADOW_ROLLBACK_CONTRACT,
  compileBookStateShadowRollbackPlan,
  prepareBookStateShadowImport,
} from "../../../../packages/core/src/book-studio-state-shadow-import.ts";
import {
  executeBookStudioOperation,
} from "../../../../packages/core/src/book-studio-operation-dispatch.ts";
import {
  FileBookStudioShadowStatePersistence,
} from "./book-studio-shadow-state-persistence.ts";

export {
  BOOK_STATE_SHADOW_IMPORT_CONTRACT,
  BOOK_STATE_SHADOW_ROLLBACK_CONTRACT,
};

export type BookStateShadowImportServiceOperation =
  | "import"
  | "rehearse_rollback";

export async function executeBookStateShadowImportService(
  operation: BookStateShadowImportServiceOperation,
  request: unknown,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const root = environment.BOOK_STUDIO_SHADOW_STATE_ROOT?.trim() ?? "";
  if (!root) throw new Error("BOOK_STATE_SHADOW_STORE_ROOT_REQUIRED");
  const store = new FileBookStudioShadowStatePersistence(root);
  if (operation === "import") {
    const prepared = await prepareBookStateShadowImport(
      request,
      executeBookStudioOperation,
    );
    return store.importPrepared(prepared);
  }
  if (operation === "rehearse_rollback") {
    const plan = await compileBookStateShadowRollbackPlan(request);
    return store.rehearseRollback(plan);
  }
  throw new Error("BOOK_STATE_SHADOW_IMPORT_OPERATION_INVALID");
}
