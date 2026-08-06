#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = Object.freeze({
  source: "packages/contracts/src/book-creative-direction.ts",
  barrel: "packages/contracts/src/index.ts",
  test: "packages/contracts/test/book-creative-direction.test.mjs",
  workflow: ".github/workflows/book-creative-direction.yml",
  docs: "docs/book-creative-direction.md",
});
const failures = [];

function fail(message) {
  failures.push(message);
}
function expect(source, token, label) {
  if (!source.includes(token)) fail(`${label} is missing ${JSON.stringify(token)}.`);
}
function reject(source, token, label) {
  if (source.includes(token)) fail(`${label} contains prohibited token ${JSON.stringify(token)}.`);
}

const sources = {};
for (const [name, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  try {
    await access(absolute);
    sources[name] = await readFile(absolute, "utf8");
  } catch {
    fail(`Required file is missing: ${relative}.`);
  }
}

if (!failures.length) {
  for (const token of [
    "evavo_book_art_creative_direction_v1",
    "compileBookArtCreativeDirection",
    "compileBookArtProductionWorkOrder",
    "compileBookArtCandidateSetWorkOrder",
    "book.creative_direction.compile",
    "material_symbol",
    "environmental_pressure",
    "relational_tension",
    "consequence_moment",
    "systems_cutaway",
    "sequential_rhythm",
    "namedCreatorImitationProhibited: true",
    "brandedFranchiseTransferProhibited: true",
    "evidenceRequiredForEveryVisibleElement: true",
    "uniformMicrodetailProhibited: true",
    "clonedTextureProhibited: true",
    "globalScratchOverlayProhibited: true",
    "meaninglessRunesAndPseudoTextProhibited: true",
    "gratuitousGlowAndParticlesProhibited: true",
    "genericMoviePosterCompositionProhibited: true",
    "providerCallPerformed: false",
    "selectionPerformed: false",
    "promotionPerformed: false",
    "publicationPerformed: false",
  ]) expect(sources.source, token, "creative-direction source");

  for (const genre of [
    "literary:",
    "historical:",
    "horror:",
    "mythic:",
    "grimdark_fantasy:",
    "science_fiction:",
    "crime:",
    "romance:",
    "children:",
    "memoir:",
    "documentary:",
    "technical:",
    "reference:",
    "graphic_novel:",
    "pulp:",
    "poetry:",
    "cookbook:",
    "academic:",
    "custom:",
  ]) expect(sources.source, genre, "genre profile catalogue");

  for (const token of [
    "trending on artstation",
    "floating head montage",
    "lone hooded figure facing a glowing portal",
    "generic warrior silhouette on a ridge",
    "generated letters, fake logos, watermarks or signatures",
    "material-specific linework",
  ]) expect(sources.source.toLowerCase(), token.toLowerCase(), "anti-generic vocabulary");

  for (const token of [
    "automaticSelectionAllowed: true",
    "automaticPromotionAllowed: true",
    "publicationPerformed: true",
    "providerFallbackAllowed: true",
  ]) reject(sources.source, token, "creative-direction source");

  reject(sources.source.toLowerCase(), "warhammer", "creative-direction source");
  reject(sources.source.toLowerCase(), "in the style of a living", "creative-direction source");

  expect(
    sources.barrel,
    'export * from "./book-creative-direction.js";',
    "contracts barrel",
  );

  for (const token of [
    "manuscript-specific creative routes",
    "deterministic when narrative evidence input ordering changes",
    "rejects named creator imitation",
    "rejects generic provider-prompt shorthand",
    "rejects unapproved rights evidence",
    "cover routes exclude major and ending spoilers",
    "graphic-novel direction includes sequential rhythm",
    "technical and reference books compile systems-first routes",
  ]) expect(sources.test, token, "creative-direction tests");

  for (const token of [
    "pnpm install --frozen-lockfile",
    "check-book-creative-direction.mjs",
    "@evavo/art-contracts typecheck",
    "@evavo/art-contracts test",
    "git diff --exit-code",
  ]) expect(sources.workflow, token, "creative-direction workflow");

  for (const token of [
    "evidence before aesthetics",
    "material-specific mark grammar",
    "concept routes",
    "never accepts a provider image as final",
    "graphic novels",
    "historical print processes",
  ]) expect(sources.docs.toLowerCase(), token, "creative-direction documentation");
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`book_creative_direction_check_failure: ${failure}`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    contract: "evavo_book_art_creative_direction_v1",
    genreProfiles: 19,
    manuscriptEvidenceRequired: true,
    conceptRouteDiversityRequired: true,
    materialSpecificMarkGrammarRequired: true,
    namedCreatorImitationAllowed: false,
    brandedFranchiseTransferAllowed: false,
    genericPromptShorthandAllowed: false,
    providerCallPerformed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationPerformed: false,
  })}\n`);
}
