import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileMarshalSession, verifyMarshalSession, validateMarshalSpec, sha256 } from "./rally-25d-marshal-jobs.mjs";
const SPEC = new URL("../../config/game-art-production/characters/marshal-production-v1.json", import.meta.url);
const load = async () => JSON.parse(await readFile(SPEC, "utf8"));
const rehash = (session) => { const body = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256")); session.sessionSha256 = sha256(body); return session; };

test("compiles deterministic thirteen-image marshal session", async () => {
  const spec = await load(); const before = JSON.stringify(spec); const first = compileMarshalSession(spec); const second = compileMarshalSession(spec);
  assert.equal(first.sessionSha256, second.sessionSha256); assert.equal(first.totals.jobs, 13); assert.equal(first.totals.images, 13); assert.equal(first.totals.modelingJobs, 3); assert.equal(first.totals.animationJobs, 5); assert.equal(first.totals.animationClips, 5);
  assert.ok(first.jobs.every((job) => job.images === 1)); assert.equal(new Set(first.jobs.map((job) => job.output.master)).size, 13); assert.equal(first.readiness.downstream3DReady, false); assert.equal(first.authority.providerExecution, false); assert.equal(JSON.stringify(spec), before); assert.equal(verifyMarshalSession(first), true);
});

test("rejects dependency cycles and unknown dependencies", async () => {
  const cycle = await load(); cycle.jobs[0].dependsOn = [cycle.jobs.at(-1).id]; assert.throws(() => compileMarshalSession(cycle), /cycle/i);
  const missing = await load(); missing.jobs[5].dependsOn = ["missing-marshal-reference"]; assert.throws(() => compileMarshalSession(missing), /unknown dependency/i);
});

test("rejects combined layouts and animation-role drift", async () => {
  const combined = await load(); combined.jobs[8].include.push("contact sheet of multiple frames"); assert.throws(() => validateMarshalSpec(combined), /combined layout/i);
  const weak = await load(); for (const job of weak.jobs) if (job.role === "animation-key-pose") job.role = "variant-identity"; assert.throws(() => validateMarshalSpec(weak), /animation-key-pose|animation key-pose/i);
});

test("rejects coercive body locks and authority escalation", async () => {
  const body = await load(); body.bodyLocks.heightMeters = "1.78"; assert.throws(() => compileMarshalSession(body), /finite number/i);
  const authority = await load(); authority.authority.providerExecution = true; assert.throws(() => compileMarshalSession(authority), /must remain false/i);
});

test("rejects attacker-rehashed session drift", async () => {
  const forged = compileMarshalSession(await load()); forged.jobs[2].target.width = 4096; rehash(forged); assert.throws(() => verifyMarshalSession(forged), /deterministic compilation/i);
});
