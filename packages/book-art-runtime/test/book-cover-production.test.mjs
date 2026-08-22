import assert from "node:assert/strict";
import test from "node:test";

import {
  compileBookCoverRenderPlan,
  evaluateBookCoverRelease,
} from "../dist/book-cover-production.js";

const sha = (char) => `sha256:${char.repeat(64)}`;
const artifact = (artifactId, objectId, mediaType, char, extra = {}) => ({
  artifactId,
  objectId,
  sha256: sha(char),
  mediaType,
  byteLength: 2_000_000,
  immutable: true,
  ...extra,
});

function planInput(format = "kindle_ebook") {
  const print = format !== "kindle_ebook";
  const metadata = {
    title: "The Salt Archive",
    subtitle: "A Novel of Weather and Memory",
    authorName: "G. R. Parker",
    seriesTitle: "The Archive Cycle",
    imprint: "EVAVO Press",
    backCopy: "The municipal ledgers survived the flood. Their names did not.",
  };
  const layers = [
    {
      role: "title",
      text: metadata.title,
      fontFamily: "Licensed Archive Display",
      fontLicenseEvidenceId: "evidence:font:title",
      fontSizePt: 38,
      x: 0.1,
      y: 0.12,
      width: 0.8,
      height: 0.18,
      alignment: "center",
    },
    {
      role: "subtitle",
      text: metadata.subtitle,
      fontFamily: "Licensed Archive Text",
      fontLicenseEvidenceId: "evidence:font:subtitle",
      fontSizePt: 14,
      x: 0.15,
      y: 0.32,
      width: 0.7,
      height: 0.08,
      alignment: "center",
    },
    {
      role: "author",
      text: metadata.authorName,
      fontFamily: "Licensed Archive Sans",
      fontLicenseEvidenceId: "evidence:font:author",
      fontSizePt: 18,
      x: 0.15,
      y: 0.84,
      width: 0.7,
      height: 0.08,
      alignment: "center",
    },
    {
      role: "series",
      text: metadata.seriesTitle,
      fontFamily: "Licensed Archive Text",
      fontLicenseEvidenceId: "evidence:font:series",
      fontSizePt: 9,
      x: 0.2,
      y: 0.04,
      width: 0.6,
      height: 0.05,
      alignment: "center",
    },
    {
      role: "back_copy",
      text: metadata.backCopy,
      fontFamily: "Licensed Archive Text",
      fontLicenseEvidenceId: "evidence:font:back",
      fontSizePt: 10,
      x: 0.12,
      y: 0.47,
      width: 0.76,
      height: 0.25,
      alignment: "left",
    },
    {
      role: "imprint",
      text: metadata.imprint,
      fontFamily: "Licensed Archive Sans",
      fontLicenseEvidenceId: "evidence:font:imprint",
      fontSizePt: 8,
      x: 0.38,
      y: 0.94,
      width: 0.24,
      height: 0.04,
      alignment: "center",
    },
    ...(print
      ? [
          {
            role: "spine_title",
            text: metadata.title,
            fontFamily: "Licensed Archive Display",
            fontLicenseEvidenceId: "evidence:font:spine-title",
            fontSizePt: 10,
            x: 0.48,
            y: 0.12,
            width: 0.04,
            height: 0.58,
            alignment: "center",
          },
          {
            role: "spine_author",
            text: metadata.authorName,
            fontFamily: "Licensed Archive Sans",
            fontLicenseEvidenceId: "evidence:font:spine-author",
            fontSizePt: 8,
            x: 0.48,
            y: 0.76,
            width: 0.04,
            height: 0.16,
            alignment: "center",
          },
        ]
      : []),
  ];
  return {
    outputKind: "evavo_book_cover_render_plan_input",
    schemaVersion: 1,
    compiledAt: "2026-08-22T03:00:00.000Z",
    identity: {
      tenantId: "tenant:evavo",
      workspaceId: "workspace:books",
      projectId: "project:salt-archive",
      bookId: "book:salt-archive",
      manuscriptId: "manuscript:salt-archive",
      editionId: `edition:salt-archive:${format}`,
      publicationId: `publication:salt-archive:${format}`,
      requestId: `request:cover:${format}`,
    },
    format,
    metadata,
    artDirection: {
      creativeThesis: "Treat the book as a recovered municipal object rather than a genre template.",
      styleThesis: "Salt bloom, tide lines and ledger geometry held in severe negative space.",
      historicalMaterialReferences: [
        "Nineteenth-century hydrographic charts",
        "Letterpress title pages",
        "Salt-damaged civic ledgers",
      ],
      genericPatternsRejected: [
        "Synthetic face collage",
        "Glowing portal",
        "Stock fog with distressed serif",
      ],
      imitationAvoidanceNotes: "Use material and process references only; do not imitate a living artist, current cover or protected trade dress.",
      approvalEvidenceId: "evidence:cover:direction:approved",
    },
    sourceArtwork: {
      selectedCandidateId: "candidate:cover:07",
      selectionEvidenceId: "evidence:cover:selection",
      artifact: artifact(
        "artifact:source:cover",
        "objects/books/salt-archive/source-art.png",
        "image/png",
        "a",
        { widthPx: 2400, heightPx: 3840, ppi: 300, colourSpace: "RGB" },
      ),
      textFree: true,
      provenanceMode: "ai_assisted",
      rightsEvidenceIds: ["evidence:cover:rights"],
      generationEvidenceIds: ["evidence:cover:generation"],
      originalityReviewEvidenceId: "evidence:cover:originality",
    },
    typography: {
      renderer: "deterministic_layout",
      modelRenderedText: false,
      metadataMatchEvidenceId: "evidence:cover:metadata-match",
      spellingReviewEvidenceId: "evidence:cover:spelling",
      layers,
    },
    ...(print
      ? {
          printGeometry: {
            trimWidthInches: 5.5,
            trimHeightInches: 8.5,
            pageCount: 320,
            bleedInches: 0.125,
            spineWidthInches: 0.72,
            spineTextEnabled: true,
            spineTextClearanceInches: 0.0625,
            templateArtifact: artifact(
              "artifact:kdp:template",
              "objects/books/salt-archive/kdp-template.pdf",
              "application/pdf",
              "b",
            ),
            templateFingerprintSha256: sha("c"),
            templateObservedAt: "2026-08-21T03:00:00.000Z",
            ...(format === "hardcover"
              ? {
                  hardcoverWrapInches: 0.51,
                  hardcoverSafeTextFromEdgeInches: 0.635,
                  hardcoverHingeInches: 0.4,
                }
              : {}),
            barcode: {
              policy: "amazon_placed",
              reservedWidthInches: 2,
              reservedHeightInches: 1.2,
              distanceFromSpineInches: 0.25,
              distanceFromTrimInches: 0.25,
              reserveClear: true,
              whiteBackground: true,
              blackBars: true,
              rightSideUp: true,
              squareToCover: true,
              flattenedIntoArtwork: false,
            },
          },
        }
      : {}),
  };
}

