export interface StubWritingRequest {
  manuscriptRevisionId: string;
  requestFingerprint: string;
  requiredEvidenceIds: string[];
}

export interface StubWritingResponse {
  candidateObjectId?: string;
  candidateSha256?: string;
  candidateByteLength?: number;
  voiceEvidenceIds: string[];
  factEvidenceIds: string[];
  qualityReceiptIds: string[];
  completedAt: string;
  responseFingerprint: string;
}

export async function validateBookWritingHandoffResponse(
  _packet: unknown,
  requestInput: unknown,
  responseInput: unknown,
): Promise<{
  status: "ready" | "blocked";
  request?: StubWritingRequest;
  response?: StubWritingResponse;
  blockers: string[];
  requiredActions: string[];
}> {
  const request = requestInput as StubWritingRequest;
  const response = responseInput as StubWritingResponse;
  if (
    !request ||
    !request.manuscriptRevisionId ||
    !request.requestFingerprint ||
    !Array.isArray(request.requiredEvidenceIds) ||
    !response ||
    !response.candidateObjectId ||
    !response.candidateSha256 ||
    !response.candidateByteLength ||
    !Array.isArray(response.voiceEvidenceIds) ||
    !Array.isArray(response.factEvidenceIds) ||
    !Array.isArray(response.qualityReceiptIds) ||
    !response.completedAt ||
    !response.responseFingerprint
  ) {
    return {
      status: "blocked",
      blockers: ["invalid Writing handoff"],
      requiredActions: [],
    };
  }
  return {
    status: "ready",
    request,
    response,
    blockers: [],
    requiredActions: [],
  };
}
