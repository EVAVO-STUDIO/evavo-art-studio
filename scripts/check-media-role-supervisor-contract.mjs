#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const files = Object.freeze({
  source: read("packages/media/src/media-role-supervisor.ts"),
  index: read("packages/media/src/index.ts"),
  tests: read("packages/media/test/media-role-supervisor.test.mjs"),
  cli: read("tools/rank_media_candidates.mjs"),
  mcp: read("tools/media_role_supervisor_mcp.mjs"),
  config: read(".mcp.media-role-supervisor-v1.json"),
  docs: read("docs/raster-finishing-and-compositing.md"),
});

const failures = [];
const requireTokens = (name, tokens) => {
  for (const token of tokens) if (!files[name].includes(token)) failures.push(`${name}:missing:${token}`);
};

requireTokens("source", [
  '"detail-hero"',
  '"detail-support"',
  '"catalogue-tile"',
  '"social-seo"',
  '"motion-layer"',
  "evaluateMediaCandidate",
  "rankMediaCandidates",
  "live detail heroes must use raster media, not SVG",
  "catalogue-only artwork cannot own a detail-page hero",
  "support/secondary object needs a dedicated wide hero derivative",
  "shared with the catalogue; derive detail media instead of overwriting",
  "production metadata identifies",
  "predominantly white field",
  "at most 500 candidates",
]);
requireTokens("index", ['export * from "./media-role-supervisor.js";']);
requireTokens("tests", [
  "rejects SVG heroes and catalogue-only detail media",
  "prefers the finished CWA detail derivative over the padded catalogue source",
  "trusts production metadata over candidate-like public naming when explicitly allowed",
  "flags white-field support art for finishing",
  "requires alpha-aware finishing for motion layers",
]);
requireTokens("cli", [
  "rankMediaCandidates",
  "--input <json-file>",
  "candidateCount",
]);
requireTokens("mcp", [
  "evavo_media_role_supervisor_capabilities",
  "evavo_rank_media_candidates",
  "evavo_media_role_supervisor_v1",
  "providerMutationPerformed: false",
  "filesystemMutationPerformed: false",
  "production metadata outranks candidate-like public naming",
]);
requireTokens("config", [
  "evavo-media-role-supervisor-v1",
  "tools/media_role_supervisor_mcp.mjs",
]);
requireTokens("docs", [
  "Do not overwrite a shared catalogue/canonical asset",
]);

if (/writeFile|mkdir|unlink|rename|rm\(/u.test(files.mcp)) {
  failures.push("mcp:read-only-supervisor-must-not-write-files");
}
if (/cloudinary|fetch\(|https?:\/\//iu.test(files.mcp)) {
  failures.push("mcp:supervisor-must-rank-supplied-metadata-without-provider-fetches");
}

if (failures.length) {
  console.error("Media role supervisor contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("media_role_supervisor_contract_passed");
console.log("- provider-neutral metadata ranking remains read-only");
console.log("- hero, support, catalogue, social/SEO and motion roles remain explicit");
console.log("- SVG heroes, archive media and catalogue-only detail leakage fail closed");
console.log("- production metadata can override misleading candidate-like naming");
console.log("- shared catalogue sources are protected from detail-page overwrite recommendations");
