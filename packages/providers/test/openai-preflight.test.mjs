import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenAIImageProviderAdapter,
  ProviderError,
  compileProviderCandidatePrompt,
  providerRequestSha256,
  validateProviderCandidateRequest,
} from "../dist/index.js";

const BASE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGPcUhHwnwEPYMInOXwUAACRrgKL7KFpWAAAAABJRU5ErkJggg==",
  "base64",
);
const MASK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVR4nGNkQID/DFgAEzZBZMCISyfRJgwGBQDE0wINX5/7vwAAAABJRU5ErkJggg==",
  "base64",
);
const WRONG_SIZE_MASK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAADElEQVR4nGNgoBwAAABEAAHX40j9AAAAAElFTkSuQmCC",
  "base64",
);
const NO_ALPHA_MASK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAADElEQVR4nGNgGB4AAADIAAGtQHYiAAAAAElFTkSuQmCC",
  "base64",
);
const OUTPUT =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==";

const IDS = {
  canonical: `artifact_${"a".repeat(64)}`,
  base: `artifact_${"b".repeat(64)}`,
  mask: `artifact_${"c".repeat(64)}`,
};

function request() {
  return validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "inpaint",
    assetKind: "sprite-frame",
    continuityPhase: "repair",
    assetId: "hero-idle",
    candidateFamilyId: "hero-idle-repair",
    frameId: "down-001",
    creativeIntent: "Repair only the declared edge defect.",
    style: {
      styleName: "Locked sprite repair",
      intent: "Preserve the approved identity and pixel treatment.",
      mustHave: ["same identity"],
      mustAvoid: ["redesign"],
    },
    shot: {
      subject: "The approved hero sprite.",
      include: ["complete silhouette"],
      exclude: ["background"],
      separateAssets: ["shadow"],
    },
    target: {
      width: 128,
      height: 128,
      transparency: "required",
      outputFormat: "png",
    },
    sourceCanvas: { width: 1024, height: 1024 },
    background: { strategy: "chroma-key", matteColour: "#00ff00" },
    quality: "high",
    candidateCount: 1,
    references: [
      { artifactId: IDS.canonical, role: "canonical-identity" },
      { artifactId: IDS.base, role: "base-image" },
      { artifactId: IDS.mask, role: "mask" },
    ],
  });
}

function reference(role, artifactId, fileName, bytes) {
  return {
    role,
    artifactId,
    strength: 1,
    required: true,
    bytes,
    artifact: {
      artifactId,
      mediaType: "image/png",
      fileName,
    },
  };
}

function resolved(maskBytes) {
  const normalized = request();
  const prompt = compileProviderCandidatePrompt(normalized);
  return {
    request: normalized,
    requestSha256: providerRequestSha256(normalized),
    compiledPrompt: prompt.text,
    compiledPromptSha256: prompt.sha256,
    references: [
      reference("canonical-identity", IDS.canonical, "canonical.png", BASE),
      reference("base-image", IDS.base, "base.png", BASE),
      reference("mask", IDS.mask, "mask.png", maskBytes),
    ],
  };
}

test("OpenAI inpaint records deterministic mask preflight before transport", async () => {
  let calls = 0;
  const adapter = new OpenAIImageProviderAdapter({
    apiKey: "test-key-abcdefghijklmnopqrstuvwxyz0123456789",
    baseUrl: "https://example.test/v1",
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [{ b64_json: OUTPUT }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const result = await adapter.execute(resolved(MASK), {
    signal: new AbortController().signal,
    requestedAt: new Date("2026-07-30T00:00:00Z"),
  });
  assert.equal(calls, 1);
  assert.equal(result.metadata.inpaintMaskPreflight.compatible, true);
  assert.equal(result.metadata.inpaintMaskPreflight.mask.editablePixels, 4);
  assert.equal(result.metadata.inpaintMaskPreflight.mask.preservedPixels, 60);
});

test("OpenAI inpaint rejects an alpha-less mask before any remote request", async () => {
  let calls = 0;
  const adapter = new OpenAIImageProviderAdapter({
    apiKey: "test-key-abcdefghijklmnopqrstuvwxyz0123456789",
    fetch: async () => {
      calls += 1;
      throw new Error("transport must not run");
    },
  });
  await assert.rejects(
    () =>
      adapter.execute(resolved(NO_ALPHA_MASK), {
        signal: new AbortController().signal,
        requestedAt: new Date("2026-07-30T00:00:00Z"),
      }),
    (error) =>
      error instanceof ProviderError &&
      error.code === "OPENAI_INPAINT_MASK_ALPHA_REQUIRED",
  );
  assert.equal(calls, 0);
});

test("OpenAI inpaint rejects mismatched mask dimensions before transport", async () => {
  let calls = 0;
  const adapter = new OpenAIImageProviderAdapter({
    apiKey: "test-key-abcdefghijklmnopqrstuvwxyz0123456789",
    fetch: async () => {
      calls += 1;
      throw new Error("transport must not run");
    },
  });
  await assert.rejects(
    () =>
      adapter.execute(resolved(WRONG_SIZE_MASK), {
        signal: new AbortController().signal,
        requestedAt: new Date("2026-07-30T00:00:00Z"),
      }),
    (error) =>
      error instanceof ProviderError &&
      error.code === "OPENAI_INPAINT_MASK_DIMENSIONS_MISMATCH",
  );
  assert.equal(calls, 0);
});
