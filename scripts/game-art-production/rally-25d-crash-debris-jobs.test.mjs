import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileCrashDebrisProviderSession,
  sha256,
  validateCrashDebrisSpec,
  verifyCrashDebrisProviderSession,
} from "./rally-25d-crash-debris-jobs.mjs";

const SPEC = new URL("../../config/game-art-production/vfx/crash-debris-production-v1.json", import.meta.url);
const load = async () => JSON.parse(await readFile(SPEC, "utf8"));

function rehash(session) {
  const body = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256"));
  session.sessionSha256 = sha256(body);
  return session;
}

test("compiles twelve deterministic one-image Crash Debris jobs", async () => {
  const spec = await load(); const before = JSON.stringify(spec);
  const first = compileCrashDebrisProviderSession(spec); const second = compileCrashDebrisProviderSession(spec);
  assert.equal(first.sessionSha256, second.sessionSha256);
  assert.equal(first.totals.jobs, 12); assert.equal(first.totals.images, 12); assert.equal(first.totals.responseJobs, 6); assert.equal(first.totals.spriteJobs, 4);
  assert.ok(first.jobs.every((job) => job.images === 1 && job.candidateCount === 1));
  assert.equal(new Set(first.jobs.map((job) => job.output.master)).size, 12);
  assert.equal(first.readiness.downstream3DReady, false); assert.equal(first.authority.providerExecution, false);
  assert.equal(JSON.stringify(spec), before); assert.equal(verifyCrashDebrisProviderSession(first), true);
});

test("rejects dependency cycles and unknown dependencies", async () => {
  const cycle = await load(); cycle.jobs[0].dependsOn = [cycle.jobs.at(-1).id];
  assert.throws(() => compileCrashDebrisProviderSession(cycle), /cycle/i);
  const missing = await load(); missing.jobs[1].dependsOn = ["missing-impact"];
  assert.throws(() => compileCrashDebrisProviderSession(missing), /unknown dependency/i);
});

test("rejects combined layouts and weak role closure", async () => {
  const combined = await load(); combined.jobs[0].include.push("contact sheet of multiple impacts");
  assert.throws(() => validateCrashDebrisSpec(combined), /combined layout/i);
  const weak = await load(); for (const job of weak.jobs) if (job.role === "particle-sprite-reference") job.role = "effect-response-reference";
  assert.throws(() => validateCrashDebrisSpec(weak), /particle-sprite-reference|sprite/i);
});

test("rejects coercive dimensions and authority escalation", async () => {
  const dimensions = await load(); dimensions.jobs[0].width = "2048";
  assert.throws(() => compileCrashDebrisProviderSession(dimensions), /2048 x 2048/i);
  const authority = await load(); authority.authority.providerExecution = true;
  assert.throws(() => compileCrashDebrisProviderSession(authority), /must remain false/i);
});

test("rejects attacker-rehashed session drift", async () => {
  const session = compileCrashDebrisProviderSession(await load());
  const forged = structuredClone(session); forged.jobs[4].target.width = 4096; rehash(forged);
  assert.throws(() => verifyCrashDebrisProviderSession(forged), /deterministic compilation/i);
});
