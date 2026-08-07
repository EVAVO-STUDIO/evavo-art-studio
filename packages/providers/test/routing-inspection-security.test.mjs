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

test("provider registration snapshots descriptor and execute accessors exactly once", () => {
  const descriptor = mutableDescriptor("single-read-registry");
  const execute = async () => {
    throw new Error("execution is outside this registration-only test");
  };
  let descriptorReads = 0;
  let executeReads = 0;
  const adapter = {};
  Object.defineProperties(adapter, {
    descriptor: {
      enumerable: true,
      get() {
        descriptorReads += 1;
        if (descriptorReads > 1) {
          throw new Error("descriptor accessor was read more than once");
        }
        return descriptor;
      },
    },
    execute: {
      enumerable: true,
      get() {
        executeReads += 1;
        if (executeReads > 1) {
          throw new Error("execute accessor was read more than once");
        }
        return execute;
      },
    },
  });

  const registry = new ProviderRegistry([adapter]);
  const inspection = inspectProviderCandidateRouting(
    independentRequest(),
    registry,
  );

  assert.equal(inspection.firstEligibleAdapterId, "single-read-registry");
  assert.equal(descriptorReads, 1);
  assert.equal(executeReads, 1);
});

test("custom routing snapshots entry, decision and nested descriptor accessors exactly once", () => {
  const request = independentRequest();
  const baseDescriptor = mutableDescriptor("single-read-routing");
  let dataPolicyReads = 0;
  const descriptor = { ...baseDescriptor };
  Object.defineProperty(descriptor, "dataPolicy", {
    enumerable: true,
    get() {
      dataPolicyReads += 1;
      if (dataPolicyReads > 1) {
        throw new Error("data policy accessor was read more than once");
      }
      return baseDescriptor.dataPolicy;
    },
  });

  let reasonReads = 0;
  const reasons = [];
  Object.defineProperty(reasons, 0, {
    enumerable: true,
    get() {
      reasonReads += 1;
      if (reasonReads > 1) {
        throw new Error("routing reason accessor was read more than once");
      }
      return "all declared request capabilities are supported";
    },
  });

  const decisionReads = {
    adapterId: 0,
    eligible: 0,
    reasons: 0,
    rank: 0,
  };
  const decision = {};
  Object.defineProperties(decision, {
    adapterId: {
      enumerable: true,
      get() {
        decisionReads.adapterId += 1;
        if (decisionReads.adapterId > 1) {
          throw new Error("adapter id accessor was read more than once");
        }
        return "single-read-routing";
      },
    },
    eligible: {
      enumerable: true,
      get() {
        decisionReads.eligible += 1;
        if (decisionReads.eligible > 1) {
          throw new Error("eligibility accessor was read more than once");
        }
        return true;
      },
    },
    reasons: {
      enumerable: true,
      get() {
        decisionReads.reasons += 1;
        if (decisionReads.reasons > 1) {
          throw new Error("reasons accessor was read more than once");
        }
        return reasons;
      },
    },
    rank: {
      enumerable: true,
      get() {
        decisionReads.rank += 1;
        if (decisionReads.rank > 1) {
          throw new Error("rank accessor was read more than once");
        }
        return 1;
      },
    },
  });

  const adapter = {
    descriptor,
    execute: async () => {
      throw new Error("execution is outside this inspection-only test");
    },
  };
  let adapterReads = 0;
  let decisionObjectReads = 0;
  const entry = {};
  Object.defineProperties(entry, {
    adapter: {
      enumerable: true,
      get() {
        adapterReads += 1;
        if (adapterReads > 1) {
          throw new Error("entry adapter accessor was read more than once");
        }
        return adapter;
      },
    },
    decision: {
      enumerable: true,
      get() {
        decisionObjectReads += 1;
        if (decisionObjectReads > 1) {
          throw new Error("entry decision accessor was read more than once");
        }
        return decision;
      },
    },
  });

  const inspection = compileProviderRoutingInspection(request, [entry]);

  assert.equal(inspection.firstEligibleAdapterId, "single-read-routing");
  assert.deepEqual(inspection.adapters[0].decision.reasons, [
    "all declared request capabilities are supported",
  ]);
  assert.equal(adapterReads, 1);
  assert.equal(decisionObjectReads, 1);
  assert.equal(dataPolicyReads, 1);
  assert.equal(reasonReads, 1);
  assert.deepEqual(decisionReads, {
    adapterId: 1,
    eligible: 1,
    reasons: 1,
    rank: 1,
  });
});
