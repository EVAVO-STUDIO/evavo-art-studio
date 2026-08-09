#!/usr/bin/env node
import path from "node:path";
import process from "node:process";

import { compileProjectArtAtlasFile } from "./project-art/atlas.mjs";

function value(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

const request = value("--request");
const output = value("--output");
const compiledAt = value("--compiled-at");
if (!request || !output) {
  throw new Error(
    "usage: compile-project-art-atlas.mjs --request <request.json> --output <plan.json> [--compiled-at <canonical UTC>]",
  );
}
const plan = await compileProjectArtAtlasFile(request, output, {
  ...(compiledAt ? { compiledAt } : {}),
});
console.log(
  JSON.stringify({
    status: "passed",
    schema: plan.schema,
    atlasId: plan.atlasId,
    frameCount: plan.frames.length,
    planSha256: plan.planSha256,
    output: path.resolve(output),
    repositoryMutation: false,
  }),
);