function commonInspections(print = false) {
  return {
    metadataMatchEvidenceId: "inspection:metadata",
    spellingEvidenceId: "inspection:spelling",
    thumbnailEvidenceId: "inspection:thumbnail",
    contrastEvidenceId: "inspection:contrast",
    safeZoneEvidenceId: "inspection:safe-zone",
    outputOpenEvidenceId: "inspection:opens",
    dimensionsEvidenceId: "inspection:dimensions",
    colourProfileEvidenceId: "inspection:colour",
    rightsEvidenceId: "inspection:rights",
    originalityEvidenceId: "inspection:originality",
    fontLicenceEvidenceId: "inspection:font-licence",
    ...(print
      ? {
          fontEmbeddingEvidenceId: "inspection:font-embedding",
          transparencyFlatteningEvidenceId: "inspection:transparency",
          noCropMarksEvidenceId: "inspection:no-crop-marks",
          noTemplateMarksEvidenceId: "inspection:no-template-marks",
          pdfUnlockedEvidenceId: "inspection:pdf-unlocked",
          templateMatchEvidenceId: "inspection:template-match",
          barcodeEvidenceId: "inspection:barcode",
        }
      : {}),
  };
}

function releaseInput(plan, format = "kindle_ebook") {
  const print = format !== "kindle_ebook";
  return {
    outputKind: "evavo_book_cover_release_input",
    schemaVersion: 1,
    evaluatedAt: "2026-08-22T03:20:00.000Z",
    plan,
    execution: {
      rendererId: "renderer:evavo-cover-compositor",
      rendererVersion: "1.0.0",
      renderedAt: "2026-08-22T03:10:00.000Z",
      renderReceiptId: "receipt:cover:render",
      renderPlanFingerprintSha256: plan.planFingerprintSha256,
      frontCover: artifact(
        "artifact:cover:front",
        "objects/books/salt-archive/front-cover.jpg",
        "image/jpeg",
        "d",
        {
          widthPx: 1600,
          heightPx: 2560,
          ppi: 300,
          colourSpace: "RGB",
        },
      ),
      ...(print
        ? {
            fullWrapCover: artifact(
              "artifact:cover:wrap",
              "objects/books/salt-archive/full-wrap.pdf",
              "application/pdf",
              "e",
              { ppi: 300, pageCount: 1, colourSpace: "CMYK" },
            ),
          }
        : {}),
      editableSource: artifact(
        "artifact:cover:editable",
        "objects/books/salt-archive/cover-source.json",
        "application/vnd.evavo.cover-source+json",
        "f",
      ),
      inspections: commonInspections(print),
    },
  };
}

