import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalJson,
  compileFalconProviderJobSession,
  sha256,
  validateFalconVisualDevelopmentSpec,
  verifyFalconProviderJobSession,
} from "./rally-25d-falcon-jobs.mjs";

const spec = JSON.parse(await readFile(
  new URL("../../config/game-art-production/vehicles/falcon-rally-production-v1.json", import.meta.url),
  "utf8",
));

test("compiles twelve deterministic one-image Falcon jobs", () => {
  const first = compileFalconProviderJobSession(spec);
  const second = compileFalconProviderJobSession(spec);
  assert.equal(first.sessionSha256, second.sessionSha256);
  assert.equal(first.totals.jobs, 12);
  assert.equal(first.totals.images, 12);
  assert.ok(first.jobs.every((job) => job.images === 1 && job.candidateCount === 1));
  assert.ok(first.jobs.every((job) => job.target.format === "png"));
  assert.ok(first.jobs.every((job) => job.authority.providerExecution === false));
  assert.ok(first.jobs.every((job) => !/Create .*contact sheet/i.test(job.prompt)));
  assert.ok(first.jobs.every((job) => /Output one .* PNG/u.test(job.prompt)));
  assert.equal(new Set(first.jobs.map((job) => job.output.master)).size, 12);
  assert.equal(verifyFalconProviderJobSession(first), true);
});

test("preserves dependency order and identity locks", () => {
  const session = compileFalconProviderJobSession(spec);
  const sequence = new Map(session.jobs.map((job) => [job.jobId, job.sequence]));
  for (const job of session.jobs) {
    for (const dependency of job.dependencies) {
      assert.ok(sequence.get(dependency) < job.sequence, `${dependency} must precede ${job.jobId}`);
    }
    assert.match(job.prompt, /Preserve the exact wheelbase, track width, body proportions, livery and panel identity/u);
    assert.match(job.prompt, /exactly one image/u);
  }
});

test("rejects combined layouts and authority escalation", () => {
  const combined = structuredClone(spec);
  combined.jobs[0].include.push("contact sheet of four views");
  assert.throws(() => validateFalconVisualDevelopmentSpec(combined), /forbidden combined layout/u);

  const escalated = structuredClone(spec);
  escalated.authority.providerExecution = true;
  assert.throws(() => compileFalconProviderJobSession(escalated), /providerExecution must remain false/u);
});

test("rejects rehashed session metadata that is not deterministic", () => {
  const forged = structuredClone(compileFalconProviderJobSession(spec));
  forged.jobs[0].target.width = 1024;
  const body = Object.fromEntries(Object.entries(forged).filter(([key]) => key !== "sessionSha256"));
  forged.sessionSha256 = sha256(body);
  assert.throws(() => verifyFalconProviderJobSession(forged), /not the deterministic compilation/u);
});

test("does not mutate the source specification", () => {
  const before = canonicalJson(spec);
  compileFalconProviderJobSession(spec);
  assert.equal(canonicalJson(spec), before);
});
