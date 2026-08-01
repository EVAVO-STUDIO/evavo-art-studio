import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing Book Studio integration file: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "");
}

function canonical(value) {
  if (value === null || typeof value !== "object") {
    const scalar = JSON.stringify(value);
    if (scalar === undefined) throw new Error("Integration manifest contains a non-JSON value.");
    return scalar;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function requireTokens(label, source, tokens) {
  for (const token of tokens) if (!source.includes(token)) failures.push(`${label} is missing required boundary: ${token}`);
}

const manifestSource = read("docs/book-studio-integration-boundary.json");
const documentation = read("docs/book-studio-integration-boundary.md");
let manifest;
try {
  manifest = JSON.parse(manifestSource);
} catch (error) {
  failures.push(`Book Studio integration manifest is invalid JSON: ${error instanceof Error ? error.message : "unknown error"}`);
}

if (manifest) {
  const unsigned = { ...manifest };
  const fingerprint = unsigned.recordFingerprint;
  delete unsigned.recordFingerprint;
  const expected = createHash("sha256").update(canonical(unsigned), "utf8").digest("hex");
  if (fingerprint !== expected) failures.push("Book Studio integration manifest fingerprint mismatch.");
  if (manifest.schema !== "evavo/art-studio-book-integration" || manifest.version !== 1) {
    failures.push("Book Studio integration schema is unsupported.");
  }
  if (manifest.status !== "active_independent_art_authority") failures.push("Art Studio independent authority must remain active.");
  if (manifest.artStudio?.repository !== "EVAVO-STUDIO/evavo-art-studio") failures.push("Art Studio repository identity is invalid.");
  if (manifest.bookStudio?.activeCompatibilitySource !== "EVAVO-STUDIO/Website:tools/evavo-doc-studio"
    || manifest.bookStudio?.intendedCanonicalProductHome !== "EVAVO-STUDIO/evavo-docs-suite") {
    failures.push("Book Studio source and target identities are invalid.");
  }
  const flags = manifest.currentFlags ?? {};
  if (flags.websiteBookStudioStillActive !== true
    || flags.docsSuiteCutoverApproved !== false
    || flags.runtimeSourceMoved !== false
    || flags.artAuthorityTransferred !== false
    || flags.providerCandidateIsFinal !== false
    || flags.publicationPerformed !== false) {
    failures.push("Book/Art transition safety flags are invalid.");
  }
}

requireTokens("Book Studio integration documentation", documentation, [
  "canonical art-production authority",
  "Book Studio owns",
  "Art Studio owns",
  "A successful provider response is never an approved book asset.",
  "do not import each other's runtime source",
  "Generated artwork remains text-free",
  "Art Studio does not own",
  "docsSuiteCutoverApproved: false",
  "publicationPerformed: false",
]);

for (const forbidden of [
  "Art Studio owns canonical manuscript state",
  "provider response is final",
  "Art Studio publishes to Amazon",
  "runtime source moved",
]) {
  if (`${manifestSource}\n${documentation}`.includes(forbidden)) failures.push(`Integration authority contains forbidden claim: ${forbidden}`);
}

if (failures.length) {
  console.error("EVAVO Art Studio Book Studio integration check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("EVAVO Art Studio Book Studio integration check passed.");
console.log("- Art Studio retains independent cover and illustration artifact authority");
console.log("- Book Studio retains manuscript, edition, layout and publication authority");
console.log("- Website remains active until Docs Suite parity-proven cutover");
console.log("- provider candidates are not final and no publication was performed");
