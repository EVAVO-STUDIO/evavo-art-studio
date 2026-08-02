export interface BookManuscriptRevisionV1 {
  revisionId: string;
  parentRevisionId?: string;
  projectId: string;
  volumeId: string;
  manuscriptObjectId: string;
  manuscriptStorageVersion: string;
  manuscriptByteLength: number;
  manuscriptSha256: string;
  unitSequenceSha256: string;
  orderedUnitIds: string[];
  createdAt: string;
  createdBy: string;
  canonical: false;
}
