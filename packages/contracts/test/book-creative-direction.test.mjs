
import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_ART_CREATIVE_DIRECTION_CONTRACT,
  compileBookArtCreativeDirection,
  listBookArtCreativeDirectionCapabilities,
} from "../dist/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

function validInput() {
  return {
    outputKind: "evavo_book_art_creative_direction_compile_input",
    schemaVersion: 1,
    contract: BOOK_ART_CREATIVE_DIRECTION_CONTRACT,
    identity: {
      workspaceId: "workspace-alpha",
      projectId: "project-alpha",
      bookId: "book-alpha",
      editionId: "edition-print",
      requestId: "creative-direction-alpha",
    },
    purpose: "front_cover_art",
    manuscript: {
      manuscriptRevisionId: "revision-seven",
      manuscriptSha256: digest("1"),
      extractedTextSha256: digest("2"),
      visualCanonSha256: digest("3"),
      artDirectionSha256: digest("4"),
      approvedEvidenceIds: [
        "rights-primary",
        "theme-debt",
        "theme-loyalty",
        "motif-broken-seal",
        "motif-river-chart",
        "setting-levee",
        "setting-ledger-room",
        "character-mara",
        "character-jonas",
        "scene-chart",
        "scene-door",
        "scene-aftermath",
      ],
    },
    output: {
      widthPx: 3600,
      heightPx: 5400,
      minimumPpi: 300,
      allowedMimeTypes: ["image/png", "image/tiff"],
      colourIntent: "monochrome",
      alpha: "forbidden",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    contentClass: "historical literary horror",
    primaryGenre: "historical",
    secondaryGenres: ["horror", "literary"],
    audience: {
      ageBand: "adult",
      readingMode: "immersive long-form print reading",
      sophistication: "literary",
      marketPosition: "premium illustrated historical fiction",
      sensitivityIds: ["violence-context", "historical-trauma"],
    },
    logline:
      "A harbour clerk who falsified one wartime ledger must guide the family he betrayed through a flood while a rival searches for the missing seal.",
    centralConflict:
      "Mara can preserve her public honour only by repeating the lie that destroyed the people she is now responsible for saving.",
    emotionalPromise:
      "restrained dread, moral pressure, material history and a final sense that every object has remembered the lie",
    themes: [
      {
        evidenceId: "theme-debt",
        label: "Inherited debt",
        meaning: "Private wrongdoing becomes a public obligation carried by later generations.",
        importance: 98,
        sourceLocationIds: ["chapter-01", "chapter-12", "chapter-18"],
      },
      {
        evidenceId: "theme-loyalty",
        label: "Loyalty under false names",
        meaning: "Protection and betrayal use the same gestures until the cost is revealed.",
        importance: 92,
        sourceLocationIds: ["chapter-04", "chapter-09", "chapter-16"],
      },
    ],
    motifs: [
      {
        evidenceId: "motif-broken-seal",
        label: "Broken customs seal",
        meaning: "Official authority is physically cracked but still obeyed.",
        importance: 96,
        sourceLocationIds: ["chapter-01", "chapter-07", "chapter-18"],
        visualForms: ["split wax seal", "frayed red cord", "blind impression in damp paper"],
        transformations: [
          "intact authority becomes a split object held together by stained cord",
          "the seal impression survives after the wax is lost",
        ],
      },
      {
        evidenceId: "motif-river-chart",
        label: "Flood-marked river chart",
        meaning: "Knowledge intended to control the river records how little control exists.",
        importance: 88,
        sourceLocationIds: ["chapter-03", "chapter-11"],
        visualForms: ["creased hydrographic chart", "tide pencil marks", "water-softened grid"],
        transformations: ["precise chart becomes physically warped by the water it measures"],
      },
    ],
    settings: [
      {
        evidenceId: "setting-levee",
        label: "Reconstruction-era levee at night",
        meaning: "Trade infrastructure becomes a temporary refuge and trap.",
        importance: 97,
        sourceLocationIds: ["chapter-02", "chapter-11", "chapter-17"],
        era: "1871 Reconstruction-era Gulf port",
        culture: "working river port shaped by freed labour, shipping firms and customs authority",
        architecture: ["timber levee sheds", "brick bonded warehouse", "river stairs", "raised plank walk"],
        materials: ["wet cypress", "handmade brick", "tarred rope", "oxidised iron", "cotton canvas"],
        weatherAndLight: ["rain-obscured oil lamp", "river fog below the deck line", "lightning behind smoke"],
      },
      {
        evidenceId: "setting-ledger-room",
        label: "Customs ledger room",
        meaning: "A small bureaucratic room contains the physical evidence that can destroy several lives.",
        importance: 90,
        sourceLocationIds: ["chapter-01", "chapter-14"],
        era: "1871",
        culture: "port customs administration",
        architecture: ["tall sash window", "locked pigeonhole wall", "scarred standing desk"],
        materials: ["rag paper", "iron gall ink", "oak", "brass key", "wax"],
        weatherAndLight: ["single shaded oil lamp", "rain streaks on glass"],
      },
    ],
    characters: [
      {
        evidenceId: "character-mara",
        label: "Mara Vale",
        meaning: "The clerk who knows the route and caused the danger.",
        importance: 99,
        sourceLocationIds: ["chapter-01", "chapter-18"],
        role: "harbour clerk and reluctant guide",
        silhouette: "tall narrow coat, squared ledger satchel, one shoulder held rigid after an old injury",
        costumeAndMaterial: ["rain-dark wool", "salt-stiffened linen", "worn calfskin satchel"],
        props: ["broken customs seal", "brass ledger key"],
        innerOuterContradiction: "public precision conceals panic and an improvised capacity for mercy",
      },
      {
        evidenceId: "character-jonas",
        label: "Jonas Reed",
        meaning: "The rival investigator whose apparent severity protects a different secret.",
        importance: 84,
        sourceLocationIds: ["chapter-05", "chapter-15"],
        role: "shipping-company investigator",
        silhouette: "broad rain cape, low hat brim, cane used as a measuring stick rather than a weapon",
        costumeAndMaterial: ["waxed cotton", "polished but repaired leather", "nickel spectacles"],
        props: ["folding rule", "river ticket stub"],
        innerOuterContradiction: "formal menace masks fear that the ledger will expose his own family",
      },
    ],
    scenes: [
      {
        evidenceId: "scene-chart",
        label: "The chart buckles under floodwater",
        meaning: "Mara must choose between preserving the evidence and using it to guide trapped families.",
        importance: 96,
        sourceLocationIds: ["chapter-11"],
        dramaticFunction: "the private record becomes a physical survival tool",
        spoilerLevel: "minor",
        visualSpecificity: 98,
        emotionalCharge: 90,
        compositionPotential: 96,
        physicalAction: "a wet chart is pinned beneath a brass key while water rises over the table edge",
        beforeOrAftermath: "the moment after Mara tears the chart from the official ledger",
      },
      {
        evidenceId: "scene-door",
        label: "Jonas holds the ledger-room door against the flood",
        meaning: "The rival consumes his public authority to make private mercy possible.",
        importance: 90,
        sourceLocationIds: ["chapter-12"],
        dramaticFunction: "relational reversal becomes a physical load against a brick door",
        spoilerLevel: "none",
        visualSpecificity: 88,
        emotionalCharge: 94,
        compositionPotential: 92,
        physicalAction: "two figures at opposite depth planes strain against the same flood current without looking at each other",
        beforeOrAftermath: "the instant before the brass key slips from Mara's hand",
      },
      {
        evidenceId: "scene-aftermath",
        label: "The frayed cord remains where the seal was",
        meaning: "Authority survives only as a trace on the objects and people it used.",
        importance: 86,
        sourceLocationIds: ["chapter-17"],
        dramaticFunction: "aftermath reframes the victory as surviving evidence",
        spoilerLevel: "none",
        visualSpecificity: 84,
        emotionalCharge: 88,
        compositionPotential: 90,
        physicalAction: "frayed red cord lies across wet rag paper beside a cold oil lamp",
        beforeOrAftermath: "quiet aftermath before anyone has decided what to claim",
      },
    ],
    spoilerRestrictionIds: ["ending-reveal", "major-betrayal"],
    continuityRequirements: [
      "Mara's right shoulder remains stiff and her ledger satchel remains squared",
      "Jonas's cane reads as a measuring tool rather than a dagger",
      "the levee, customs room and river come from the same navigable port geography",
    ],
    historicalAndMaterialRequirements: [
      "no electric light",
      "no modern shipping containers",
      "correct 1871 office paper, brass, wax and riverfront construction",
    ],
    editionComposition: {
      titleZone: "upper_third",
      authorZone: "lower_third",
      seriesZone: "none",
      spineDirection: "top_to_bottom",
      barcodeZone: "back_lower_right",
      readingDirection: "left_to_right",
      minimumQuietAreaPercent: 28,
      customZoneNotes: [
        "keep the upper left calm enough for title typography",
        "full wrap routes must continue weather and material behaviour across the spine",
      ],
    },
    preferences: {
      aestheticIntent:
        "Project-owned 1871 engraved print language with sober contour hierarchy, material-specific hatching, dark humid depth and one overread oxidised seal red as a narrative material rather than a cinematic accent.",
      preferredProcessFamilies: ["relief_engraving", "intaglio_etching", "black_only"],
      allowedProcessFamilies: ["relief_engraving", "intaglio_etching", "brush_pen_halftone", "duotone", "black_only"],
      colourBias: ["paper warmth", "lamp black", "oxidised seal red"],
      paperIntent: "uncoated warm stock with visible tooth and strong black reproduction",
      abstractionTolerance: 38,
      spectacleTolerance: 18,
      literalSceneTolerance: 55,
      lineworkIntensity: 90,
      routeCount: 2,
      candidatesPerRoute: 3,
      prohibitedCompositionIds: [],
    },
    rightsEvidenceIds: ["rights-primary"],
    namedCreatorReferences: [],
    brandedFranchiseReferences: [],
    requestedAt: "2026-08-07T10:00:00.000Z",
    requestedBy: "book-production-supervisor",
    providerCallAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
  };
}

test("compiles manuscript-specific creative routes and governed candidate programmes", async () => {
  const result = await compileBookArtCreativeDirection(validInput());
  assert.equal(result.status, "ready", JSON.stringify(result.blockers));
  assert.ok(result.plan);
  assert.equal(result.plan.routeProgrammes.length, 2);
  assert.equal(result.plan.selectedRouteIds.length, 2);
  assert.equal(
    new Set(result.plan.routeProgrammes.map((entry) => entry.brief.identity.requestId)).size,
    2,
  );
  assert.ok(
    result.plan.routeProgrammes.every(
      (entry) =>
        entry.candidateCount === 3 &&
        entry.candidateSetWorkOrder.candidateCount === 3 &&
        entry.providerCallPerformed === false &&
        entry.selectionPerformed === false &&
        entry.promotionPerformed === false &&
        entry.publicationPerformed === false,
    ),
  );
  assert.ok(
    result.plan.routeProgrammes.every((entry) =>
      entry.brief.mustNotShow.some((item) =>
        /floating head montage|glowing portal|generated letters/i.test(item),
      ),
    ),
  );
  assert.equal(result.plan.styleSystem.primaryProcessFamily, "relief_engraving");
  assert.equal(result.plan.antiGenericPolicy.evidenceRequiredForEveryVisibleElement, true);
  assert.equal(result.plan.selectionPerformed, false);
  assert.equal(result.plan.publicationPerformed, false);
});

test("is deterministic when narrative evidence input ordering changes", async () => {
  const first = await compileBookArtCreativeDirection(validInput());
  const reordered = structuredClone(validInput());
  reordered.themes.reverse();
  reordered.motifs.reverse();
  reordered.settings.reverse();
  reordered.characters.reverse();
  reordered.scenes.reverse();
  reordered.secondaryGenres.reverse();
  const second = await compileBookArtCreativeDirection(reordered);
  assert.equal(first.status, "ready");
  assert.equal(second.status, "ready", JSON.stringify(second.blockers));
  assert.equal(first.plan.planFingerprint, second.plan.planFingerprint);
});

test("rejects named creator imitation and branded franchise transfer", async () => {
  const input = validInput();
  input.namedCreatorReferences = ["living-illustrator-name"];
  input.brandedFranchiseReferences = ["recognisable-tabletop-faction"];
  const result = await compileBookArtCreativeDirection(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /Named creator references are prohibited/i);
  assert.match(result.blockers.join(" "), /Branded franchise references are prohibited/i);
});

test("rejects generic provider-prompt shorthand instead of treating it as art direction", async () => {
  const input = validInput();
  input.preferences.aestheticIntent =
    "masterpiece epic cinematic 8k ultra detailed trending on artstation";
  const result = await compileBookArtCreativeDirection(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /generic provider-prompt shorthand/i);
});

test("rejects unapproved rights evidence and generated text policies", async () => {
  const input = validInput();
  input.rightsEvidenceIds = ["rights-not-approved"];
  input.output.textPolicy = "exact_editable_labels_only";
  const result = await compileBookArtCreativeDirection(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /Rights evidence must be present/i);
  assert.match(result.blockers.join(" "), /must remain text-free/i);
});

test("cover routes exclude major and ending spoilers", async () => {
  const input = validInput();
  input.scenes[0].spoilerLevel = "major";
  input.scenes[1].spoilerLevel = "none";
  input.scenes[2].spoilerLevel = "none";
  const result = await compileBookArtCreativeDirection(input);
  assert.equal(result.status, "ready", JSON.stringify(result.blockers));
  const selected = result.plan.conceptRoutes.filter((route) =>
    result.plan.selectedRouteIds.includes(route.routeId),
  );
  assert.ok(selected.every((route) => route.spoilerSafe));
});

test("graphic-novel direction includes sequential rhythm and editable lettering protection", async () => {
  const input = validInput();
  input.purpose = "graphic_novel_page";
  input.primaryGenre = "graphic_novel";
  input.secondaryGenres = ["historical", "horror"];
  input.contentClass = "historical graphic novel";
  input.preferences.preferredProcessFamilies = ["graphic_novel_ink", "black_only"];
  input.preferences.allowedProcessFamilies = [
    "graphic_novel_ink",
    "brush_pen_halftone",
    "black_only",
  ];
  const result = await compileBookArtCreativeDirection(input);
  assert.equal(result.status, "ready", JSON.stringify(result.blockers));
  assert.ok(
    result.plan.conceptRoutes.some(
      (route) =>
        route.routeKind === "sequential_rhythm" &&
        route.mustAvoid.some((item) => /baked-in dialogue/i.test(item)),
    ),
  );
  assert.equal(result.plan.productionPurpose, "interior_full_page_illustration");
  assert.match(result.plan.providerInstruction, /Generated text/i);
});

test("technical and reference books compile systems-first routes without invented characters", async () => {
  const input = validInput();
  input.purpose = "diagram";
  input.primaryGenre = "technical";
  input.secondaryGenres = ["reference"];
  input.contentClass = "technical reference manual";
  input.characters = [];
  input.motifs = [];
  input.scenes = [];
  input.preferences.preferredProcessFamilies = ["technical_plate"];
  input.preferences.allowedProcessFamilies = [
    "technical_plate",
    "cartographic_linework",
    "black_only",
  ];
  input.preferences.routeCount = 2;
  input.preferences.aestheticIntent =
    "Measured sectional linework with explicit material hierarchy, clean editable-label corridors, controlled oblique geometry and no decorative technical theatre.";
  const result = await compileBookArtCreativeDirection(input);
  assert.equal(result.status, "ready", JSON.stringify(result.blockers));
  assert.ok(
    result.plan.conceptRoutes.some((route) => route.routeKind === "systems_cutaway"),
  );
  assert.ok(
    result.plan.routeProgrammes.every(
      (entry) => entry.brief.output.textPolicy === "text_free",
    ),
  );
});

test("capability surface remains compile-only and non-authoritative", () => {
  const capabilities = listBookArtCreativeDirectionCapabilities();
  assert.deepEqual(capabilities.capabilities, [
    "book.creative_direction.compile",
    "book.creative_direction.route_programmes.compile",
  ]);
  assert.equal(capabilities.providerCallPerformed, false);
  assert.equal(capabilities.selectionPerformed, false);
  assert.equal(capabilities.promotionPerformed, false);
  assert.equal(capabilities.publicationPerformed, false);
});
