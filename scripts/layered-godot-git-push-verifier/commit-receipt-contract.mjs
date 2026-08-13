import {
  LayeredGodotGitPushOperatorError,
  validateCommitReceipt as validateOperatorCommitReceipt,
} from "../layered-godot-git-push-operator/contract.mjs";
import { verifierFail } from "./protocol.mjs";

export function validateCommitReceipt(
  value,
  repository,
  root,
  sameFilesystemPath,
) {
  try {
    return validateOperatorCommitReceipt(
      value,
      repository,
      root,
      sameFilesystemPath,
    );
  } catch (error) {
    if (error instanceof LayeredGodotGitPushOperatorError) {
      verifierFail(
        "COMMIT_RECEIPT_INVALID",
        "Commit receipt failed the current closed commit-operator admission contract.",
        { upstreamCode: error.code },
      );
    }
    throw error;
  }
}
