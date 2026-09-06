import { createHash } from "node:crypto";
import type { WorkHeaderCandidateReviewResult } from "./work-header-candidate-review.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) output[key] = canonicalize(input[key]);
    return output;
  }
  return value;
}

export function digestWorkHeaderCandidateReviewEvidence(
  evidence: WorkHeaderCandidateReviewResult["evidence"],
): string {
  const canonical = JSON.stringify(canonicalize(evidence));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function assertWorkHeaderCandidateReviewEvidenceDigest(
  evidence: WorkHeaderCandidateReviewResult["evidence"],
  expectedSha256: string,
): string {
  if (!/^[0-9a-f]{64}$/u.test(expectedSha256)) {
    throw new Error("candidateReviewEvidenceSha256 must be a lowercase SHA-256 hex digest.");
  }
  const actual = digestWorkHeaderCandidateReviewEvidence(evidence);
  if (actual !== expectedSha256) throw new Error("Candidate-review evidence digest mismatch; receipt evidence may have changed after critique.");
  return actual;
}
