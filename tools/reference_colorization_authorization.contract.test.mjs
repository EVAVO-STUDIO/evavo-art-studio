import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedProvenance = [
  "camera-original",
  "first-party-archive",
  "known-colour-photo",
  "user-owned-original",
  "user-provided-original",
  "verified-archive",
];
const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("reference colourization authorization schema stays fail closed", async () => {
  const schema = JSON.parse(await read("../contracts/reference-colourization-authorization-v1.schema.json"));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.properties.reference_provenance.enum].sort(), expectedProvenance);
  for (const field of [
    "human_subject",
    "human_reference_match_confirmed",
    "real_reference_confirmed",
    "reference_guided_colorization_allowed",
    "visual_confirmation_required",
    "explicit_approval_required",
  ]) assert.equal(schema.properties[field].const, true, `${field} must remain required true`);
  for (const field of [
    "automatic_colorization_allowed",
    "invented_colour_allowed",
    "generative_repair_allowed",
    "synthetic_detail_allowed",
  ]) assert.equal(schema.properties[field].const, false, `${field} must remain forbidden`);
  assert.equal(schema.properties.contract.const, "evavo.reference-colourization-authorization.v1");
});

test("restoration intake trusted provenance stays aligned with authorization schema", async () => {
  const source = await read("./lib/existing_image_restoration_intake.mjs");
  const match = source.match(/TRUSTED_COLOUR_REFERENCE_PROVENANCE\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/u);
  assert.ok(match, "trusted colour provenance list missing");
  const values = [...match[1].matchAll(/['\"]([^'\"]+)['\"]/gu)].map((item) => item[1]).sort();
  assert.deepEqual(values, expectedProvenance);
  for (const token of [
    "missing_real_colour_reference",
    "real_photograph_reference_not_confirmed",
    "unverified_colour_reference",
    "subject_match_not_confirmed",
    "referenceIsRealPhotograph !== true",
    "subjectMatchConfirmedByHuman !== true",
    "allowGenerativeFallback: false",
    "automaticCreativeApprovalAllowed: false",
    "publicationAllowed: false",
    "qaMaySelectWinner: false",
  ]) assert.ok(source.includes(token), `missing restoration-intake safety token: ${token}`);
});
