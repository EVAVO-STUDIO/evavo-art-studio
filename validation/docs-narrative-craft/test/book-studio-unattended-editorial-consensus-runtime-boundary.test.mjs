import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence,
} from "../src/index.ts";

const oversizedAssignments = Array.from(
  { length: 9 },
  (_, index) => ({ assignmentId: `assignment-${index + 1}` }),
);
const boundarySource = fs.readFileSync(
  new URL(
    "../src/book-studio-unattended-editorial-consensus-runtime-boundary.ts",
    import.meta.url,
  ),
  "utf8",
);

test("blocks non-object runtime-evidence input before semantic evaluation", async () => {
  const result =
    await evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence(null);
  assert.equal(result.status, "blocked");
  assert.equal(result.providerCallsPerformed, 0);
  assert.match(result.blockers.join("\n"), /must be an object/i);
});

test("blocks non-object reviewer entries before semantic evaluation", async () => {
  const malformedExecution = await
    evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence({
      programme: { reviewerAssignments: [{}, {}] },
      reviewerExecutions: [null, {}],
      reviewerRuntimeEvidence: [{}, {}],
    });
  assert.equal(malformedExecution.status, "blocked");
  assert.match(
    malformedExecution.blockers.join("\n"),
    /every reviewer execution must be an object/i,
  );

  const malformedEvidence = await
    evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence({
      programme: { reviewerAssignments: [{}, {}] },
      reviewerExecutions: [{}, {}],
      reviewerRuntimeEvidence: [{}, null],
    });
  assert.equal(malformedEvidence.status, "blocked");
  assert.match(
    malformedEvidence.blockers.join("\n"),
    /every reviewer runtime-evidence entry must be an object/i,
  );
});

test("blocks bounded malformed programme semantics without throwing", async () => {
  const result =
    await evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence({
      programme: { reviewerAssignments: [{}, {}] },
      reviewerExecutions: [{}, {}],
      reviewerRuntimeEvidence: [{}, {}],
    });
  assert.equal(result.status, "blocked");
  assert.equal(result.providerCallsPerformed, 0);
  assert.ok(result.blockers.length > 0);
});

test("keeps malformed nested runtime chronology behind a fail-closed guard", () => {
  const chronologyCall = boundarySource.indexOf(
    "temporalBlockers = validateRuntimeChronology(input);",
  );
  const chronologyFailure = boundarySource.indexOf(
    "Editorial runtime chronology could not be validated safely.",
  );
  const deepRuntimeCall = boundarySource.indexOf(
    "evaluateRuntimeEvidenceUnchecked(input)",
  );
  assert.ok(chronologyCall > 0);
  assert.ok(chronologyFailure > chronologyCall);
  assert.ok(deepRuntimeCall > chronologyFailure);
  assert.match(
    boundarySource.slice(chronologyCall - 80, chronologyFailure + 80),
    /try\s*\{[\s\S]*validateRuntimeChronology\(input\);[\s\S]*\}\s*catch\s*\{/u,
  );
});

test("blocks oversized programme reviewer assignments before traversal", async () => {
  const result =
    await evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence({
      programme: { reviewerAssignments: oversizedAssignments },
      reviewerExecutions: [{}, {}],
      reviewerRuntimeEvidence: [{}, {}],
    });
  assert.equal(result.status, "blocked");
  assert.equal(result.providerCallsPerformed, 0);
  assert.match(
    result.blockers.join("\n"),
    /programme\.reviewerAssignments must contain between 2 and 8 entries/i,
  );
});

test("blocks oversized execution and evidence arrays independently", async () => {
  const programme = { reviewerAssignments: [{}, {}] };
  const oversizedExecutions = await
    evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence({
      programme,
      reviewerExecutions: Array.from({ length: 9 }, () => ({})),
      reviewerRuntimeEvidence: [{}, {}],
    });
  assert.equal(oversizedExecutions.status, "blocked");
  assert.match(
    oversizedExecutions.blockers.join("\n"),
    /reviewerExecutions must contain between 2 and 8 entries/i,
  );

  const oversizedEvidence = await
    evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence({
      programme,
      reviewerExecutions: [{}, {}],
      reviewerRuntimeEvidence: Array.from({ length: 9 }, () => ({})),
    });
  assert.equal(oversizedEvidence.status, "blocked");
  assert.match(
    oversizedEvidence.blockers.join("\n"),
    /reviewerRuntimeEvidence must contain between 2 and 8 entries/i,
  );
});
