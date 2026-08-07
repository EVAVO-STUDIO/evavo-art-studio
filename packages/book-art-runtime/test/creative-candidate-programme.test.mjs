import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
  compileBookArtCreativeCandidateProgramme,
} from "../dist/creative-candidate-programme.js";
import { BOOK_CREATIVE_DIRECTION_CONTRACT } from "@evavo/art-contracts";

const sha = (value) => `sha256:${value.repeat(64)}`;
const evidence = (evidenceId, label, extra = {}) => ({
  evidenceId,
  label,
  meaning: `${label} changes the reader's understanding of power and consequence.`,
  importance: 90,
  sourceLocationIds: [`chapter-1:${evidenceId}`],
  ...extra,
});

function creativeInput(overrides = {}) {
  return {
    outputKind: "evavo_art_book_creative_direction_input",
    schemaVersion: 1,
    contract: BOOK_CREATIVE_DIRECTION_CONTRACT,
    identity: {
      workspaceId: "workspace-one",
      projectId: "project-one",
      bookId: "book-one",
      editionId: "edition-one",
      requestId: "request-one",
    },
    purpose: "front_cover_art",
    manuscript: {
      manuscriptRevisionId: "revision-one",
      manuscriptSha256: sha("1"),
      extractedTextSha256: sha("2"),
      visualCanonSha256: sha("3"),
      artDirectionSha256: sha("4"),
      approvedEvidenceIds: [
        "rights-one",
        "theme-duty",
        "theme-debt",
        "motif-key",
        "setting-archive",
        "character-mara",
        "scene-door",
        "scene-ledger",
      ],
    },
    output: {
      widthPx: 1800,
      heightPx: 2700,
      minimumPpi: 300,
      allowedMimeTypes: ["image/png"],
      colourIntent: "cmyk_conversion_required",
      alpha: "forbidden",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    contentClass: "historical literary fiction",
    primaryGenre: "historical",
    audience: "adult readers who expect historically grounded literary fiction",
    centralConflict:
      "Mara must choose whether protecting an ally justifies preserving an institution built on concealed debt.",
    emotionalPromise:
      "restrained dread, moral pressure and the cost of a decision that cannot be undone",
    themes: [
      evidence("theme-duty", "duty against complicity"),
      evidence("theme-debt", "inherited debt"),
    ],
    motifs: [
      evidence("motif-key", "the archive key", {
        visualForms: ["worn iron key", "key-shaped absence in dust"],
      }),
    ],
    settings: [
      evidence("setting-archive", "the flooded municipal archive", {
        architecture: ["cast-iron galleries", "water-marked brick vaults"],
        materials: ["oxidised iron", "wet brick", "rag paper"],
      }),
    ],
    characters: [
      evidence("character-mara", "Mara", {
        role: "junior archivist",
        silhouette: "tall coat with one weighted shoulder",
        props: ["iron key", "oil lantern"],
        contradiction: "outward procedural calm against private refusal",
      }),
    ],
    scenes: [
      evidence("scene-door", "Mara before the sealed archive door", {
        spoilerLevel: "none",
        physicalAction: "her hand stops short of turning the key",
        beforeOrAftermath: "water rises around the locked threshold",
      }),
      evidence("scene-ledger", "the ledger discovered beneath floodwater", {
        spoilerLevel: "minor",
        physicalAction: "the ledger surfaces between broken shelves",
        beforeOrAftermath: "ink begins to bleed before it can be copied",
      }),
    ],
    continuityRequirements: [
      "Mara's coat remains dark wool with a repaired left cuff.",
      "The archive key is hand-forged iron, not brass.",
    ],
    materialRequirements: [
      "1870s cast iron, rag paper, lime mortar and whale-oil practical light.",
    ],
    rightsEvidenceIds: ["rights-one"],
    aestheticIntent:
      "front-facing print composition with robust engraving contours, material-specific hatching, controlled black masses and quiet typography space",
    allowedProcessFamilies: [
      "relief_engraving",
      "intaglio_etching",
      "lithographic_tone",
    ],
    routeCount: 3,
    titleZone: "top",
    authorZone: "lower_third",
    minimumQuietAreaPercent: 30,
    namedCreatorReferences: [],
    brandedFranchiseReferences: [],
    requestedAt: "2026-08-07T00:00:00.000Z",
    requestedBy: "book-art-supervisor",
    providerCallAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
    ...overrides,
  };
}

function programmeInput(overrides = {}) {
  return {
    outputKind: "evavo_book_art_creative_candidate_programme_input",
    schemaVersion: 1,
    contract: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
    creativeDirectionInput: creativeInput(),
    requestedAt: "2026-08-07T02:00:00.000Z",
    requestedBy: "book-art-supervisor",
    adapterPolicy: {
      allowedAdapterIds: ["fixture-image"],
      preferredAdapterId: "fixture-image",
      preferredModel: "fixture-model-v1",
    },
    providerFallbackAllowed: false,
    bulkSubmissionAllowed: false,
    partialProgrammeExecutionAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
    ...overrides,
  };
}

test("compiles one exact provider plan for every manuscript-led creative route", async () => {
  const result = await compileBookArtCreativeCandidateProgramme(programmeInput());
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  assert.equal(result.programme.routeCount, 3);
  assert.equal(result.programme.routePlans.length, 3);
  assert.equal(new Set(result.programme.routePlans.map((item) => item.routeId)).size, 3);
  assert.equal(new Set(result.programme.routePlans.map((item) => item.routeKind)).size, 3);
  assert.equal(new Set(result.programme.routePlans.map((item) => item.composition)).size, 3);
});

test("provider requests remain route-specific instead of same-prompt variants", async () => {
  const result = await compileBookArtCreativeCandidateProgramme(programmeInput());
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  const requests = result.programme.routePlans.map(
    (item) => item.providerJobPlan.normalizedProviderRequest,
  );
  assert.equal(new Set(requests.map((item) => item.creativeIntent)).size, 3);
  assert.equal(new Set(requests.map((item) => item.metadata.conceptTerritoryId)).size, 3);
  assert.equal(new Set(result.programme.routePlans.map(
    (item) => item.providerJobPlan.normalizedProviderRequestSha256,
  )).size, 3);
  assert.ok(requests.every((item) => item.candidateCount === 1));
});

test("each route preserves manuscript evidence, print craft and text-free layout authority", async () => {
  const result = await compileBookArtCreativeCandidateProgramme(programmeInput());
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  for (const route of result.programme.routePlans) {
    assert.ok(route.evidenceIds.length > 0);
    assert.ok(route.sourceLocationIds.length > 0);
    assert.equal(route.workOrder.technicalRequirements.textPolicy, "text_free");
    assert.equal(route.workOrder.providerRequest.metadata.conceptTerritoryId, route.routeId);
    assert.match(route.workOrder.providerRequest.negativeIntent, /floating head|plastic|generated/i);
    assert.equal(route.providerJobPlan.normalizedProviderRequest.selection.allowFallback, false);
  }
});

test("does not submit jobs or grant automatic authority", async () => {
  const result = await compileBookArtCreativeCandidateProgramme(programmeInput());
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  assert.equal(result.programme.bulkSubmissionAllowed, false);
  assert.equal(result.programme.partialProgrammeExecutionAllowed, false);
  assert.equal(result.programme.runtimeJobsSubmitted, false);
  assert.equal(result.programme.providerCallPerformed, false);
  assert.equal(result.programme.selectionPerformed, false);
  assert.equal(result.programme.promotionPerformed, false);
  assert.equal(result.programme.bookUseBindingCreated, false);
  assert.equal(result.programme.publicationPerformed, false);
  assert.ok(result.programme.routePlans.every((item) => item.runtimeJobSubmitted === false));
});

test("blocks authority escalation before compiling route plans", async () => {
  const result = await compileBookArtCreativeCandidateProgramme(programmeInput({
    providerFallbackAllowed: true,
    bulkSubmissionAllowed: true,
    partialProgrammeExecutionAllowed: true,
    automaticSelectionAllowed: true,
    publicationAllowed: true,
  }));
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /providerFallbackAllowed must remain false/);
  assert.match(result.blockers.join(" "), /bulkSubmissionAllowed must remain false/);
  assert.match(result.blockers.join(" "), /partialProgrammeExecutionAllowed must remain false/);
  assert.match(result.blockers.join(" "), /automaticSelectionAllowed must remain false/);
  assert.match(result.blockers.join(" "), /publicationAllowed must remain false/);
});

test("fails closed when creative direction itself is generic", async () => {
  const badCreative = creativeInput({
    aestheticIntent: "masterpiece epic cinematic 8k ultra detailed trending on ArtStation",
  });
  const result = await compileBookArtCreativeCandidateProgramme(programmeInput({
    creativeDirectionInput: badCreative,
  }));
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /Creative direction: .*generic provider shorthand/i);
});
