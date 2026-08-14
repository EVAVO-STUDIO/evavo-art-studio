import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileGuardrailSession, verifyGuardrailSession, validateGuardrailSpec, sha256 } from "./rally-25d-guardrail-jobs.mjs";

const SPEC = new URL("../../config/game-art-production/props/guardrail-production-v1.json", import.meta.url);
const load = async () => JSON.parse(await readFile(SPEC, "utf8"));
const rehash = (session) => { const body = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256")); session.sessionSha256 = sha256(body); return session; };

test("compiles the deterministic twelve-image guardrail session", async () => {
  const spec = await load(); const before = JSON.stringify(spec); const first = compileGuardrailSession(spec); const second = compileGuardrailSession(spec);
  assert.equal(first.sessionSha256, second.sessionSha256); assert.equal(first.totals.jobs, 12); assert.equal(first.totals.images, 12); assert.equal(first.totals.variants, 4); assert.equal(first.totals.modelingJobs, 4); assert.equal(first.totals.damageJobs, 3);
  assert.ok(first.jobs.every((job) => job.images === 1)); assert.equal(new Set(first.jobs.map((job) => job.output.master)).size, 12); assert.equal(first.readiness.downstream3DReady, false); assert.equal(first.authority.providerExecution, false); assert.equal(JSON.stringify(spec), before); assert.equal(verifyGuardrailSession(first), true);
});

test("rejects cycles and unknown dependencies", async () => {
  const cycle = await load(); cycle.jobs[0].dependsOn = [cycle.jobs.at(-1).id]; assert.throws(() => compileGuardrailSession(cycle), /cycle/i);
  const missing = await load(); missing.jobs[4].dependsOn = ["missing-module"]; assert.throws(() => compileGuardrailSession(missing), /unknown dependency/i);
});

test("rejects combined layouts and weak role closure", async () => {
  const combined = await load(); combined.jobs[0].include.push("contact sheet of alternatives"); assert.throws(() => validateGuardrailSpec(combined), /combined layout/i);
  const weak = await load(); for (const job of weak.jobs) if (job.role === "breakable-damage-reference") job.role = "variant-identity"; assert.throws(() => validateGuardrailSpec(weak), /breakable-damage-reference|damage references/i);
});

test("rejects coercive camera and authority metadata", async () => {
  const camera = await load(); camera.cameraLocks.heroPitchDegrees = "24"; assert.throws(() => compileGuardrailSession(camera), /finite number/i);
  const authority = await load(); authority.authority.providerExecution = true; assert.throws(() => compileGuardrailSession(authority), /must remain false/i);
});

test("rejects attacker-rehashed session drift", async () => {
  const forged = compileGuardrailSession(await load()); forged.jobs[0].target.width = 4096; rehash(forged); assert.throws(() => verifyGuardrailSession(forged), /deterministic compilation/i);
});
