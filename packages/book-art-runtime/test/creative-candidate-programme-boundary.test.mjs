import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
  compileBookArtCreativeCandidateProgramme,
} from "../dist/creative-candidate-programme-boundary.js";

function assertControlledBlock(result) {
  assert.equal(result.status, "blocked");
  assert.equal(result.contract, BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT);
  assert.deepEqual(result.identity, {
    workspaceId: "invalid",
    projectId: "invalid",
    bookId: "invalid",
    requestId: "invalid",
  });
  assert.deepEqual(result.blockers, [
    "Creative candidate programme input could not be safely evaluated.",
  ]);
  assert.equal(result.bulkSubmissionAllowed, false);
  assert.equal(result.runtimeJobsSubmitted, false);
  assert.equal(result.providerCallPerformed, false);
  assert.equal(result.candidateArtifactsWritten, false);
  assert.equal(result.selectionPerformed, false);
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.publicationPerformed, false);
}

test("public programme boundary contains hostile ownKeys Proxy traps", async () => {
  const hostile = new Proxy({}, {
    ownKeys() {
      throw new Error("private-ownKeys-detail");
    },
  });

  const result = await compileBookArtCreativeCandidateProgramme(hostile);
  assertControlledBlock(result);
  assert.doesNotMatch(JSON.stringify(result), /private-ownKeys-detail/);
});

test("public programme boundary contains throwing property accessors", async () => {
  const hostile = {};
  Object.defineProperty(hostile, "outputKind", {
    enumerable: true,
    get() {
      throw new Error("private-accessor-detail");
    },
  });

  const result = await compileBookArtCreativeCandidateProgramme(hostile);
  assertControlledBlock(result);
  assert.doesNotMatch(JSON.stringify(result), /private-accessor-detail/);
});

test("public programme boundary contains revoked proxies", async () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();

  const result = await compileBookArtCreativeCandidateProgramme(proxy);
  assertControlledBlock(result);
});
