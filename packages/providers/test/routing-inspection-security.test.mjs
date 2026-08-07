import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXTURE_PROVIDER_DESCRIPTOR,
  ProviderError,
  ProviderRegistry,
  compileProviderRoutingInspection,
  inspectProviderCandidateRouting,
  validateProviderCandidateRequest,
} from "../dist/index.js";

function independentRequest() {
  return validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "illustration",
    continuityPhase: "independent",
    assetId: "routing-security-art",
    candidateFamilyId: "routing-security-candidates",
    creativeIntent: "Create two governed provider candidates for routing security tests.",
    style: {
      styleName: "Routing security fixture",
      intent: "Keep the provider contract deterministic and evidence-safe.",
      mustHave: ["complete subject"],
      mustAvoid: ["generated text"],
    },
    shot: {
      subject: "One complete governed test subject.",
      include: ["complete silhouette"],
      exclude: ["unrelated scenery"],
      separateAssets: ["interface overlay"],
    },
    target: {
      width: 1280,
      height: 720,
      transparency: "opaque",
      outputFormat: "png",
    },
    background: { strategy: "opaque-source" },
    candidateCount: 2,
  });
}

function mutableDescriptor(id = "mutable-image") {
  return {
    ...FIXTURE_PROVIDER_DESCRIPTOR,
    id,
    label: "Mutable provider fixture",
    priority: 500,
    capabilities: [...FIXTURE_PROVIDER_DESCRIPTOR.capabilities],
    models: ["mutable-image-v1"],
    dataPolicy: {
      remote: false,
      retainedByProvider: false,
      usedForTraining: false,
    },
    serverSecret: "must-never-enter-routing-evidence",
    authorizationHeader: "Bearer must-never-enter-routing-evidence",
  };
}

test("provider registry snapshots descriptors and strips undeclared secret fields", () => {
  const descriptor = mutableDescriptor();
  const adapter = {
    descriptor,
    execute: async () => {
      throw new Error("execution is outside this inspection-only test");
    },
  };
  const registry = new ProviderRegistry([adapter]);
  const request = independentRequest();
  const first = inspectProviderCandidateRouting(request, registry);

  assert.equal(first.outcome, "eligible");
  assert.equal(first.firstEligibleAdapterId, "mutable-image");
  assert.equal(first.adapters.length, 1);
  assert.deepEqual(
    Object.keys(first.adapters[0].descriptor).sort(),
    [
      "capabilities",
      "dataPolicy",
      "id",
      "label",
      "maximumCandidates",
      "maximumReferenceImages",
      "maximumSourceBytes",
      "models",
      "priority",
      "protocolVersion",
      "version",
    ],
  );
  assert.equal(
    Object.hasOwn(first.adapters[0].descriptor, "serverSecret"),
    false,
  );
  assert.equal(
    Object.hasOwn(first.adapters[0].descriptor, "authorizationHeader"),
    false,
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.adapters), true);
  assert.equal(Object.isFrozen(first.adapters[0]), true);
  assert.equal(Object.isFrozen(first.adapters[0].descriptor), true);
  assert.equal(Object.isFrozen(first.adapters[0].descriptor.capabilities), true);
  assert.equal(Object.isFrozen(first.adapters[0].descriptor.models), true);
  assert.equal(Object.isFrozen(first.adapters[0].descriptor.dataPolicy), true);
  assert.equal(Object.isFrozen(first.adapters[0].decision), true);
  assert.equal(Object.isFrozen(first.adapters[0].decision.reasons), true);
  assert.equal(Object.isFrozen(first.eligibleAdapterIds), true);
  assert.equal(Object.isFrozen(first.requiredCapabilities), true);

  descriptor.id = "tampered-image";
  descriptor.priority = -10_000;
  descriptor.capabilities.length = 0;
  descriptor.models[0] = "tampered-model";
  descriptor.dataPolicy.remote = true;
  descriptor.serverSecret = "rotated-secret";

  const second = inspectProviderCandidateRouting(request, registry);
  assert.deepEqual(second, first);
  assert.equal(registry.list()[0].id, "mutable-image");
  assert.equal(registry.list()[0].models[0], "mutable-image-v1");
  assert.equal(registry.list()[0].dataPolicy.remote, false);
  assert.throws(() => first.eligibleAdapterIds.push("tampered-image"), TypeError);
});

test("routing inspection sanitises custom rank values and rejects inconsistent evidence", () => {
  const descriptor = mutableDescriptor("custom-image");
  const adapter = {
    descriptor,
    execute: async () => {
      throw new Error("execution is outside this inspection-only test");
    },
  };
  const decision = {
    adapterId: "custom-image",
    eligible: true,
    reasons: ["all declared request capabilities are supported"],
    rank: 1,
    authorizationHeader: "Bearer must-never-enter-routing-evidence",
  };
  const request = independentRequest();
  const inspection = compileProviderRoutingInspection(request, [
    { adapter, decision },
  ]);

  assert.equal(
    Object.hasOwn(inspection.adapters[0].descriptor, "serverSecret"),
    false,
  );
  assert.equal(
    Object.hasOwn(inspection.adapters[0].decision, "authorizationHeader"),
    false,
  );
  descriptor.id = "changed-after-inspection";
  decision.adapterId = "changed-after-inspection";
  decision.reasons[0] = "rewritten after inspection";
  assert.equal(inspection.adapters[0].descriptor.id, "custom-image");
  assert.equal(inspection.adapters[0].decision.adapterId, "custom-image");
  assert.deepEqual(inspection.adapters[0].decision.reasons, [
    "all declared request capabilities are supported",
  ]);

  assert.throws(
    () =>
      compileProviderRoutingInspection(request, [
        {
          adapter,
          decision: {
            adapterId: "different-adapter",
            eligible: true,
            reasons: ["invalid mismatched decision"],
            rank: 1,
          },
        },
      ]),
    (error) =>
      error instanceof ProviderError &&
      error.code === "PROVIDER_ROUTING_INSPECTION_INVALID",
  );
});
