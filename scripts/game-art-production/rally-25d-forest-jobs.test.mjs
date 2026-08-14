import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileForestProviderJobSession,
  verifyForestProviderJobSession,
  validateForestVisualDevelopmentSpec,
  sha256,
} from "./rally-25d-forest-jobs.mjs";

const SPEC_PATH = new URL("./forest-stage-production-v1.json", import.meta.url);
const loadSpec = async () => JSON.parse(await readFile(SPEC_PATH, "utf8"));

function rehash(session) {
  const body = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256"));
  session.sessionSha256 = sha256(body);
  return session;
}

test("compiles the deterministic fourteen-image forest session", async () => {
  const spec = await loadSpec();
  const before = JSON.stringify(spec);
  const first = compileForestProviderJobSession(spec);
  const second = compileForestProviderJobSession(spec);
  assert.equal(first.sessionSha256, second.sessionSha256);
  assert.equal(first.schema, "evavo.rally-forest-provider-job-session.v1");
  assert.equal(first.totals.jobs, 14);
  assert.equal(first.totals.images, 14);
  assert.equal(first.totals.materialJobs, 4);
  assert.equal(first.totals.foliageJobs, 3);
  assert.equal(first.jobs[0].jobId, "forest-stage-identity-dry");
  assert.equal(first.jobs.at(-1).jobId, "forest-stage-weather-rain-fog");
  assert.ok(first.jobs.every((job) => job.images === 1));
  assert.ok(first.jobs.every((job) => job.output.master.endsWith(`${job.jobId}.png`)));
  assert.equal(new Set(first.jobs.map((job) => job.output.master)).size, 14);
  assert.equal(first.readiness.downstream3DReady, false);
  assert.equal(first.authority.providerExecution, false);
  assert.equal(JSON.stringify(spec), before);
  assert.equal(verifyForestProviderJobSession(first), true);
});

test("rejects cycles and missing dependency identities", async () => {
  const spec = await loadSpec();
  const cycle = structuredClone(spec);
  cycle.jobs[0].dependsOn = [cycle.jobs.at(-1).id];
  assert.throws(() => compileForestProviderJobSession(cycle), /cycle/i);
  const missing = structuredClone(spec);
  missing.jobs[3].dependsOn = ["missing-road-plan"];
  assert.throws(() => compileForestProviderJobSession(missing), /unknown dependency/i);
});

test("rejects combined layouts and weak family closure", async () => {
  const spec = await loadSpec();
  const layout = structuredClone(spec);
  layout.jobs[0].include.push("contact sheet of alternate stage views");
  assert.throws(() => validateForestVisualDevelopmentSpec(layout), /combined layout/i);
  const closure = structuredClone(spec);
  for (const job of closure.jobs) {
    if (job.role === "foliage-modeling-reference") job.role = "world-composition";
  }
  assert.throws(() => validateForestVisualDevelopmentSpec(closure), /foliage-modeling-reference|foliage modeling/i);
});

test("rejects coercive camera and authority metadata", async () => {
  const spec = await loadSpec();
  const camera = structuredClone(spec);
  camera.cameraLocks.heroPitchDegrees = "28";
  assert.throws(() => compileForestProviderJobSession(camera), /finite number/i);
  const authority = structuredClone(spec);
  authority.authority.providerExecution = true;
  assert.throws(() => compileForestProviderJobSession(authority), /must remain false/i);
});

test("rejects attacker-rehashed session drift", async () => {
  const session = compileForestProviderJobSession(await loadSpec());
  const forged = structuredClone(session);
  forged.jobs[2].target.width = 4096;
  rehash(forged);
  assert.throws(() => verifyForestProviderJobSession(forged), /deterministic compilation/i);
});
