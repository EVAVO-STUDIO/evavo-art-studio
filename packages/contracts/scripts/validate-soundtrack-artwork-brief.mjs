#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { validateSoundtrackArtworkBrief } from "../dist/soundtrack-artwork-brief.js";

const args = process.argv.slice(2);
const index = args.indexOf("--input");
if (index < 0 || !args[index + 1] || args.length !== 2) {
  console.error("usage: node packages/contracts/scripts/validate-soundtrack-artwork-brief.mjs --input <brief.json>");
  process.exit(2);
}

const input = path.resolve(args[index + 1]);
let document;
try {
  const text = await fs.readFile(input, "utf8");
  document = JSON.parse(text);
} catch (error) {
  console.error(JSON.stringify({
    schema: "evavo_art_studio_soundtrack_artwork_brief_validation_v1",
    status: "failed",
    input,
    issues: [{ path: "$", message: `cannot read strict JSON input: ${error instanceof Error ? error.message : String(error)}` }],
  }, null, 2));
  process.exit(1);
}

const result = validateSoundtrackArtworkBrief(document);
if (!result.success) {
  console.error(JSON.stringify({
    schema: "evavo_art_studio_soundtrack_artwork_brief_validation_v1",
    status: "failed",
    input,
    issues: result.issues,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  schema: "evavo_art_studio_soundtrack_artwork_brief_validation_v1",
  status: "passed",
  input,
  soundtrackBriefSchema: document.schema,
  hasMusicCreativeContext: document.musicCreativeContext !== null && document.musicCreativeContext !== undefined,
  finalArtworkApproval: false,
  distributorMetadataAuthority: false,
  publicationAuthority: false,
}, null, 2));
