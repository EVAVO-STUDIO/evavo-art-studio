import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";

import {
  FIXTURE_PROVIDER_DESCRIPTOR,
  executeProviderCandidateRequest,
  providerRequestSha256,
  validateProviderCandidateRequest,
} from "../dist/index.js";

function requestInput() {
  return {
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "illustration",
    continuityPhase: "independent",
    assetId: "immutable-request-art",
    candidateFamilyId: "immutable-request-candidates",
    creativeIntent:
      "Create one governed candidate while preserving one immutable request across prompt, routing, evidence and execution.",
    style: {
      styleName: "Immutable request security fixture",
      intent: "Keep the complete provider request stable after validation.",
      mustHave: ["locked visual direction"],
      mustAvoid: ["request drift"],
    },
    shot: {
      subject: "One complete governed test subject.",
      include: ["complete silhouette"],
      exclude: ["unrelated scenery"],
      separateAssets: ["interface overlay"],
    },
    target: {
      width: 128,
      height: 128,
      transparency: "opaque",
      outputFormat: "png",
    },
    background: { strategy: "opaque-source" },
    candidateCount: 1,
    selection: {
      allowedAdapterIds: ["immutable-request-provider"],
      allowFallback: false,
      requireSeed: false,
    },
    metadata: {
      governance: {
        stage: "validated",
        locks: ["prompt", "routing", "evidence", "execution"],
      },
    },
  };
}

function descriptor() {
  return Object.freeze({
    ...FIXTURE_PROVIDER_DESCRIPTOR,
    id: "immutable-request-provider",
    label: "Immutable request provider fixture",
    priority: 750,
    capabilities: Object.freeze([
      ...FIXTURE_PROVIDER_DESCRIPTOR.capabilities,
    ]),
    models: Object.freeze(["immutable-request-v1"]),
    dataPolicy: Object.freeze({
      remote: false,
      retainedByProvider: false,
      usedForTraining: false,
    }),
  });
}

test("normalized provider requests are deeply frozen and detached from caller input", () => {
  const input = requestInput();
  const request = validateProviderCandidateRequest(input);
  const fingerprint = providerRequestSha256(request);

  for (const value of [
    request,
    request.style,
    request.style.mustHave,
    request.shot,
    request.target,
    request.background,
    request.references,
    request.selection,
    request.selection.allowedAdapterIds,
    request.metadata,
    request.metadata.governance,
    request.metadata.governance.locks,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }

  assert.throws(() => {
    request.candidateCount = 8;
  }, TypeError);
  assert.throws(() => {
    request.selection.allowFallback = true;
  }, TypeError);
  assert.throws(() => {
    request.style.mustHave.push("mutated after validation");
  }, TypeError);
  assert.throws(() => {
    request.metadata.governance.stage = "mutated";
  }, TypeError);
  assert.throws(() => {
    request.metadata.governance.locks.push("mutated");
  }, TypeError);

  input.style.mustHave[0] = "caller input changed later";
  input.metadata.governance.stage = "caller-mutated";
  input.metadata.governance.locks.push("caller-mutated");

  assert.deepEqual(request.style.mustHave, ["locked visual direction"]);
  assert.deepEqual(request.metadata.governance, {
    locks: ["prompt", "routing", "evidence", "execution"],
    stage: "validated",
  });
  assert.equal(providerRequestSha256(request), fingerprint);
});

test("custom registry and adapter cannot mutate the request between evidence and execution", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-provider-request-immutability-"),
  );
  try {
    const providerDescriptor = descriptor();
    let rankMutationsBlocked = 0;
    let executionMutationsBlocked = 0;

    const adapter = {
      descriptor: providerDescriptor,
      execute: async (resolved) => {
        assert.equal(Object.isFrozen(resolved.request), true);
        assert.equal(Object.isFrozen(resolved.request.style.mustHave), true);
        assert.equal(Object.isFrozen(resolved.request.metadata.governance), true);

        assert.throws(() => {
          resolved.request.creativeIntent = "adapter-mutated intent";
        }, TypeError);
        executionMutationsBlocked += 1;
        assert.throws(() => {
          resolved.request.metadata.governance.stage = "adapter-mutated";
        }, TypeError);
        executionMutationsBlocked += 1;

        assert.equal(resolved.request.candidateCount, 1);
        assert.equal(resolved.request.selection.allowFallback, false);
        assert.deepEqual(resolved.request.style.mustHave, [
          "locked visual direction",
        ]);
        assert.equal(
          resolved.request.metadata.governance.stage,
          "validated",
        );

        return {
          adapterId: providerDescriptor.id,
          model: providerDescriptor.models[0],
          outputs: [
            {
              bytes: Buffer.from("immutable-provider-candidate"),
              mediaType: "image/png",
            },
          ],
        };
      },
    };

    const registry = {
      list: () => [providerDescriptor],
      rank: (request) => {
        assert.equal(Object.isFrozen(request), true);
        const mutations = [
          () => {
            request.candidateCount = 8;
          },
          () => {
            request.selection.allowFallback = true;
          },
          () => {
            request.style.mustHave.push("registry-mutated style");
          },
          () => {
            request.metadata.governance.stage = "registry-mutated";
          },
        ];
        for (const mutate of mutations) {
          assert.throws(mutate, TypeError);
          rankMutationsBlocked += 1;
        }
        return [
          Object.freeze({
            adapter,
            decision: Object.freeze({
              adapterId: providerDescriptor.id,
              eligible: true,
              reasons: Object.freeze([
                "all declared request capabilities are supported",
              ]),
              rank: 1,
            }),
          }),
        ];
      },
    };

    const artifacts = new LocalArtifactStore({ root });
    await artifacts.root();
    const result = await executeProviderCandidateRequest(requestInput(), {
      registry,
      artifacts,
      signal: new AbortController().signal,
      now: () => new Date("2026-08-07T09:30:00.000Z"),
    });

    assert.equal(rankMutationsBlocked, 4);
    assert.equal(executionMutationsBlocked, 2);
    assert.equal(result.adapterId, providerDescriptor.id);
    assert.equal(result.candidateArtifacts.length, 1);
    assert.equal(
      result.routingInspection.firstEligibleAdapterId,
      providerDescriptor.id,
    );
    assert.equal(
      result.routingInspection.requestSha256,
      result.requestSha256,
    );

    const evidence = JSON.parse(
      (await artifacts.read(result.evidenceArtifact)).toString("utf8"),
    );
    assert.equal(evidence.request.candidateCount, 1);
    assert.equal(evidence.request.selection.allowFallback, false);
    assert.deepEqual(evidence.request.style.mustHave, [
      "locked visual direction",
    ]);
    assert.deepEqual(evidence.request.metadata.governance, {
      locks: ["prompt", "routing", "evidence", "execution"],
      stage: "validated",
    });
    assert.equal(evidence.requestSha256, result.requestSha256);
    assert.equal(
      evidence.routingInspection.requestSha256,
      result.requestSha256,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
