import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";

import {
  FIXTURE_PROVIDER_DESCRIPTOR,
  FixtureImageProviderAdapter,
  OpenAIImageProviderAdapter,
  ProviderError,
  ProviderRegistry,
  compileProviderCandidatePrompt,
  executeProviderCandidateRequest,
  inspectProviderCandidateRouting,
  providerRequestSha256,
  providerRequiredCapabilities,
  validateProviderCandidateRequest,
} from "../dist/index.js";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==";
const PNG = Buffer.from(PNG_BASE64, "base64");
const OPAQUE_RGB_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAHdElNRQfqCA8RIyyCjRsWAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC",
  "base64",
);
const OPAQUE_RGBA_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAHdElNRQfqCA8SNB3UliHjAAAAMUlEQVRYw+3OMQEAMAzDsKz8cYbGCqOPTMB6bX8Om8s5AAAAAAAAAAAAAAAAAABAkiyUcwPxNoPvewAAAABJRU5ErkJggg==",
  "base64",
);
const TOKEN_ALPHA_CHECKERBOARD_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAHdElNRQfqCA8SORLxh0I/AAAB1UlEQVR42u3cUW3DMBRAUWcqg32XQ6EEz3jsazyGoxBCYBg6DHMqpcs95z95TnVlqbLkMUhbxhhj27bH7Avu9/uuBdxut13Pmz8/f13X5W3XdP49AcQJIE4AcQKIE0CcAOIEECeAOAHECSBOAHECiBNA3GWMfUeK5ePUM8y3A8QJIE4AcQKIE0CcAOIEECeAOAHECSBOAHECiBNAnADiBBB3GWPfmfLR59nm75tvB4gTQJwA4gQQJ4A4AcQJIO5y9AKe5fr1MfXcz+S898/voz/5KewAcQKIE0CcAOIEECeAOAHEneZ+gNn/83vX/SrfP8sOECeAOAHECSBOAHECiBNAnADiBBAngDgBxAkgTgBxAogTQNxp7ge4PvNX+cO6X+X7Z9kB4gQQJ4A4AcQJIE4AcQKIE0CcAOIEECeAOAHECSBOAHECiHM/wM51v8r3z7IDxAkgTgBxAogTQJwA4gQQJ4A4AcQJIE4AcQKIE0CcAOIEELeMMca2bY/ZFxx9nm3+/Px1XRc7QJwA4gQQJ4A4AcQJIE4AcQKIE0CcAOIEECeAOAHECSBOAHGnuR/A/Dl2gDgBxAkgTgBxAogTQJwA4gQQJ4A4AcQJIE4AcQKIEwCU/QL6IG59mtGSnAAAAABJRU5ErkJggg==",
  "base64",
);
const TOKEN_ALPHA_MATTE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAHdElNRQfqCA8SOib7HuVJAAABCUlEQVR42u3dQRHCQBBFwR8KHyjAE9LiCQUoCTL6kNcGZrZe7Xm2UMe27dqlF7mlY8dD73B3BcAKgBUAKwBWAKwAWAGwAmAFwAqAFQArAFYArABYAbACYAXAnnL47/PW79+2vc4vm90PwAqAFQArAFYArABYAbACYAXACoAVACsAVgCsAFgBsAJgBcAKgBUAKwBWAKwAWAGwAmAFwAqAFQArAFYArABYAbACYAXACoAVACsAVgCsAFgBsAJgBcAKgBUAKwBWAKwAWAGwAmAFwAqAFQArAFYArABYAbACYAXACoAVACsA1j1hqXvCXgGwAmAFwAqAFQArAFYArABYAbACYAXACpB7+wPZMwe9cL+y5AAAAABJRU5ErkJggg==",
  "base64",
);

