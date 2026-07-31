import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("art-direction OpenAPI remains compile-only and covers governed presets", async () => {
  const source = await readFile(
    new URL("../openapi.art-direction.yaml", import.meta.url),
    "utf8",
  );
  for (const token of [
    "/v1/art-direction-protocol:",
    "/v1/art-direction-presets:",
    "/v1/art-direction-output-profiles:",
    "/v1/art-directions/validate:",
    "/v1/art-directions/compile:",
    "isometric-rpg-1997",
    "prerendered-2.5d-1996",
    "engraved-monochrome-1871",
    "godot-4.6.2-isometric-character",
    "godot-4.6.2-particle-flipbook",
    "kind: { const: art.direction.compile }",
    "art-direction.compile",
    "style.preset.resolve",
    "output-profile.compile",
    "deterministic-compile-only",
  ]) {
    assert.ok(source.includes(token), `missing art-direction OpenAPI invariant: ${token}`);
  }
  for (const forbidden of [
    "OPENAI_API_KEY",
    "EVAVO_ART_WRITE_TOKEN",
    "promoteSelectedCandidate",
    "updateReference(",
    "child_process",
    "shell: true",
    "provider.execute",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `art-direction OpenAPI contains execution shortcut: ${forbidden}`,
    );
  }
});
