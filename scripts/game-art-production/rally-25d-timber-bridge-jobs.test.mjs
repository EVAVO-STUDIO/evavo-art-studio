import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileTimberBridgeSession,
  verifyTimberBridgeSession,
  validateTimberBridgeSpec,
  sha256,
} from "./rally-25d-timber-bridge-jobs.mjs";

const SPEC_PATH = new URL("../../config/game-art-production/structures/timber-bridge-production-v1.json", import.meta.url);
const loadSpec = async () => JSON.parse(await readFile(SPEC_PATH, "utf8"));

function rehash(session) {
  const body = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256"));
  session.sessionSha256 = sha256(body);
  return session;
}

test("compiles deterministic ten-image timber-bridge session", async () => {
  const spec = await loadSpec();
  const before = JSON.stringify(spec);
  const first = compileTimberBridgeSession(spec);
  const second = compileTimberBridgeSession(spec);
  assert.equal(first.sessionSha256, second.sessionSha256);
  assert.equal(first.schema, "evavo.rally-timber-bridge-provider-job-session.v1");
  assert.equal(first.totals.jobs, 10);
  assert.equal(first.totals.images, 10);
  assert.equal(first.totals.modelingJobs, 4);
  assert.equal(first.totals.damageJobs, 3);
  assert.equal(first.jobs[0].jobId, "timber-bridge-identity-dry");
  assert.equal(first.jobs.at(-1).jobId, "timber-bridge-breakable-parts");
  assert.equal(new Set(first.jobs.map((job) => job.output.master)).size, 10);
  assert.ok(first.jobs.every((job) => job.images === 1));
  assert.ok(first.jobs.every((job) => job.authority.providerExecution === false));
  assert.equal(first.readiness.downstream3DReady, false);
  assert.equal(JSON.stringify(spec), before);
  assert.equal(verifyTimberBridgeSession(first), true);
});

test("rejects dependency cycles and unknown dependencies", async () => {
  const cycle = await loadSpec();
  cycle.jobs[0].dependsOn = [cycle.jobs.at(-1).id];
  assert.throws(() => compileTimberBridgeSession(cycle), /cycle/i);
  const missing = await loadSpec();
  missing.jobs[5].dependsOn = ["unknown-bridge-reference"];
  assert.throws(() => compileTimberBridgeSession(missing), /unknown dependency/i);
});

test("rejects combined layouts and weak role closure", async () => {
  const layout = await loadSpec();
  layout.jobs[0].include.push("contact sheet of alternate bridge designs");
  assert.throws(() => validateTimberBridgeSpec(layout), /combined layout/i);
  const closure = await loadSpec();
  closure.jobs[2].role = "identity-continuity";
  assert.throws(() => validateTimberBridgeSpec(closure), /four modular modeling references/i);
});

test("rejects coercive camera and authority metadata", async () => {
  const camera = await loadSpec();
  camera.cameraLocks.heroPitchDegrees = "26";
  assert.throws(() => compileTimberBridgeSession(camera), /finite number/i);
  const authority = await loadSpec();
  authority.authority.providerExecution = true;
  assert.throws(() => compileTimberBridgeSession(authority), /must remain false/i);
});

test("rejects attacker-rehashed session drift", async () => {
  const session = compileTimberBridgeSession(await loadSpec());
  const forged = structuredClone(session);
  forged.jobs[3].target.width = 4096;
  rehash(forged);
  assert.throws(() => verifyTimberBridgeSession(forged), /deterministic compilation/i);
});
