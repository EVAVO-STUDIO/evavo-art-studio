import assert from "node:assert/strict";
import test from "node:test";

import {
  compileBookArtCreativeProgrammeDispatch,
  submitBookArtCreativeProgrammeDispatch,
} from "../dist/creative-candidate-programme-dispatch-boundary.js";

function runtimeSpy() {
  const calls = { submitBatch: 0 };
  return {
    calls,
    async submitBatch() {
      calls.submitBatch += 1;
      throw new Error("runtime must not be reached for hostile input");
    },
  };
}

test("public dispatch compiler contains hostile Proxy traps", async () => {
  const hostile = new Proxy({}, {
    ownKeys() {
      throw new Error("hostile ownKeys trap");
    },
  });
  const result = await compileBookArtCreativeProgrammeDispatch(hostile);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, [
    "Creative programme dispatch input could not be safely evaluated.",
  ]);
  assert.equal(result.runtimeBatchSubmitted, false);
  assert.equal(result.selectionPerformed, false);
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.publicationPerformed, false);
});

test("public dispatch compiler contains hostile accessors", async () => {
  const hostile = {};
  Object.defineProperty(hostile, "programme", {
    enumerable: true,
    get() {
      throw new Error("hostile programme accessor");
    },
  });
  const result = await compileBookArtCreativeProgrammeDispatch(hostile);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /could not be safely evaluated/i);
  assert.equal(result.runtimeBatchSubmitted, false);
});

test("public dispatch submission never reaches runtime for hostile input", async () => {
  const runtime = runtimeSpy();
  const hostile = new Proxy({}, {
    get() {
      throw new Error("hostile get trap");
    },
  });
  const result = await submitBookArtCreativeProgrammeDispatch(hostile, {
    runtime,
    actor: "book-art-supervisor",
  });
  assert.equal(result.status, "blocked");
  assert.equal(runtime.calls.submitBatch, 0);
  assert.equal(result.runtimeBatchSubmitted, false);
  assert.equal(result.receipt, undefined);
  assert.equal(result.selectionPerformed, false);
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.publicationPerformed, false);
});