function request(overrides = {}) {
  return {
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "sprite-frame",
    continuityPhase: "key-pose",
    assetId: "hero-idle",
    candidateFamilyId: "hero-idle-down",
    frameId: "down-001",
    creativeIntent:
      "Author the first readable idle key pose with stable ground contact and restrained breathing.",
    negativeIntent:
      "No extra props, no scenery, no costume redesign and no cropped silhouette.",
    style: {
      styleName: "Authentic 1990s adventure sprite",
      intent: "Hand-authored pixel clusters and a deliberate period palette.",
      mustHave: ["stable identity", "clear silhouette", "authored pixel clusters"],
      mustAvoid: ["generic AI rendering", "modern gloss", "unrelated detail"],
      identityLocks: ["same face", "same coat", "same handedness"],
      palette: ["locked indexed palette"],
      lineTreatment: ["consistent one-pixel contour hierarchy"],
      cameraRules: ["fixed side-stage projection"],
    },
    shot: {
      subject: "The approved hero character only.",
      action: "Neutral idle contact pose.",
      direction: "Down-facing three-quarter view.",
      include: ["complete silhouette", "declared coat and boots"],
      exclude: ["background", "UI", "unrelated particles"],
      separateAssets: ["cast shadow", "held weapon", "action effect"],
      framing: ["minimum eight-pixel clear margin", "feet aligned to baseline"],
    },
    target: {
      width: 128,
      height: 128,
      transparency: "required",
      outputFormat: "png",
    },
    background: { strategy: "chroma-key", matteColour: "#00ff00" },
    quality: "high",
    candidateCount: 2,
    selection: { allowFallback: false },
    references: [],
    ...overrides,
  };
}

async function artifactFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provider-"));
  const store = new LocalArtifactStore({ root });
  const put = (fileName, role) =>
    store.put(PNG, {
      mediaType: "image/png",
      storageClass: "source",
      fileName,
      labels: { role },
    });
  return {
    root,
    store,
    canonical: await put("canonical.png", "canonical-identity"),
    previous: await put("previous.png", "previous-key-pose"),
    next: await put("next.png", "next-key-pose"),
    base: await put("base.png", "base-image"),
    mask: await put("mask.png", "mask"),
    direction: await put("direction.png", "direction-master"),
    pose: await put("pose.png", "pose-control"),
    edge: await put("edge.png", "edge-control"),
    depth: await put("depth.png", "depth-control"),
    palette: await put("palette.png", "palette-reference"),
    line: await put("line.png", "line-reference"),
    material: await put("material.png", "material-reference"),
    layer: await put("layer.png", "layer-context"),
  };
}

function ref(artifact, role, extra = {}) {
  return { artifactId: artifact.artifactId, role, ...extra };
}

function recordingArtifactStore(store) {
  const puts = [];
  return {
    puts,
    store: {
      put: async (content, descriptor) => {
        puts.push(descriptor);
        return store.put(content, descriptor);
      },
      get: (artifactId) => store.get(artifactId),
      read: (artifactId) => store.read(artifactId),
      verify: (artifactId) => store.verify(artifactId),
      updateReference: (namespace, name, artifactId, options) =>
        store.updateReference(namespace, name, artifactId, options),
      resolveReference: (namespace, name) =>
        store.resolveReference(namespace, name),
      listReferences: (namespace) => store.listReferences(namespace),
    },
  };
}

test("continuity-locked sprites require canonical identity and in-between neighbours", async () => {
  assert.throws(
    () => validateProviderCandidateRequest(request()),
    (error) =>
      error instanceof ProviderError &&
      error.code === "PROVIDER_CANDIDATE_REQUEST_INVALID" &&
      /canonical-identity/.test(error.message),
  );
  const fixture = await artifactFixture();
  assert.throws(
    () =>
      validateProviderCandidateRequest(
        request({
          references: [
            ref(fixture.canonical, "canonical-identity", { required: false }),
          ],
        }),
      ),
    (error) =>
      error instanceof ProviderError &&
      /canonical-identity as a required reference/.test(error.message),
  );
  assert.throws(
    () =>
      validateProviderCandidateRequest(
        request({
          continuityPhase: "in-between",
          references: [ref(fixture.canonical, "canonical-identity")],
        }),
      ),
    (error) =>
      error instanceof ProviderError &&
      /previous-key-pose and next-key-pose/.test(error.message),
  );
  assert.throws(
    () =>
      validateProviderCandidateRequest(
        request({
          continuityPhase: "in-between",
          references: [
            ref(fixture.canonical, "canonical-identity"),
            ref(fixture.previous, "previous-key-pose", { required: false }),
            ref(fixture.next, "next-key-pose"),
          ],
        }),
      ),
    (error) =>
      error instanceof ProviderError &&
      /previous-key-pose and next-key-pose as required references/.test(error.message),
  );
  const valid = validateProviderCandidateRequest(
    request({
      continuityPhase: "in-between",
      references: [
        ref(fixture.next, "next-key-pose"),
        ref(fixture.canonical, "canonical-identity"),
        ref(fixture.previous, "previous-key-pose"),
      ],
    }),
  );
  assert.deepEqual(
    valid.references.map((entry) => entry.role),
    ["canonical-identity", "previous-key-pose", "next-key-pose"],
  );
});

