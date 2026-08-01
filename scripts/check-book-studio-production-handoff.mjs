import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const authority = JSON.parse(readFileSync(path.join(root, "docs/BOOK_STUDIO_AND_ART_MIGRATION_AUTHORITY.v2.json"), "utf8"));
const contract = readFileSync(path.join(root, "packages/contracts/src/book-production.ts"), "utf8");
const legacy = readFileSync(path.join(root, "packages/contracts/src/book-production-legacy-compat.ts"), "utf8");
const index = readFileSync(path.join(root, "packages/contracts/src/index.ts"), "utf8");
const test = readFileSync(path.join(root, "packages/contracts/test/book-production.test.mjs"), "utf8");
const problems = [];
const requiredHeads = {
  website: "01dc0f36635c77e94d852e5691f0047bc7e275c0",
  docsSuite: "8ad88ced58f90ade1f9f48ab491ece446c07697c",
  artStudio: "6a8bec366c8e9695012e51a863a630648f83d501",
  writingStudio: "72415fd14f44b3350ff70c238822a029e5b81bc9",
};

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function assert(condition, message) { if (!condition) problems.push(message); }

assert(authority.schema === "evavo/book-studio-and-art-migration-authority", "migration authority schema is invalid");
assert(authority.version === 2, "migration authority version is invalid");
for (const [key, sha] of Object.entries(requiredHeads)) {
  assert(authority.sourceHeads?.[key]?.commit === sha, `${key} source head differs from reviewed baseline`);
  assert(/^[a-f0-9]{40}$/.test(authority.sourceHeads?.[key]?.commit ?? ""), `${key} source head is not exact`);
}
assert(authority.contractExtraction?.artStudioContract === "evavo_book_art_handoff_v1", "Art Studio handoff contract is missing");
assert(authority.contractExtraction?.candidateIsFinal === false, "provider candidates must remain non-final");
assert(authority.contractExtraction?.approvedArtifactRequiresPromotionReceipt === true, "approval must require promotion evidence");
assert(authority.contractExtraction?.bookUseRequiresApprovedArtifact === true, "book use must require approved art");
assert(authority.contractExtraction?.binaryTransport === "artifact_reference_or_bounded_binary_upload_not_json_base64", "binary transport boundary is invalid");
assert(authority.gates?.noDualAuthoritativeWrites === true, "dual authoritative writes must be prohibited");
assert(authority.gates?.runtimeCutoverApproved === false, "runtime cutover must remain blocked");
assert(authority.currentFlags?.artStudioBookProfileAuthoritative === false, "Art Studio book profile cannot be claimed authoritative yet");
assert(authority.currentFlags?.publicationPerformed === false, "publication cannot be claimed");
const { recordFingerprint, ...unsignedAuthority } = authority;
const expectedFingerprint = createHash("sha256").update(JSON.stringify(canonical(unsignedAuthority))).digest("hex");
assert(recordFingerprint === expectedFingerprint, "migration authority fingerprint does not match exact contents");
for (const token of ["evavo_book_art_handoff_v1", "providerCandidateMayBeFinal: false", "promotionReceiptSha256", "canonicalRendererMustVerifyBytes: true", "Book use requires an approved Art Studio artifact"]) assert(contract.includes(token), `book-production contract is missing ${token}`);
for (const token of ["book-cover-artifact", "book-publication-artifact", "sourceReferenceRetained: true", "bytesRewritten: false", "validateLegacyCompatibleBookArtArtifactReceipt", "validateLegacyCompatibleBookArtworkUseBinding"]) assert(legacy.includes(token), `legacy Book art compatibility is missing ${token}`);
assert(index.includes('export * from "./book-production.js";'), "book-production contract must be publicly exported");
assert(index.includes('export * from "./book-production-legacy-compat.js";'), "legacy book-production compatibility must be publicly exported");
for (const token of ["accepts an exact manuscript-bound", "requires selection and promotion", "allows book use only", "preserves legacy Website cover", "rejects a legacy use binding"]) assert(test.includes(token), `book-production tests are missing ${token}`);

if (problems.length) {
  console.error("Book Studio production handoff check failed.");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "PASS", migrationRunId: authority.migrationRunId, contract: authority.contractExtraction.artStudioContract, sourceHeads: requiredHeads, legacyReferencesRetained: true, bytesRewritten: false, providerCandidateIsFinal: false, runtimeCutoverApproved: false, publicationPerformed: false }, null, 2));
