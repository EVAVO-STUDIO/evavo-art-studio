import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileGlassBurstProviderSession,
  sha256,
  validateGlassBurstSpec,
  verifyGlassBurstProviderSession,
} from "./rally-25d-glass-burst-jobs.mjs";

const SPEC_PATH = new URL(
  "../../config/game-art-production/vfx/glass-burst-production-v1.json",
  import.meta.url,
);
const loadSpec = async () => JSON.parse(await readFile(SPEC_PATH, "utf8"));

function rehash(session) {
  const body = Object.fromEntries(
    Object.entries(session).filter(([key]) => key !== "sessionSha256"),
  );
  session.sessionSha256 = sha256(body);
  return session;
}

test("compiles twelve deterministic one-image Glass Burst jobs", async () => {
  const spec = await loadSpec();
  const before = JSON.stringify(spec);
  const first = compileGlassBurstProviderSession(spec);
  const second = compileGlassBurstProviderSession(spec);
  assert.equal(first.sessionSha256, second.sessionSha256);
  assert.equal(first.schema, "evavo.rally-glass-burst-provider-job-session.v1");
  assert.equal(first.totals.jobs, 12);
  assert.equal(first.totals.images, 12);
  assert.equal(first.totals.responseJobs, 6);
  assert.equal(first.totals.spriteJobs, 4);
  assert.equal(first.jobs[0].jobId, "glass-burst-impact-star");
  assert.equal(first.jobs.at(-1).jobId, "glass-burst-late-decay");
  assert.ok(first.jobs.every((job) => job.images === 1));
  assert.ok(first.jobs.every((job) => job.target.transparentBackground === true));
  assert.equal(new Set(first.jobs.map((job) => job.output.master)).size, 12);
  assert.equal(first.readiness.downstream3DReady, false);
  assert.equal(first.authority.providerExecution, false);
  assert.equal(JSON.stringify(spec), before);
  assert.equal(verifyGlassBurstProviderSession(first), true);
});

test("rejects dependency cycles and unknown dependencies", async () => {
  const spec = await loadSpec();
  const cycle = structuredClone(spec);
  cycle.jobs[0].dependsOn = [cycle.jobs.at(-1).id];
  assert.throws(() => compileGlassBurstProviderSession(cycle), /cycle/iu);
  const missing = structuredClone(spec);
  missing.jobs[2].dependsOn = ["missing-glass-source"];
  assert.throws(() => compileGlassBurstProviderSession(missing), /unknown dependency/iu);
});

test("rejects combined layouts and weak role closure", async () => {
  const spec = await loadSpec();
  const combined = structuredClone(spec);
  combined.jobs[0].include.push("contact sheet of several impacts");
  assert.throws(() => validateGlassBurstSpec(combined), /combined layout/iu);
  const weak = structuredClone(spec);
  for (const job of weak.jobs) {
    if (job.role === "particle-sprite-reference") job.role = "effect-response-reference";
  }
  assert.throws(() => validateGlassBurstSpec(weak), /particle-sprite-reference|sprite/iu);
});

test("rejects coercive targets and authority escalation", async () => {
  const spec = await loadSpec();
  const target = structuredClone(spec);
  target.jobs[0].width = "2048";
  assert.throws(() => compileGlassBurstProviderSession(target), /2048/iu);
  const authority = structuredClone(spec);
  authority.authority.providerExecution = true;
  assert.throws(() => compileGlassBurstProviderSession(authority), /must remain false/iu);
});

test("rejects attacker-rehashed session drift", async () => {
  const session = compileGlassBurstProviderSession(await loadSpec());
  const forged = structuredClone(session);
  forged.jobs[4].prompt = `${forged.jobs[4].prompt}\nAdd a whole vehicle.`;
  rehash(forged);
  assert.throws(
    () => verifyGlassBurstProviderSession(forged),
    /deterministic compilation/iu,
  );
});