test("inpaint requests require one base image and one mask", async () => {
  const fixture = await artifactFixture();
  const base = request({
    operation: "inpaint",
    continuityPhase: "repair",
    references: [
      ref(fixture.canonical, "canonical-identity"),
      ref(fixture.base, "base-image"),
    ],
  });
  assert.throws(
    () => validateProviderCandidateRequest(base),
    (error) => error instanceof ProviderError && /exactly one required mask/.test(error.message),
  );
  assert.throws(
    () =>
      validateProviderCandidateRequest({
        ...base,
        references: [
          ...base.references,
          ref(fixture.mask, "mask", { required: false }),
        ],
      }),
    (error) =>
      error instanceof ProviderError &&
      /exactly one required mask/.test(error.message),
  );
  const valid = validateProviderCandidateRequest({
    ...base,
    references: [...base.references, ref(fixture.mask, "mask")],
  });
  assert.equal(valid.operation, "inpaint");
  assert.equal(valid.references.at(-1).role, "mask");
});

test("compiled prompt preserves shot and layer boundaries", async () => {
  const fixture = await artifactFixture();
  const normalized = validateProviderCandidateRequest(
    request({ references: [ref(fixture.canonical, "canonical-identity")] }),
  );
  const compiled = compileProviderCandidatePrompt(normalized);
  for (const token of [
    "Generate only this bounded frame or layer",
    "canonical identity master",
    "KEEP AS SEPARATE ASSETS OR LAYERS",
    "cast shadow",
    "held weapon",
    "exact solid #00ff00 chroma matte",
    "transparency-preview checkerboard/grid is forbidden",
    "never draw grey/white transparency tiles",
    "intermediate candidate artwork only",
    "No crop, fake transparency, checkerboard",
  ]) {
    assert.ok(compiled.text.includes(token), `missing prompt contract: ${token}`);
  }
  assert.equal(compiled.sha256.length, 64);
  assert.equal(providerRequestSha256(normalized).length, 64);
});

test("provider requests reject unsafe low-chroma extraction mattes", () => {
  for (const matteColour of ["#000000", "#ffffff", "#808080"]) {
    assert.throws(
      () =>
        validateProviderCandidateRequest(
          request({
            background: { strategy: "chroma-key", matteColour },
          }),
        ),
      (error) =>
        error instanceof ProviderError &&
        /high-chroma matteColour/u.test(error.message),
    );
  }
});

test("governed Book candidate sets demand genuinely distinct non-template alternatives", () => {
  const normalized = validateProviderCandidateRequest(
    request({
      assetKind: "illustration",
      continuityPhase: "independent",
      target: {
        width: 1600,
        height: 900,
        transparency: "opaque",
        outputFormat: "png",
      },
      background: { strategy: "opaque-source" },
      candidateCount: 4,
      references: [],
      metadata: {
        candidateSetId: "candidate-set-1234567890abcdef",
        candidateCount: 4,
        completePairwiseComparisonRequired: true,
        independentSetReviewRequired: true,
        generatedTextProhibited: true,
        automaticSelectionAllowed: false,
        publicationPerformed: false,
      },
    }),
  );
  const compiled = compileProviderCandidatePrompt(normalized);
  for (const token of [
    "BOOK CANDIDATE-SET DIVERSITY CONTRACT",
    "Return exactly 4 separate candidate files",
    "genuinely different visual solution",
    "palette swaps",
    "same template with cosmetic changes",
    "Each returned file must contain one complete candidate only",
  ]) {
    assert.ok(compiled.text.includes(token), `missing diversity contract: ${token}`);
  }
});


