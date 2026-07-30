import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sprite-family OpenAPI extension documents compile-only layered verification", async () => {
  const source = await readFile(
    new URL("../openapi.sprite-family.yaml", import.meta.url),
    "utf8",
  );
  for (const token of [
    "openapi: 3.1.0",
    "/v1/sprite-family-protocol:",
    "/v1/sprite-families/validate:",
    "/v1/sprite-families/compile:",
    "SpriteLayerRole",
    "SpriteLayerSourcePolicy",
    "identity-core",
    "linked-cel",
    "static-family",
    "engine-sidecar",
    "guide-only",
    "SpriteFamilyManifest",
    "NormalizedSpriteFamilyManifest",
    "CompiledSpriteFamilyJob",
    "sprite.family.verify",
    "media.layer-compose",
    "selection.compare",
    "evidence.bundle",
    "durable-worker-only",
  ]) {
    assert.ok(source.includes(token), `missing sprite-family OpenAPI token: ${token}`);
  }
  for (const forbidden of [
    "OPENAI_API_KEY",
    "EVAVO_ART_WRITE_TOKEN",
    "verifySpriteFamily(",
    "executeProvider",
    "promoteSelectedCandidate",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `sprite-family OpenAPI exposes an execution or secret shortcut: ${forbidden}`,
    );
  }
});
