import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileSkidSmokeProviderSession,
  verifySkidSmokeProviderSession,
  validateSkidSmokeSpec,
  sha256,
} from "./rally-25d-skid-smoke-jobs.mjs";

const SPEC_PATH = new URL("../../config/game-art-production/vfx/skid-smoke-production-v1.json", import.meta.url);
const loadSpec = async () => JSON.parse(await readFile(SPEC_PATH, "utf8"));

function rehash(session) {
  const body = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256"));
  session.sessionSha256 = sha256(body);
  return session;
}

test("compiles a deterministic ten-image skid-smoke session", async () => {
  const spec = await loadSpec();
  const before = JSON.stringify(spec);
  const first = compileSkidSmokeProviderSession(spec);
  const second = compileSkidSmokeProviderSession(spec);
  assert.equal(first.sessionSha256, second.sessionSha256);
  assert.equal(first.schema, "evavo.rally-skid-smoke-provider-job-session.v1");
  assert.equal(first.totals.jobs, 10);
  assert.equal(first.totals.images, 10);
  assert.equal(first.totals.responseJobs, 5);
  assert.equal(first.totals.spriteJobs, 3);
  assert.equal(first.jobs[0].jobId, "skid-smoke-contact-puff");
  assert.equal(first.jobs.at(-1).jobId, "skid-smoke-late-decay");
  assert.ok(first.jobs.every((job) => job.images === 1));
  assert.ok(first.jobs.every((job) => job.target.transparentBackground === true));
  assert.equal(new Set(first.jobs.map((job) => job.output.master)).size, 10);
  assert.equal(first.authority.providerExecution, false);
  assert.equal(first.readiness.downstream3DReady, false);
  assert.equal(JSON.stringify(spec), before);
  assert.equal(verifySkidSmokeProviderSession(first), true);
});

test("rejects cycles and missing dependency identities", async () => {
  const spec = await loadSpec();
  const cycle = structuredClone(spec);
  cycle.jobs[0].dependsOn = [cycle.jobs.at(-1).id];
  assert.throws(() => compileSkidSmokeProviderSession(cycle), /cycle/i);
  const missing = structuredClone(spec);
  missing.jobs[2].dependsOn = ["missing-smoke-source"];
  assert.throws(() => compileSkidSmokeProviderSession(missing), /unknown dependency/i);
});

test("rejects combined layouts and weak role closure", async () => {
  const spec = await loadSpec();
  const layout = structuredClone(spec);
  layout.jobs[0].include.push("contact sheet of smoke variants");
  assert.throws(() => validateSkidSmokeSpec(layout), /combined layout/i);
  const closure = structuredClone(spec);
  for (const job of closure.jobs) {
    if (job.role === "particle-sprite-reference") job.role = "effect-response-reference";
  }
  assert.throws(() => validateSkidSmokeSpec(closure), /particle-sprite-reference|particle-sprite jobs/i);
});

test("rejects coercive output and authority metadata", async () => {
  const spec = await loadSpec();
  const dimensions = structuredClone(spec);
  dimensions.jobs[0].width = "2048";
  assert.throws(() => compileSkidSmokeProviderSession(dimensions), /must equal 2048/i);
  const authority = structuredClone(spec);
  authority.authority.providerExecution = true;
  assert.throws(() => compileSkidSmokeProviderSession(authority), /must remain false/i);
});

test("rejects attacker-rehashed session drift", async () => {
  const session = compileSkidSmokeProviderSession(await loadSpec());
  const forged = structuredClone(session);
  forged.jobs[2].target.width = 4096;
  rehash(forged);
  assert.throws(() => verifySkidSmokeProviderSession(forged), /deterministic compilation/i);
});