test("registry binds reference semantics to explicit adapter capabilities and fails closed on structural controls", async () => {
  const fixture = await artifactFixture();
  const openai = new OpenAIImageProviderAdapter({
    apiKey: "test-key-abcdefghijklmnopqrstuvwxyz0123456789",
    fetch: async () => {
      throw new Error("not called");
    },
  });
  const semantic = validateProviderCandidateRequest(
    request({
      continuityPhase: "in-between",
      references: [
        ref(fixture.canonical, "canonical-identity"),
        ref(fixture.direction, "direction-master"),
        ref(fixture.previous, "previous-key-pose"),
        ref(fixture.next, "next-key-pose"),
        ref(fixture.palette, "palette-reference"),
        ref(fixture.line, "line-reference"),
        ref(fixture.material, "material-reference"),
        ref(fixture.layer, "layer-context"),
      ],
    }),
  );
  const semanticCapabilities = providerRequiredCapabilities(semantic);
  for (const capability of [
    "identity-reference",
    "direction-reference",
    "temporal-reference",
    "palette-reference",
    "line-reference",
    "material-reference",
    "layer-context-reference",
  ]) {
    assert.ok(
      semanticCapabilities.includes(capability),
      `missing semantic provider capability ${capability}`,
    );
  }
  assert.equal(new ProviderRegistry([openai]).rank(semantic)[0].decision.eligible, true);

  const structural = validateProviderCandidateRequest(
    request({
      references: [
        ref(fixture.canonical, "canonical-identity"),
        ref(fixture.pose, "pose-control"),
        ref(fixture.edge, "edge-control"),
        ref(fixture.depth, "depth-control"),
      ],
    }),
  );
  assert.deepEqual(
    providerRequiredCapabilities(structural).filter((entry) => entry.endsWith("control")),
    ["depth-control", "edge-control", "pose-control"],
  );
  const openaiDecision = new ProviderRegistry([openai]).rank(structural)[0].decision;
  assert.equal(openaiDecision.eligible, false);
  for (const capability of ["pose-control", "edge-control", "depth-control"]) {
    assert.ok(
      openaiDecision.reasons.some((entry) => entry.includes(`missing capability ${capability}`)),
      `OpenAI adapter must not claim unsupported structural control ${capability}`,
    );
  }
  assert.equal(
    new ProviderRegistry([new FixtureImageProviderAdapter()]).rank(structural)[0].decision.eligible,
    true,
  );
  const blockedRouting = inspectProviderCandidateRouting(
    structural,
    new ProviderRegistry([openai]),
  );
  assert.equal(blockedRouting.outcome, "blocked");
  assert.deepEqual(blockedRouting.eligibleAdapterIds, []);
  assert.equal(blockedRouting.firstEligibleAdapterId, undefined);
  assert.equal(blockedRouting.providerCallPerformedByInspection, false);
  assert.equal(blockedRouting.requestSha256, providerRequestSha256(structural));
  assert.equal(blockedRouting.adapters.length, 1);
  assert.equal(blockedRouting.adapters[0].decision.rank, 1);
  assert.ok(
    blockedRouting.adapters[0].decision.reasons.some((reason) =>
      reason.includes("missing capability pose-control"),
    ),
  );
  assert.deepEqual(
    blockedRouting.requiredCapabilities,
    providerRequiredCapabilities(structural),
  );

  const mixedRouting = inspectProviderCandidateRouting(
    structural,
    new ProviderRegistry([openai, new FixtureImageProviderAdapter()]),
  );
  assert.equal(mixedRouting.outcome, "eligible");
  assert.equal(mixedRouting.firstEligibleAdapterId, "fixture-image");
  assert.deepEqual(mixedRouting.eligibleAdapterIds, ["fixture-image"]);
  const openAIRouting = mixedRouting.adapters.find(
    (entry) => entry.descriptor.id === "openai-gpt-image",
  );
  assert.ok(openAIRouting);
  assert.equal(openAIRouting.decision.eligible, false);
  assert.equal(openAIRouting.decision.rank, 2);

  const optionalPose = validateProviderCandidateRequest(
    request({
      references: [
        ref(fixture.canonical, "canonical-identity"),
        ref(fixture.pose, "pose-control", { required: false }),
      ],
    }),
  );
  assert.equal(
    providerRequiredCapabilities(optionalPose).includes("pose-control"),
    false,
  );
  assert.equal(new ProviderRegistry([openai]).rank(optionalPose)[0].decision.eligible, true);
});

