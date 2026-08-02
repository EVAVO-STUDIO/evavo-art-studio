export interface StubAuthoringResult {
  candidateObjectId?: string;
  candidateTextSha256?: string;
  candidateByteLength?: number;
  completedAt: string;
  producedEvidenceIds: string[];
  manuscriptSha256After: string;
  resultFingerprint: string;
}

export async function validateBookAuthoringResult(
  _packet: unknown,
  input: unknown,
): Promise<{
  status: "accepted_for_review" | "blocked";
  result?: StubAuthoringResult;
  blockers: string[];
  requiredActions: string[];
}> {
  const result = input as StubAuthoringResult;
  if (
    !result ||
    !result.candidateObjectId ||
    !result.candidateTextSha256 ||
    !result.candidateByteLength ||
    !result.completedAt ||
    !Array.isArray(result.producedEvidenceIds) ||
    !result.manuscriptSha256After ||
    !result.resultFingerprint
  ) {
    return {
      status: "blocked",
      blockers: ["invalid result"],
      requiredActions: [],
    };
  }
  return {
    status: "accepted_for_review",
    result,
    blockers: [],
    requiredActions: [],
  };
}