test("compiles a deterministic, non-authoritative cover render plan", async () => {
  const first = await compileBookCoverRenderPlan(planInput());
  const second = await compileBookCoverRenderPlan(planInput());
  assert.equal(first.status, "ready", first.blockers.join("\n"));
  assert.equal(second.status, "ready", second.blockers.join("\n"));
  assert.equal(first.plan.planFingerprintSha256, second.plan.planFingerprintSha256);
  assert.equal(first.plan.renderingPerformed, false);
  assert.equal(first.plan.bookStudioImportPerformed, false);
  assert.deepEqual(first.plan.outputRequirements.frontCover.mediaTypes, [
    "image/jpeg",
    "image/tiff",
  ]);
});

test("releases a verified Kindle cover for Book Studio import", async () => {
  const compiled = await compileBookCoverRenderPlan(planInput());
  const result = await evaluateBookCoverRelease(releaseInput(compiled.plan));
  assert.equal(result.status, "ready_for_book_studio_import", result.blockers.join("\n"));
  assert.equal(result.renderingPerformed, true);
  assert.equal(result.bookStudioImportPerformed, false);
  assert.equal(result.publicationPerformed, false);
  assert.equal(result.kdpAiImageDisclosureRequired, false);
  assert.equal(result.bookStudioCoverEvidence.frontCover.mediaType, "image/jpeg");
  assert.equal(result.bookStudioCoverEvidence.textLayout.modelRenderedText, false);
});

test("blocks PNG direct-upload bytes and model-rendered typography", async () => {
  const badPlan = planInput();
  badPlan.typography.modelRenderedText = true;
  const compiledBadPlan = await compileBookCoverRenderPlan(badPlan);
  assert.equal(compiledBadPlan.status, "blocked");
  assert.ok(compiledBadPlan.blockers.includes("plan.typography.modelRenderedText:must_be_false"));

  const compiled = await compileBookCoverRenderPlan(planInput());
  const release = releaseInput(compiled.plan);
  release.execution.frontCover.mediaType = "image/png";
  const result = await evaluateBookCoverRelease(release);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("release.execution.frontCover:jpeg_or_tiff_required"));
});

test("releases a template-bound paperback full wrap with print preflight evidence", async () => {
  const compiled = await compileBookCoverRenderPlan(planInput("paperback"));
  assert.equal(compiled.status, "ready", compiled.blockers.join("\n"));
  const result = await evaluateBookCoverRelease(
    releaseInput(compiled.plan, "paperback"),
  );
  assert.equal(result.status, "ready_for_book_studio_import", result.blockers.join("\n"));
  assert.equal(result.bookStudioCoverEvidence.fullWrapCover.mediaType, "application/pdf");
  assert.equal(result.bookStudioCoverEvidence.printGeometry.barcodeReserved, true);
});

test("blocks spine text below the KDP page threshold", async () => {
  const input = planInput("paperback");
  input.printGeometry.pageCount = 78;
  const result = await compileBookCoverRenderPlan(input);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("plan.printGeometry:spine_text_requires_at_least_79_pages"));
});

test("blocks a print release without embedded-font, flattening and template receipts", async () => {
  const compiled = await compileBookCoverRenderPlan(planInput("paperback"));
  const release = releaseInput(compiled.plan, "paperback");
  delete release.execution.inspections.fontEmbeddingEvidenceId;
  delete release.execution.inspections.transparencyFlatteningEvidenceId;
  delete release.execution.inspections.templateMatchEvidenceId;
  const result = await evaluateBookCoverRelease(release);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("release.execution.inspections.fontEmbeddingEvidenceId:required_for_print"));
  assert.ok(result.blockers.includes("release.execution.inspections.transparencyFlatteningEvidenceId:required_for_print"));
  assert.ok(result.blockers.includes("release.execution.inspections.templateMatchEvidenceId:required_for_print"));
});

test("derives KDP image disclosure from the selected artwork provenance", async () => {
  const input = planInput();
  input.sourceArtwork.provenanceMode = "ai_generated";
  const compiled = await compileBookCoverRenderPlan(input);
  assert.equal(compiled.status, "ready", compiled.blockers.join("\n"));
  const result = await evaluateBookCoverRelease(releaseInput(compiled.plan));
  assert.equal(result.status, "ready_for_book_studio_import", result.blockers.join("\n"));
  assert.equal(result.kdpAiImageDisclosureRequired, true);
});
