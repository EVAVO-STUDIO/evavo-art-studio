import {
  EXPECTED_GIT_COMMIT_OPERATOR_PROTOCOL_VERSION,
  EXPECTED_GIT_COMMIT_RECEIPT_KIND,
  LAYERED_GODOT_GIT_PUSH_OPERATOR_PROTOCOL_VERSION,
  LAYERED_GODOT_GIT_PUSH_RECEIPT_KIND,
} from "../layered-godot-git-push-operator/contract.mjs";

export const LAYERED_GODOT_GIT_PUSH_VERIFIER_PROTOCOL_VERSION = "2026-08-13.2";
export const LAYERED_GODOT_GIT_PUSH_VERIFICATION_RECEIPT_KIND =
  "evavo.layered-production.godot-git-push-verification-receipt";
export const EXPECTED_GIT_PUSH_OPERATOR_PROTOCOL_VERSION =
  LAYERED_GODOT_GIT_PUSH_OPERATOR_PROTOCOL_VERSION;
export const EXPECTED_GIT_PUSH_RECEIPT_KIND = LAYERED_GODOT_GIT_PUSH_RECEIPT_KIND;
export {
  EXPECTED_GIT_COMMIT_OPERATOR_PROTOCOL_VERSION,
  EXPECTED_GIT_COMMIT_RECEIPT_KIND,
};
export const MAXIMUM_VERIFIER_INPUT_BYTES = 32 * 1024 * 1024;
export const MAXIMUM_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAXIMUM_LOCAL_TIMEOUT_MS = 30_000;
export const MAXIMUM_NETWORK_TIMEOUT_MS = 120_000;
export const HTTPS_GITHUB_ORIGIN =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/u;

export class LayeredGodotGitPushVerifierError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "LayeredGodotGitPushVerifierError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function verifierFail(code, message, details = undefined) {
  throw new LayeredGodotGitPushVerifierError(
    `LAYERED_GODOT_GIT_PUSH_VERIFIER_${code}`,
    message,
    details,
  );
}