test("provider reference required flag and adapter capability vocabulary fail closed", async () => {
  const fixture = await artifactFixture();
  assert.throws(
    () =>
      validateProviderCandidateRequest(
        request({
          references: [
            ref(fixture.canonical, "canonical-identity"),
            ref(fixture.pose, "pose-control", { required: "false" }),
          ],
        }),
      ),
    (error) =>
      error instanceof ProviderError &&
      error.code === "PROVIDER_CANDIDATE_REQUEST_INVALID" &&
      /references\[1\]\.required must be a boolean/.test(error.message),
  );

  class UnknownCapabilityAdapter extends FixtureImageProviderAdapter {
    descriptor = Object.freeze({
      ...FIXTURE_PROVIDER_DESCRIPTOR,
      id: "unknown-capability-provider",
      capabilities: Object.freeze([
        ...FIXTURE_PROVIDER_DESCRIPTOR.capabilities,
        "unregistered-structural-control",
      ]),
    });
  }
  assert.throws(
    () => new ProviderRegistry([new UnknownCapabilityAdapter()]),
    (error) =>
      error instanceof ProviderError &&
      error.code === "PROVIDER_ADAPTER_INVALID" &&
      /unknown capability unregistered-structural-control/.test(error.message),
  );
});

test("registry rejects native-alpha work for GPT Image 2 but accepts chroma-key work", async () => {
  const fixture = await artifactFixture();
  const openai = new OpenAIImageProviderAdapter({
    apiKey: "test-key-abcdefghijklmnopqrstuvwxyz0123456789",
    fetch: async () => {
      throw new Error("not called");
    },
  });
  const registry = new ProviderRegistry([openai]);
  const chroma = validateProviderCandidateRequest(
    request({ references: [ref(fixture.canonical, "canonical-identity")] }),
  );
  assert.equal(registry.rank(chroma)[0].decision.eligible, true);
  const alpha = validateProviderCandidateRequest(
    request({
      references: [ref(fixture.canonical, "canonical-identity")],
      background: { strategy: "native-alpha" },
    }),
  );
  const alphaDecision = registry.rank(alpha)[0].decision;
  assert.equal(alphaDecision.eligible, false);
  assert.ok(alphaDecision.reasons.some((entry) => entry.includes("native-alpha")));
});

test("provider execution rejects impossible routing before reading immutable artifacts", async () => {
  const fixture = await artifactFixture();
  const openai = new OpenAIImageProviderAdapter({
    apiKey: "test-key-abcdefghijklmnopqrstuvwxyz0123456789",
    fetch: async () => {
      throw new Error("provider transport must not run");
    },
  });
  const structural = validateProviderCandidateRequest(
    request({
      references: [
        ref(fixture.canonical, "canonical-identity"),
        ref(fixture.pose, "pose-control"),
      ],
    }),
  );
  let artifactReads = 0;
  await assert.rejects(
    () =>
      executeProviderCandidateRequest(structural, {
        registry: new ProviderRegistry([openai]),
        artifacts: {
          get: async () => {
            artifactReads += 1;
            throw new Error("artifact access must not run");
          },
        },
        signal: new AbortController().signal,
      }),
    (error) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_ADAPTER_UNAVAILABLE");
      assert.equal(error.classification, "incompatible");
      assert.equal(error.details.routingInspection.outcome, "blocked");
      assert.deepEqual(error.details.routingInspection.eligibleAdapterIds, []);
      assert.deepEqual(
        error.details.decisions,
        error.details.routingInspection.adapters.map((entry) => entry.decision),
      );
      return true;
    },
  );
  assert.equal(artifactReads, 0);
});

test("fixture orchestration stores unapproved candidates and evidence with complete lineage", async () => {
  const fixture = await artifactFixture();
  const result = await executeProviderCandidateRequest(
    request({
      references: [ref(fixture.canonical, "canonical-identity")],
      background: { strategy: "native-alpha" },
      selection: { preferredAdapterId: "fixture-image", allowFallback: false },
    }),
    {
      registry: new ProviderRegistry([new FixtureImageProviderAdapter()]),
      artifacts: fixture.store,
      signal: new AbortController().signal,
    },
  );
  assert.equal(result.candidateArtifacts.length, 2);
  assert.equal(result.requiresAlphaExtraction, false);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.routingInspection.outcome, "eligible");
  assert.equal(result.routingInspection.firstEligibleAdapterId, "fixture-image");
  assert.ok(
    result.routingInspection.requiredCapabilities.includes("identity-reference"),
  );
  const candidate = await fixture.store.get(result.candidateArtifacts[0]);
  assert.equal(candidate.storageClass, "intermediate");
  assert.equal(candidate.labels.approvalState, "unapproved");
  assert.equal(candidate.labels.artifactRole, "provider-candidate");
  assert.deepEqual(candidate.sourceArtifacts, [fixture.canonical.artifactId]);
  const evidence = await fixture.store.get(result.evidenceArtifact);
  assert.equal(evidence.storageClass, "evidence");
  const evidenceBody = JSON.parse(
    (await fixture.store.read(result.evidenceArtifact)).toString("utf8"),
  );
  assert.equal(evidenceBody.outcome, "candidate-produced");
  assert.deepEqual(evidenceBody.candidateArtifacts, result.candidateArtifacts);
  assert.equal(evidenceBody.resolvedReferences[0].role, "canonical-identity");
  assert.deepEqual(evidenceBody.routingInspection, result.routingInspection);
  assert.equal(evidence.metadata.routingOutcome, "eligible");
  assert.equal(evidence.metadata.eligibleAdapterCount, 1);
});

