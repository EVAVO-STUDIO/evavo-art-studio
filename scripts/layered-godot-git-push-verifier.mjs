#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

export {
  EXPECTED_GIT_COMMIT_OPERATOR_PROTOCOL_VERSION,
  EXPECTED_GIT_COMMIT_RECEIPT_KIND,
  EXPECTED_GIT_PUSH_OPERATOR_PROTOCOL_VERSION,
  EXPECTED_GIT_PUSH_RECEIPT_KIND,
  LAYERED_GODOT_GIT_PUSH_VERIFICATION_RECEIPT_KIND,
  LAYERED_GODOT_GIT_PUSH_VERIFIER_PROTOCOL_VERSION,
  LayeredGodotGitPushVerifierError,
} from "./layered-godot-git-push-verifier/protocol.mjs";
export { canonicalSha256 } from "./layered-godot-git-push-verifier/canonical.mjs";
export { snapshotJsonValue } from "./layered-godot-git-push-verifier/snapshot.mjs";
export { validateCommitReceipt } from "./layered-godot-git-push-verifier/commit-receipt-contract.mjs";
export { validatePushReceipt } from "./layered-godot-git-push-verifier/receipt-contract.mjs";
export { verifyLayeredGodotPushReceipt } from "./layered-godot-git-push-verifier/runtime.mjs";

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { runCli } = await import("./layered-godot-git-push-verifier/cli.mjs");
  await runCli();
}
