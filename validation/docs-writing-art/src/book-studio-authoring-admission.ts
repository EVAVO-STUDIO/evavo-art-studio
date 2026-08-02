import type { BookAuthoringAdmissionEvidenceV1 } from "./book-studio-authoring-types";

export async function evaluateBookAuthoringAdmission(
  _packet: unknown,
  _result: unknown,
  evidenceInput: unknown,
): Promise<{
  status: "ready_for_website_compare_and_swap" | "blocked";
  blockers: string[];
  requiredActions: string[];
  admissionFingerprint: string;
}> {
  const evidence = evidenceInput as BookAuthoringAdmissionEvidenceV1;
  const passed =
    evidence?.phraseOverlapPassed === true &&
    evidence?.continuityPassed === true &&
    evidence?.factualIntegrityPassed === true &&
    evidence?.antiGenericityPassed === true &&
    evidence?.independentReviewPassed === true &&
    evidence?.humanReviewRecorded === true &&
    typeof evidence?.evidenceFingerprint === "string";
  return passed
    ? {
        status: "ready_for_website_compare_and_swap",
        blockers: [],
        requiredActions: [],
        admissionFingerprint: evidence.evidenceFingerprint,
      }
    : {
        status: "blocked",
        blockers: ["invalid admission"],
        requiredActions: [],
        admissionFingerprint: "sha256:" + "0".repeat(64),
      };
}
