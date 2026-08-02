export interface BookAuthoringAdmissionEvidenceV1 {
  outputKind: "evavo_docs_book_authoring_admission_evidence";
  schemaVersion: 1;
  packetFingerprint: string;
  resultFingerprint: string;
  phraseOverlapReceiptFingerprint: string;
  continuityReceiptFingerprint: string;
  factualIntegrityReceiptFingerprint: string;
  antiGenericityReceiptFingerprint: string;
  independentReviewReceiptFingerprint: string;
  phraseOverlapPassed: boolean;
  continuityPassed: boolean;
  factualIntegrityPassed: boolean;
  antiGenericityPassed: boolean;
  independentReviewPassed: boolean;
  humanReviewRequired: boolean;
  humanReviewRecorded: boolean;
  beforeManuscriptSha256: string;
  proposedAfterManuscriptSha256: string;
  evidenceIds: string[];
  evidenceFingerprint: string;
}