test("native-alpha orchestration rejects opaque RGB before candidate storage or preview", async () => {
  const fixture = await artifactFixture();
  class OpaqueNativeAlphaAdapter extends FixtureImageProviderAdapter {
    descriptor = Object.freeze({
      ...FIXTURE_PROVIDER_DESCRIPTOR,
      id: "opaque-native-alpha-provider",
      priority: 1000,
    });

    async execute() {
      return {
        adapterId: this.descriptor.id,
        model: this.descriptor.models[0],
        outputs: Object.freeze([
          Object.freeze({ mediaType: "image/png", bytes: OPAQUE_RGB_PNG }),
          Object.freeze({ mediaType: "image/png", bytes: OPAQUE_RGB_PNG }),
        ]),
      };
    }
  }
  await assert.rejects(
    () =>
      executeProviderCandidateRequest(
        request({
          requestId: "reject-painted-transparency",
          references: [ref(fixture.canonical, "canonical-identity")],
          background: { strategy: "native-alpha" },
          selection: {
            preferredAdapterId: "opaque-native-alpha-provider",
            allowFallback: false,
          },
        }),
        {
          registry: new ProviderRegistry([new OpaqueNativeAlphaAdapter()]),
          artifacts: fixture.store,
          signal: new AbortController().signal,
        },
      ),
    (error) =>
      error instanceof ProviderError &&
      error.code === "PROVIDER_NATIVE_ALPHA_MISSING" &&
      error.classification === "incompatible" &&
      /never stored or previewed/u.test(error.message),
  );
});

for (const [name, bytes, expectedFailureToken] of [
  [
    "an RGBA container whose alpha plane is fully opaque",
    OPAQUE_RGBA_PNG,
    "BACKGROUND_RECOVERY_UNRECOGNIZED",
  ],
  [
    "a painted checkerboard hidden behind a token transparent rim",
    TOKEN_ALPHA_CHECKERBOARD_PNG,
    "BACKGROUND_RECOVERY_CHECKERBOARD_FORBIDDEN",
  ],
  [
    "a painted solid matte hidden behind a token transparent rim",
    TOKEN_ALPHA_MATTE_PNG,
    "inferred-high-chroma-key",
  ],
]) {
  test(`native-alpha orchestration rejects ${name} before candidate storage or preview`, async () => {
    const fixture = await artifactFixture();
    const recording = recordingArtifactStore(fixture.store);
    class FakeNativeAlphaAdapter extends FixtureImageProviderAdapter {
      descriptor = Object.freeze({
        ...FIXTURE_PROVIDER_DESCRIPTOR,
        id: "fake-native-alpha-provider",
        priority: 1000,
      });

      async execute() {
        return {
          adapterId: this.descriptor.id,
          model: this.descriptor.models[0],
          outputs: Object.freeze([
            Object.freeze({ mediaType: "image/png", bytes }),
            Object.freeze({ mediaType: "image/png", bytes }),
          ]),
        };
      }
    }

    await assert.rejects(
      () =>
        executeProviderCandidateRequest(
          request({
            requestId: "reject-fake-native-alpha",
            references: [ref(fixture.canonical, "canonical-identity")],
            background: { strategy: "native-alpha" },
            selection: {
              preferredAdapterId: "fake-native-alpha-provider",
              allowFallback: false,
            },
          }),
          {
            registry: new ProviderRegistry([new FakeNativeAlphaAdapter()]),
            artifacts: recording.store,
            signal: new AbortController().signal,
          },
        ),
      (error) =>
        error instanceof ProviderError &&
        error.code === "PROVIDER_NATIVE_ALPHA_INVALID" &&
        error.classification === "incompatible" &&
        error.message.includes(expectedFailureToken) &&
        /never .*stored/u.test(error.message),
    );
    assert.equal(
      recording.puts.filter(
        (descriptor) => descriptor.labels?.artifactRole === "provider-candidate",
      ).length,
      0,
      "invalid provider bytes must not create candidate artifacts",
    );
    assert.equal(
      recording.puts.filter(
        (descriptor) =>
          descriptor.labels?.artifactRole === "provider-candidate-evidence",
      ).length,
      1,
      "the rejection must still leave auditable failure evidence",
    );
  });
}

