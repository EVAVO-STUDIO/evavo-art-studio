import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_ART_HANDOFF_CONTRACT,
  translateLegacyBookArtArtifactReference,
  validateBookArtArtifactReceipt,
  validateBookArtBrief,
  validateBookArtworkUseBinding,
  validateLegacyCompatibleBookArtArtifactReceipt,
  validateLegacyCompatibleBookArtworkUseBinding,
} from "../dist/index.js";

const sha = (character) => character.repeat(64);
function brief() {
  return {
    outputKind: "evavo_book_art_brief", schemaVersion: 1, contract: BOOK_ART_HANDOFF_CONTRACT,
    identity: { workspaceId: "workspace-1", projectId: "project-1", bookId: "book-1", editionId: "paperback-1", requestId: "request-1" },
    purpose: "front_cover_art",
    manuscript: { manuscriptRevisionId: "manuscript-4", manuscriptSha256: sha("a"), extractedTextSha256: sha("b"), visualCanonSha256: sha("c"), artDirectionSha256: sha("d"), approvedEvidenceIds: ["evidence-1"] },
    conceptTerritoryId: "manuscript-first", conceptTerritoryLabel: "Manuscript first",
    creativeThesis: "A restrained image built around one manuscript-specific object and a protected title field.",
    primarySubject: "The weathered object identified by approved visual canon", supportingSubjects: [],
    compositionRequirements: ["Protect the upper-right title field."], mustShow: ["One exact manuscript-specific object."],
    mustNotShow: ["Generated lettering", "Unapproved characters"], spoilerRestrictions: ["Do not reveal the final identity."],
    continuityRequirements: ["Match the approved object and period state."], historicalAndMaterialRequirements: ["Use period-correct material construction."],
    negativeSpaceRequirements: ["Keep 30 percent quiet space for editable type."],
    output: { widthPx: 3000, heightPx: 4800, minimumPpi: 300, allowedMimeTypes: ["image/png", "image/tiff"], colourIntent: "rgb", alpha: "allowed", textPolicy: "text_free", printUse: true, digitalUse: true },
    rightsEvidenceIds: ["rights-1"], createdAt: "2026-08-02T00:00:00.000Z", briefFingerprint: sha("e"),
    providerCandidateMayBeFinal: false, publicationPerformed: false,
  };
}
function approvedArtifact() {
  return {
    outputKind: "evavo_book_art_artifact_receipt", schemaVersion: 1, contract: BOOK_ART_HANDOFF_CONTRACT,
    identity: brief().identity, sourceBriefFingerprint: brief().briefFingerprint, status: "approved",
    artifactId: "approved-cover-art-1", artifactReference: "evavo-art://approved/approved-cover-art-1", contentSha256: sha("f"), byteLength: 123456,
    mimeType: "image/png", widthPx: 3000, heightPx: 4800,
    provenance: { origin: "ai_assisted", provider: "reviewed-provider", model: "reviewed-model", promptSha256: sha("1"), sourceArtifactIds: ["source-1"], rightsEvidenceIds: ["rights-1"], rightsStatus: "approved_commercial", aiDisclosure: "ai_assisted" },
    technicalQualityReceiptSha256: sha("2"), selectionReceiptSha256: sha("3"), promotionReceiptSha256: sha("4"), promotedBy: "named-art-director", promotedAt: "2026-08-02T01:00:00.000Z",
    generatedTextDetected: false, unresolvedRisks: [], artifactFingerprint: sha("5"), publicationPerformed: false,
  };
}
function bindingFor(artifact) {
  return { outputKind: "evavo_book_artwork_use_binding", schemaVersion: 1, contract: BOOK_ART_HANDOFF_CONTRACT, identity: artifact.identity, purpose: "front_cover_art", sourceBriefFingerprint: artifact.sourceBriefFingerprint, approvedArtifactId: artifact.artifactId, approvedArtifactReference: artifact.artifactReference, approvedArtifactSha256: artifact.contentSha256, promotionReceiptSha256: artifact.promotionReceiptSha256, sceneOrPlacementId: "cover-scene-1", cropOrPlacementSha256: sha("6"), boundAt: "2026-08-02T02:00:00.000Z", boundBy: "book-designer", useFingerprint: sha("7"), canonicalRendererMustVerifyBytes: true, publicationPerformed: false };
}

test("accepts an exact manuscript-bound, text-free cover brief", () => {
  assert.deepEqual(validateBookArtBrief(brief()), { valid: true, issues: [] });
});
test("rejects generated cover lettering and provider-final claims", () => {
  const value = brief(); value.output.textPolicy = "exact_editable_labels_only"; value.providerCandidateMayBeFinal = true;
  const result = validateBookArtBrief(value); assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.includes("text-free")));
  assert.ok(result.issues.some((entry) => entry.includes("never be marked final")));
});
test("requires selection and promotion before an artifact is approved", () => {
  const value = approvedArtifact(); delete value.promotionReceiptSha256;
  const result = validateBookArtArtifactReceipt(value); assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.includes("promotionReceiptSha256")));
});
test("allows book use only for the exact approved promoted artifact", () => {
  const artifact = approvedArtifact();
  const binding = bindingFor(artifact);
  assert.deepEqual(validateBookArtworkUseBinding(binding, artifact), { valid: true, issues: [] });
  const candidate = { ...artifact, status: "candidate", promotionReceiptSha256: undefined };
  const rejected = validateBookArtworkUseBinding(binding, candidate); assert.equal(rejected.valid, false);
  assert.ok(rejected.issues.some((entry) => entry.includes("approved Art Studio artifact")));
});
test("preserves legacy Website cover and publication artifact references without rewriting bytes", () => {
  for (const artifactReference of [
    "book-cover-artifact://project/art/source-artwork-abc.png",
    "book-publication-artifact://project/illustration/final-plate-def.tiff",
  ]) {
    const artifact = { ...approvedArtifact(), artifactReference };
    const translation = translateLegacyBookArtArtifactReference(artifactReference);
    assert.match(translation.canonicalReference, /^book-artifact:\/\/legacy\/(?:cover|publication)\//);
    assert.equal(translation.translation?.legacyReference, artifactReference);
    assert.equal(translation.translation?.sourceReferenceRetained, true);
    assert.equal(translation.translation?.bytesRewritten, false);
    const receipt = validateLegacyCompatibleBookArtArtifactReceipt(artifact);
    assert.equal(receipt.valid, true, receipt.issues.join("\n"));
    assert.equal(receipt.referenceTranslations.length, 1);
    const use = validateLegacyCompatibleBookArtworkUseBinding(bindingFor(artifact), artifact);
    assert.equal(use.valid, true, use.issues.join("\n"));
    assert.equal(use.referenceTranslations.length, 2);
  }
});
test("rejects a legacy use binding that silently changes the approved reference", () => {
  const artifact = { ...approvedArtifact(), artifactReference: "book-cover-artifact://project/art/source-artwork-abc.png" };
  const binding = { ...bindingFor(artifact), approvedArtifactReference: "book-cover-artifact://project/art/different.png" };
  const result = validateLegacyCompatibleBookArtworkUseBinding(binding, artifact);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.includes("differs from the exact approved artifact reference")));
});
