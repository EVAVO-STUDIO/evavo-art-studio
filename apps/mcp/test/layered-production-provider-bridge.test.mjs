import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileLayeredProductionPlan,
  compileLayeredProviderCandidateRequest,
} from "@evavo/art-direction";
import { compileProviderCandidateRuntimeContract } from "@evavo/art-providers";

const FIXTURE = new URL(
  "../../../config/jonez-layered-production-style-proof.v1.json",
  import.meta.url,
);

async function fixture() {
  return JSON.parse(await readFile(FIXTURE, "utf8"));
}

test("layered identity proof compiles through the provider-neutral runtime contract", async () => {
  const plan = compileLayeredProductionPlan(await fixture());
  const bridge = compileLayeredProviderCandidateRequest(plan, "player-idle-se");
  const contract = compileProviderCandidateRuntimeContract(bridge.request);

  assert.equal(contract.request.assetKind, "sprite-frame");
  assert.equal(contract.request.continuityPhase, "identity-master");
  assert.equal(contract.request.candidateCount, 1);
  assert.equal(contract.request.quality, "high");
  assert.equal(contract.request.target.outputFormat, "png");
  assert.equal(contract.runtimeJob.queue, "provider");
  assert.equal(contract.runtimeJob.kind, "art.candidate.generate");
  assert.match(contract.compiledPrompt, /RUNTIME SOURCE UNIT/);
  assert.match(contract.compiledPrompt, /one image only/i);
});

test("later JONEZ frame requires and retains approved identity reference capability", async () => {
  const request = await fixture();
  request.styleProof.approval = {
    approved: true,
    reviewer: "Greg Parker",
    reviewedAt: "2026-08-10T11:00:00.000Z",
    evidenceSha256: "a".repeat(64),
    approvedUnitIds: [...request.styleProof.unitIds],
  };
  const plan = compileLayeredProductionPlan(request);
  const bridge = compileLayeredProviderCandidateRequest(
    plan,
    "player-walk-se-f001",
    [
      {
        artifactId: `artifact_${"b".repeat(64)}`,
        role: "canonical-identity",
        required: true,
        note: "Exact approved JONEZ identity-master source.",
      },
    ],
  );
  const contract = compileProviderCandidateRuntimeContract(bridge.request);

  assert.equal(contract.request.continuityPhase, "key-pose");
  assert.equal(contract.request.references[0]?.role, "canonical-identity");
  assert.ok(contract.requiredAdapterCapabilities.includes("identity-reference"));
  assert.equal(contract.runtimeJob.payload.metadata.styleProofStatus, "approved");
  assert.equal(contract.runtimeJob.payload.metadata.approvals.source, false);
  assert.ok(Object.values(contract.runtimeJob.payload.metadata.approvals).every((value) => value === false));
});