test("native-alpha decoded rejection falls back without storing the invalid outputs", async () => {
  const fixture = await artifactFixture();
  const recording = recordingArtifactStore(fixture.store);
  class FakeNativeAlphaAdapter extends FixtureImageProviderAdapter {
    descriptor = Object.freeze({
      ...FIXTURE_PROVIDER_DESCRIPTOR,
      id: "fallback-fake-native-alpha-provider",
      priority: 1000,
    });

    async execute() {
      return {
        adapterId: this.descriptor.id,
        model: this.descriptor.models[0],
        outputs: Object.freeze([
          Object.freeze({ mediaType: "image/png", bytes: OPAQUE_RGBA_PNG }),
          Object.freeze({ mediaType: "image/png", bytes: OPAQUE_RGBA_PNG }),
        ]),
      };
    }
  }

  const result = await executeProviderCandidateRequest(
    request({
      requestId: "fallback-after-fake-native-alpha",
      references: [ref(fixture.canonical, "canonical-identity")],
      background: { strategy: "native-alpha" },
      selection: {
        preferredAdapterId: "fallback-fake-native-alpha-provider",
        allowFallback: true,
      },
    }),
    {
      registry: new ProviderRegistry([
        new FakeNativeAlphaAdapter(),
        new FixtureImageProviderAdapter(),
      ]),
      artifacts: recording.store,
      signal: new AbortController().signal,
    },
  );

  assert.equal(result.adapterId, FIXTURE_PROVIDER_DESCRIPTOR.id);
  assert.deepEqual(
    result.attempts.map((attempt) => [attempt.outcome, attempt.code ?? null]),
    [
      ["failed", "PROVIDER_NATIVE_ALPHA_INVALID"],
      ["succeeded", null],
    ],
  );
  const candidatePuts = recording.puts.filter(
    (descriptor) => descriptor.labels?.artifactRole === "provider-candidate",
  );
  assert.equal(candidatePuts.length, 2);
  assert.ok(
    candidatePuts.every(
      (descriptor) =>
        descriptor.labels?.providerAdapter === FIXTURE_PROVIDER_DESCRIPTOR.id,
    ),
    "only the verified fallback bytes may become candidate artifacts",
  );
});

test("fallback is bounded to explicitly allowed transient failures", async () => {
  const fixture = await artifactFixture();
  class FailingAdapter extends FixtureImageProviderAdapter {
    descriptor = Object.freeze({
      ...FIXTURE_PROVIDER_DESCRIPTOR,
      id: "temporary-provider",
      priority: 1000,
    });

    async execute() {
      throw new ProviderError(
        "TEMPORARY_PROVIDER_BUSY",
        "Temporary provider busy.",
        "transient",
      );
    }
  }
  const registry = new ProviderRegistry([
    new FailingAdapter(),
    new FixtureImageProviderAdapter(),
  ]);
  const fallback = await executeProviderCandidateRequest(
    request({
      references: [ref(fixture.canonical, "canonical-identity")],
      background: { strategy: "native-alpha" },
      selection: { allowFallback: true },
    }),
    {
      registry,
      artifacts: fixture.store,
      signal: new AbortController().signal,
    },
  );
  assert.equal(fallback.adapterId, "fixture-image");
  assert.deepEqual(
    fallback.attempts.map((entry) => entry.outcome),
    ["failed", "succeeded"],
  );

  await assert.rejects(
    () =>
      executeProviderCandidateRequest(
        request({
          requestId: "no-fallback",
          references: [ref(fixture.canonical, "canonical-identity")],
          background: { strategy: "native-alpha" },
          selection: {
            preferredAdapterId: "temporary-provider",
            allowFallback: false,
          },
        }),
        {
          registry,
          artifacts: fixture.store,
          signal: new AbortController().signal,
        },
      ),
    (error) =>
      error instanceof ProviderError && error.code === "TEMPORARY_PROVIDER_BUSY",
  );
});

