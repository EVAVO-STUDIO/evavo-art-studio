import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOK_CREATIVE_DIRECTION_CONTRACT,
  compileBookCreativeDirection,
  listBookCreativeDirectionCapabilities,
} from "../dist/book-creative-direction.js";

const sha = (c) => `sha256:${c.repeat(64)}`;
const evidence = (id, label, extra = {}) => ({
  evidenceId: id,
  label,
  meaning: `${label} changes the reader's understanding of power and consequence.`,
  importance: 90,
  sourceLocationIds: [`chapter-1:${id}`],
  ...extra,
});
function input(overrides = {}) {
  return {
    outputKind: "evavo_art_book_creative_direction_input",
    schemaVersion: 1,
    contract: BOOK_CREATIVE_DIRECTION_CONTRACT,
    identity: { workspaceId: "workspace-one", projectId: "project-one", bookId: "book-one", editionId: "edition-one", requestId: "request-one" },
    purpose: "front_cover_art",
    manuscript: { manuscriptRevisionId: "revision-one", manuscriptSha256: sha("1"), extractedTextSha256: sha("2"), visualCanonSha256: sha("3"), artDirectionSha256: sha("4"), approvedEvidenceIds: ["rights-one", "theme-duty", "theme-debt", "motif-key", "setting-archive", "character-mara", "scene-door", "scene-ledger"] },
    output: { widthPx: 1800, heightPx: 2700, minimumPpi: 300, allowedMimeTypes: ["image/png"], colourIntent: "cmyk_conversion_required", alpha: "forbidden", textPolicy: "text_free", printUse: true, digitalUse: true },
    contentClass: "historical literary fiction",
    primaryGenre: "historical",
    audience: "adult readers who expect historically grounded literary fiction",
    centralConflict: "Mara must choose whether protecting an ally justifies preserving an institution built on concealed debt.",
    emotionalPromise: "restrained dread, moral pressure and the cost of a decision that cannot be undone",
    themes: [evidence("theme-duty", "duty against complicity"), evidence("theme-debt", "inherited debt")],
    motifs: [evidence("motif-key", "the archive key", { visualForms: ["worn iron key", "key-shaped absence in dust"] })],
    settings: [evidence("setting-archive", "the flooded municipal archive", { architecture: ["cast-iron galleries", "water-marked brick vaults"], materials: ["oxidised iron", "wet brick", "rag paper"] })],
    characters: [evidence("character-mara", "Mara", { role: "junior archivist", silhouette: "tall coat with one weighted shoulder", props: ["iron key", "oil lantern"], contradiction: "outward procedural calm against private refusal" })],
    scenes: [
      evidence("scene-door", "Mara before the sealed archive door", { spoilerLevel: "none", physicalAction: "her hand stops short of turning the key", beforeOrAftermath: "water rises around the locked threshold" }),
      evidence("scene-ledger", "the ledger discovered beneath floodwater", { spoilerLevel: "minor", physicalAction: "the ledger surfaces between broken shelves", beforeOrAftermath: "ink begins to bleed before it can be copied" }),
      evidence("scene-ending", "the final council vote", { spoilerLevel: "ending", physicalAction: "the vote is cast", beforeOrAftermath: "the institution fractures" }),
    ],
    continuityRequirements: ["Mara's coat remains dark wool with a repaired left cuff.", "The archive key is hand-forged iron, not brass."],
    materialRequirements: ["1870s cast iron, rag paper, lime mortar and whale-oil practical light."],
    rightsEvidenceIds: ["rights-one"],
    aestheticIntent: "front-facing print composition with robust engraving contours, material-specific hatching, controlled black masses and quiet typography space",
    allowedProcessFamilies: ["relief_engraving", "intaglio_etching", "lithographic_tone"],
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

test("lists compile-only creative capabilities", () => {
  const value = listBookCreativeDirectionCapabilities();
  assert.equal(value.providerCallPerformed, false);
  assert.equal(value.selectionPerformed, false);
});
test("compiles deterministic evidence-bound routes and briefs", async () => {
  const first = await compileBookCreativeDirection(input());
  const second = await compileBookCreativeDirection(input());
  assert.equal(first.status, "ready", first.blockers.join("\n"));
  assert.equal(first.plan.planFingerprint, second.plan.planFingerprint);
  assert.equal(first.plan.routes.length, 3);
  assert.equal(new Set(first.plan.routes.map((route) => route.routeKind)).size, 3);
  assert.equal(new Set(first.plan.routes.map((route) => route.composition)).size, 3);
  assert.ok(first.plan.routes.every((route) => route.sourceLocationIds.length > 0));
  assert.ok(first.plan.routes.every((route) => route.brief.output.textPolicy === "text_free"));
});
test("selects historical print processes and period-specific prohibitions", async () => {
  const result = await compileBookCreativeDirection(input());
  assert.equal(result.status, "ready");
  assert.ok(result.plan.routes.every((route) => ["relief_engraving", "intaglio_etching", "lithographic_tone"].includes(route.processFamily)));
  assert.match(result.plan.routes[0].brief.mustNotShow.join(" "), /sepia filter|tourist-view architecture/);
});
test("uses environment as pressure rather than scenery", async () => {
  const result = await compileBookCreativeDirection(input());
  const route = result.plan.routes.find((item) => item.routeKind === "environmental_pressure");
  assert.ok(route);
  assert.equal(route.composition, "asymmetric_environmental_dominance");
  assert.match(route.rationale, /act through scale/);
});
test("rejects vague provider buzzwords", async () => {
  const result = await compileBookCreativeDirection(input({ aestheticIntent: "masterpiece epic cinematic 8k ultra detailed trending on ArtStation" }));
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /generic provider shorthand/);
});
test("rejects named creators and branded franchises", async () => {
  const result = await compileBookCreativeDirection(input({ namedCreatorReferences: ["living-artist"], brandedFranchiseReferences: ["famous-franchise"] }));
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /Named-creator imitation/);
  assert.match(result.blockers.join(" "), /Branded-franchise transfer/);
});
test("rejects generated typography inside artwork", async () => {
  const value = input(); value.output = { ...value.output, textPolicy: "exact_editable_labels_only" };
  const result = await compileBookCreativeDirection(value);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /text-free/);
});
test("rejects unapproved rights evidence", async () => {
  const result = await compileBookCreativeDirection(input({ rightsEvidenceIds: ["rights-missing"] }));
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /not approved/);
});
test("rejects ending spoilers when a cover lacks two safe scenes", async () => {
  const value = input(); value.scenes = [value.scenes[2]];
  const result = await compileBookCreativeDirection(value);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /non-major-spoiler scenes/);
});
test("compiles technical systems with label-ready negative space", async () => {
  const value = input({ primaryGenre: "technical", purpose: "diagram", contentClass: "technical reference manual", routeCount: 2, characters: [], motifs: [], scenes: [], aestheticIntent: "orthographic cutaway with measured line hierarchy, material differentiation, failure paths and editable label corridors" });
  const result = await compileBookCreativeDirection(value);
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  assert.ok(result.plan.routes.some((route) => route.routeKind === "systems_cutaway"));
  assert.match(result.plan.routes.map((route) => route.brief.negativeSpaceRequirements.join(" ")).join(" "), /editable/);
});
test("compiles graphic-novel sequential rhythm while keeping lettering editable", async () => {
  const value = input({ primaryGenre: "graphic_novel", purpose: "interior_full_page_illustration", aestheticIntent: "sequential ink composition with stable camera geography, controlled halftone, panel rhythm and editable balloon space" });
  const result = await compileBookCreativeDirection(value);
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  assert.ok(result.plan.routes.some((route) => route.routeKind === "sequential_rhythm"));
  assert.match(result.plan.providerInstruction, /never a contact sheet/);
});
test("hard-codes stock and synthetic failure rejection", async () => {
  const result = await compileBookCreativeDirection(input());
  const forbidden = result.plan.routes.flatMap((route) => route.brief.mustNotShow).join(" ");
  assert.match(forbidden, /floating head montage/);
  assert.match(forbidden, /plastic or waxy materials/);
  assert.match(forbidden, /generic movie-poster hierarchy/);
});
test("preserves compile-only authority", async () => {
  const result = await compileBookCreativeDirection(input());
  assert.equal(result.providerCallPerformed, false);
  assert.equal(result.selectionPerformed, false);
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.publicationPerformed, false);
  assert.equal(result.plan.bookUseBindingCreated, false);
});
