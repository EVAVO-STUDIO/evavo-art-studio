import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileGravelSpraySession,
  verifyGravelSpraySession,
  validateGravelSpraySpec,
  sha256,
} from "./rally-25d-gravel-spray-jobs.mjs";

const SPEC_PATH = new URL("../config/gravel-spray-production-v1.json", import.meta.url);
const loadSpec = async () => JSON.parse(await readFile(SPEC_PATH, "utf8"));

function rehash(session) {
  const body = Object.fromEntries(
    Object.entries(session).filter(([key]) => key !== "sessionSha256"),
  );
  session.sessionSha256 = sha256(body);
  return session;
}

test("compiles the deterministic twelve-image gravel-spray session", async () => {
  const spec = await loadSpec();
  const before = JSON.stringify(spec);
  const first = compileGravelSpraySession(spec);
  const second = compileGravelSpraySession(spec);
  assert.equal(first.sessionSha256, second.sessionSha256);
  assert.equal(first.schema, "evavo.rally-gravel-spray-provider-job-session.v1");
  assert.equal(first.totals.jobs, 12);
  assert.equal(first.totals.images, 12);
  assert.equal(first.totals.responseJobs, 5);
  assert.equal(first.totals.spriteJobs, 4);
  assert.equal(first.totals.impactJobs, 2);
  assert.equal(first.jobs[0].jobId, "gravel-spray-contact-burst");
  assert.equal(first.jobs.at(-1).jobId, "gravel-spray-late-decay");
  assert.ok(first.jobs.every((job) => job.images === 1));
  assert.ok(first.jobs.every((job) => job.target.transparentBackground === true));
  assert.equal(new Set(first.jobs.map((job) => job.output.master)).size, 12);
  assert.equal(first.readiness.downstream3DReady, false);
  assert.equal(first.authority.providerExecution, false);
  assert.equal(JSON.stringify(spec), before);
  assert.equal(verifyGravelSpraySession(first), true);
});

test("rejects dependency cycles and unknown prerequisites", async () => {
  const spec = await loadSpec();
  const cycle = structuredClone(spec);
  cycle.jobs[0].dependsOn = [cycle.jobs.at(-1).id];
  assert.throws(() => compileGravelSpraySession(cycle), /cycle/i);
  const missing = structuredClone(spec);
  missing.jobs[2].dependsOn = ["missing-gravel-source"];
  assert.throws(() => compileGravelSpraySession(missing), /unknown dependency/i);
});

test("rejects combined layouts and weak role closure", async () => {
  const spec = await loadSpec();
  const layout = structuredClone(spec);
  layout.jobs[0].include.push("contact sheet of alternate bursts");
  assert.throws(() => validateGravelSpraySpec(layout), /combined layout/i);
  const closure = structuredClone(spec);
  for (const job of closure.jobs) {
    if (job.role === "particle-sprite-reference") {
      job.role = "effect-response-reference";
    }
  }
  assert.throws(() => validateGravelSpraySpec(closure), /particle-sprite-reference|sprite/i);
});

test("rejects coercive metadata and authority escalation", async () => {
  const spec = await loadSpec();
  const dimension = structuredClone(spec);
  dimension.jobs[0].width = "2048";
  assert.throws(() => compileGravelSpraySession(dimension), /must equal 2048/i);
  const transparency = structuredClone(spec);
  transparency.jobs[0].transparent = false;
  assert.throws(() => compileGravelSpraySession(transparency), /true transparency/i);
  const authority = structuredClone(spec);
  authority.authority.providerExecution = true;
  assert.throws(() => compileGravelSpraySession(authority), /must remain false/i);
});

test("rejects an attacker-rehashed session drift", async () => {
  const session = compileGravelSpraySession(await loadSpec());
  const forged = structuredClone(session);
  forged.jobs[2].target.width = 4096;
  rehash(forged);
  assert.throws(
    () => verifyGravelSpraySession(forged),
    /deterministic compilation/i,
  );
});