test("OpenAI generation uses bounded JSON with candidate count and flexible source size", async () => {
  let captured;
  const adapter = new OpenAIImageProviderAdapter({
    apiKey: "test-key-abcdefghijklmnopqrstuvwxyz0123456789",
    baseUrl: "https://example.test/v1",
    fetch: async (url, init) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({
          created: 123,
          data: [
            { b64_json: PNG_BASE64, revised_prompt: "first" },
            { b64_json: PNG_BASE64, revised_prompt: "second" },
          ],
          usage: { total_tokens: 100 },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req_fixture",
          },
        },
      );
    },
  });
  const normalized = validateProviderCandidateRequest(
    request({
      assetKind: "illustration",
      continuityPhase: "independent",
      target: {
        width: 1600,
        height: 900,
        transparency: "opaque",
        outputFormat: "png",
      },
      background: { strategy: "opaque-source" },
      references: [],
    }),
  );
  const compiled = compileProviderCandidatePrompt(normalized);
  const result = await adapter.execute(
    {
      request: normalized,
      requestSha256: providerRequestSha256(normalized),
      compiledPrompt: compiled.text,
      compiledPromptSha256: compiled.sha256,
      references: [],
    },
    {
      signal: new AbortController().signal,
      requestedAt: new Date("2026-07-29T00:00:00Z"),
    },
  );
  assert.equal(captured.url, "https://example.test/v1/images/generations");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, "gpt-image-2");
  assert.equal(body.n, 2);
  assert.equal(body.quality, "high");
  assert.equal(body.background, "opaque");
  const [width, height] = body.size.split("x").map(Number);
  assert.equal(width % 16, 0);
  assert.equal(height % 16, 0);
  assert.ok(width * height >= 655360);
  assert.equal(result.outputs.length, 2);
  assert.equal(result.externalId, "req_fixture");
});

test("OpenAI inpaint puts the editable base first, preserves reference order and sends one mask", async () => {
  const fixture = await artifactFixture();
  let captured;
  const adapter = new OpenAIImageProviderAdapter({
    apiKey: "test-key-abcdefghijklmnopqrstuvwxyz0123456789",
    baseUrl: "https://example.test/v1",
    fetch: async (url, init) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({
          data: [
            { b64_json: PNG_BASE64 },
            { b64_json: PNG_BASE64 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const normalized = validateProviderCandidateRequest(
    request({
      operation: "inpaint",
      continuityPhase: "repair",
      references: [
        ref(fixture.mask, "mask"),
        ref(fixture.canonical, "canonical-identity"),
        ref(fixture.base, "base-image"),
      ],
    }),
  );
  const compiled = compileProviderCandidatePrompt(normalized);
  const resolved = [];
  for (const reference of normalized.references) {
    resolved.push({
      ...reference,
      artifact: await fixture.store.get(reference.artifactId),
      bytes: await fixture.store.read(reference.artifactId),
    });
  }
  await adapter.execute(
    {
      request: normalized,
      requestSha256: providerRequestSha256(normalized),
      compiledPrompt: compiled.text,
      compiledPromptSha256: compiled.sha256,
      references: resolved,
    },
    {
      signal: new AbortController().signal,
      requestedAt: new Date("2026-07-29T00:00:00Z"),
    },
  );
  assert.equal(captured.url, "https://example.test/v1/images/edits");
  assert.ok(captured.init.body instanceof FormData);
  const images = captured.init.body.getAll("image[]");
  assert.equal(images.length, 2);
  assert.equal(images[0].name, "base.png");
  assert.equal(images[1].name, "canonical.png");
  const mask = captured.init.body.get("mask");
  assert.ok(mask instanceof Blob);
  assert.equal(mask.name, "mask.png");
  assert.equal(captured.init.body.get("input_fidelity"), null);
  assert.equal(captured.init.body.get("model"), "gpt-image-2");
  assert.equal(captured.init.body.get("n"), "2");
});
