export interface StubAuthoringPacket {
  projectId: string;
  programmeId: string;
  volumeId: string;
  manuscriptRevisionId: string;
  manuscriptSha256: string;
  contextEvidenceIds: string[];
}

export async function validateAndNormalizeBookAuthoringPacket(
  input: unknown,
): Promise<{
  status: "ready" | "blocked";
  packet?: StubAuthoringPacket;
  blockers: string[];
}> {
  const packet = input as StubAuthoringPacket;
  if (
    !packet ||
    typeof packet !== "object" ||
    !packet.projectId ||
    !packet.programmeId ||
    !packet.volumeId ||
    !packet.manuscriptRevisionId ||
    !packet.manuscriptSha256 ||
    !Array.isArray(packet.contextEvidenceIds)
  ) {
    return { status: "blocked", blockers: ["invalid packet"] };
  }
  return { status: "ready", packet, blockers: [] };
}
