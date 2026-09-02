#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const job = await load("contracts/creative-production-job-v1.json");
const output = await load("contracts/creative-output-manifest-v1.json");
const training = await load("contracts/creative-training-handoff-v1.json");
const control = await load("contracts/creative-control-handoff-v1.json");
const layout = await load("config/creative-output-layout-v1.json");
const quality = await load("config/local-image-quality-routes-v1.json");

assert.equal(job.kind, "evavo-creative-production-job-v1");
for (const style of ["photorealistic","realistic","cinematic","anime","cel","painterly","pixel-art","retro","pinup","project-defined"]) assert.ok(job.styleProfiles.includes(style));
for (const operation of ["text-to-image","image-edit","sprite-generation","sprite-animation","adapter-train"]) assert.ok(job.operations.includes(operation));
assert.equal(job.runtime.localFirst, true);
assert.equal(job.output.manifestRequired, true);

assert.equal(output.kind, "evavo-creative-output-manifest-v1");
assert.equal(output.artifact.createOnly, true);
assert.equal(output.trainingEligibility.default, false);
assert.equal(output.authority.manifestIsTrainingAdmission, false);

assert.equal(training.kind, "evavo-creative-training-handoff-v1");
assert.equal(training.producer, "art-studio");
assert.equal(training.trainingAuthority, "EVAVO-STUDIO/evavo-model-lab");
assert.ok(training.acceptedSpecialisations.includes("character-identity"));
assert.ok(training.acceptedSpecialisations.includes("sprite-style"));

assert.equal(control.kind, "evavo-creative-control-handoff-v1");
for (const signal of ["depth","lineart","pose","normals","segmentation","matting","multi-reference"]) assert.ok(control.acceptedControls.includes(signal));
assert.equal(control.rules.arbitraryNodeInstallationFromJob, false);

assert.equal(layout.kind, "evavo-creative-output-layout-v1");
for (const directory of ["renders/candidates","renders/sprites","exports/game","training/datasets","training/adapters","scratch"]) assert.ok(layout.directories.includes(directory));
assert.equal(layout.policy.outputsInGitByDefault, false);
assert.equal(layout.policy.overwriteExistingFiles, false);

assert.equal(quality.kind, "evavo-art-local-image-quality-routes-v1");
const routeIds = new Set(quality.routes.map((route) => route.id));
for (const routeId of ["workstation-default","realism-challenger","large-image-challenger"]) assert.ok(routeIds.has(routeId));
assert.equal(quality.styleSpecialisation.strategy, "base-model-plus-reviewed-style-adapter-and-reference-pack");
assert.equal(quality.styleSpecialisation.adapterAuthority, "EVAVO-STUDIO/evavo-model-lab");
for (const style of ["photorealistic","cinematic","anime","manga","cel","painterly","pixel-art","retro","historical-illustration","horror","pinup","project-defined"]) assert.ok(quality.styleSpecialisation.styleFamilies.includes(style));
for (const signal of ["depth","lineart","pose","normals","segmentation","matting","multi-reference"]) assert.ok(quality.controlSurfaces.signals.includes(signal));
for (const stage of ["generate-candidate-set","targeted-edit-or-inpaint","alpha-or-matting-when-required","upscale-or-target-size-mastering","native-size-review","export-with-output-manifest"]) assert.ok(quality.qualityChain.includes(stage));
assert.equal(quality.authority.executesModels, false);
assert.equal(quality.authority.automaticCreativeApproval, false);

console.log("Art Studio shared creative production contracts passed.");
