import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const authority = JSON.parse(readFileSync(path.join(root, "docs/BOOK_STUDIO_AND_ART_MIGRATION_AUTHORITY.v2.json"), "utf8"));
const translator = readFileSync(path.join(root, "packages/contracts/src/book-production-legacy-illustration-plan.ts"), "utf8");
const index = readFileSync(path.join(root, "packages/contracts/src/index.ts"), "utf8");
const test = readFileSync(path.join(root, "packages/contracts/test/book-production-legacy-illustration-plan.test.mjs"), "utf8");
const workflow = readFileSync(path.join(root, ".github/workflows/book-studio-production-handoff.yml"), "utf8");
const docs = readFileSync(path.join(root, "docs/book-studio-production-handoff.md"), "utf8");
const problems = [];

function assert(condition, message) {
  if (!condition) problems.push(message);
}

for (const token of [
  "evavo_legacy_website_book_illustration_plan_translation_result",
  "book_illustration_generation_plan_v1",
  "book_illustration_style_authority_v1",
  "book_illustrated_page_authority_v1",
  "ready_for_shadow_comparison",
  "rawLegacyPromptTrustedAsAuthority: false",
  "legacyLayoutTrustedAsArtAuthority: false",
  "layoutGeometryRetained: false",
  "authoritativeWritesPerformed: false",
  "providerCandidateMayBeFinal: false",
  "promotionRequired: true",
  "bookUseBindingRequired: true",
  "artifactBytesRead: false",
  "artifactBytesRewritten: false",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]) assert(translator.includes(token), `Book Illustration parity translator is missing ${token}`);

for (const token of [
  "style authority digest does not match exact contents",
  "page authority digest does not match exact contents",
  "plan digest does not match exact contents",
  "page role does not match the canonical Book Art purpose",
  "live-text page lacks protected text zones",
  "must contain the candidate exactly once",
  "not the exact next ready task",
  "transparent ink layer required by the canonical work order",
]) assert(translator.includes(token), `Book Illustration parity validation is missing ${token}`);

for (const token of [
  "translates one exact illustrated-page task without moving layout or live text authority",
  "translates a transparent ornament only when the legacy ink-layer task matches",
  "blocks a page role that does not match the canonical Book Art purpose",
  "blocks stale page art direction and a different style authority",
  "blocks live-text pages without retained protected zones",
  "blocks duplicate candidate identities and a non-next candidate",
  "blocks tampered legacy authority and plan fingerprints",
]) assert(test.includes(token), `Book Illustration parity tests are missing ${token}`);

assert(index.includes('export * from "./book-production-legacy-illustration-plan.js";'), "Book Illustration parity translator must be publicly exported");
for (const token of [
  "packages/contracts/src/book-production-legacy-illustration-plan.ts",
  "packages/contracts/test/book-production*.test.mjs",
  "scripts/check-book-illustration-plan-parity.mjs",
  "book-production-legacy-illustration-plan.js",
]) assert(workflow.includes(token), `Book Illustration parity workflow is missing ${token}`);

for (const token of [
  "Legacy Book Illustration plan parity",
  "layoutGeometryRetained: false",
  "legacyLayoutTrustedAsArtAuthority: false",
  "Provider execution wiring, immutable storage registration, production shadow calls",
]) assert(docs.includes(token), `Book Illustration migration documentation is missing ${token}`);

assert(authority.gates?.noDualAuthoritativeWrites === true, "Book Illustration migration must prohibit dual authoritative writes");
assert(authority.gates?.runtimeCutoverApproved === false, "Book Illustration runtime cutover must remain blocked");
assert(authority.currentFlags?.websiteRuntimeStillActive === true, "Website compatibility runtime must remain active");
assert(authority.currentFlags?.artStudioBookProfileAuthoritative === false, "Art Studio Book profile cannot yet be claimed authoritative");
assert(authority.currentFlags?.publicationPerformed === false, "Book Illustration migration cannot claim publication");

if (problems.length) {
  console.error("Book Illustration plan parity check failed.");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "evavo_book_art_profile_v1",
  exactStyleAuthorityFingerprintRequired: true,
  exactPageAuthorityFingerprintRequired: true,
  exactPlanFingerprintRequired: true,
  rawLegacyPromptTrustedAsAuthority: false,
  legacyLayoutTrustedAsArtAuthority: false,
  layoutGeometryRetained: false,
  providerCandidateMayBeFinal: false,
  authoritativeWritesPerformed: false,
  artifactBytesRead: false,
  artifactBytesRewritten: false,
  runtimeCutoverApproved: false,
  publicationPerformed: false,
}, null, 2));
