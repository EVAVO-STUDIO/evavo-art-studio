#!/usr/bin/env node
import path from "node:path";
import process from "node:process";

import { compileProjectArtIntakeFile } from "./project-art/intake.mjs";

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
    "usage: compile-project-art-intake.mjs --request <request.json> --output <plan.json> [--compiled-at <canonical UTC>]",
  );
}
const plan = await compileProjectArtIntakeFile(request, output, {
  ...(compiledAt ? { compiledAt } : {}),
});
console.log(
  JSON.stringify({
    status: "passed",
    schema: plan.schema,
    sessionId: plan.sessionId,
    projectId: plan.projectId,
    sourceCount: plan.sources.length,
    planSha256: plan.planSha256,
    output: path.resolve(output),
    storageWrite: false,
    repositoryMutation: false,
  }),
);
