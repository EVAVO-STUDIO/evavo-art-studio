#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const SOURCE_SHA256 = "sha256:c8f7b0830ad2c875b683b98f0466a303cdf60731cff797bdf0a74cd18ef62483";
const payloadNames = Object.freeze([
  "animation_character_family_v1_internal.source.part001.b64",
  "animation_character_family_v1_internal.source.part002.b64",
  "animation_character_family_v1_internal.source.part003.b64",
  "animation_character_family_v1_internal.source.part004.b64",
  "animation_character_family_v1_internal.source.part005.b64",
]);
const encoded = payloadNames
  .map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8").trim())
  .join("");
const sourceBytes = gunzipSync(Buffer.from(encoded, "base64"));
const actualSha256 = `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`;
if (actualSha256 !== SOURCE_SHA256) {
  throw new Error("ANIMATION_CHARACTER_FAMILY_EMBEDDED_SOURCE_DIGEST_MISMATCH");
}
const implementation = await import(
  `data:text/javascript;base64,${sourceBytes.toString("base64")}`
);

export const ANIMATION_CHARACTER_FAMILY_PROTOCOL_VERSION = implementation.ANIMATION_CHARACTER_FAMILY_PROTOCOL_VERSION;
export const ANIMATION_CHARACTER_FAMILY_REQUEST_SCHEMA = implementation.ANIMATION_CHARACTER_FAMILY_REQUEST_SCHEMA;
export const ANIMATION_CHARACTER_FAMILY_PLAN_SCHEMA = implementation.ANIMATION_CHARACTER_FAMILY_PLAN_SCHEMA;
export const ANIMATION_CHARACTER_FAMILY_CLIP_EVIDENCE_SCHEMA = implementation.ANIMATION_CHARACTER_FAMILY_CLIP_EVIDENCE_SCHEMA;
export const ANIMATION_CHARACTER_FAMILY_STATUS_SCHEMA = implementation.ANIMATION_CHARACTER_FAMILY_STATUS_SCHEMA;
export const ANIMATION_CHARACTER_FAMILY_REVIEW_INPUT_SCHEMA = implementation.ANIMATION_CHARACTER_FAMILY_REVIEW_INPUT_SCHEMA;
export const ANIMATION_CHARACTER_FAMILY_REVIEW_ASSESSMENT_SCHEMA = implementation.ANIMATION_CHARACTER_FAMILY_REVIEW_ASSESSMENT_SCHEMA;
export const ANIMATION_CHARACTER_FAMILY_REVIEW_RECEIPT_SCHEMA = implementation.ANIMATION_CHARACTER_FAMILY_REVIEW_RECEIPT_SCHEMA;
export const ANIMATION_CHARACTER_FAMILY_RUNTIME_PLAN_SCHEMA = implementation.ANIMATION_CHARACTER_FAMILY_RUNTIME_PLAN_SCHEMA;
export const ANIMATION_CHARACTER_FAMILY_ACTIONS = implementation.ANIMATION_CHARACTER_FAMILY_ACTIONS;
export const ANIMATION_CHARACTER_FAMILY_PERSPECTIVES = implementation.ANIMATION_CHARACTER_FAMILY_PERSPECTIVES;
export const ANIMATION_CHARACTER_FAMILY_DIRECTIONS = implementation.ANIMATION_CHARACTER_FAMILY_DIRECTIONS;
export const animationCharacterFamilyAuthority = implementation.animationCharacterFamilyAuthority;
export const animationCharacterFamilySha256 = implementation.animationCharacterFamilySha256;
export const compileAnimationCharacterFamilyPlan = implementation.compileAnimationCharacterFamilyPlan;
export const assertAnimationCharacterFamilyPlanIntegrity = implementation.assertAnimationCharacterFamilyPlanIntegrity;
export const assertAnimationCharacterFamilyClipEvidenceIntegrity = implementation.assertAnimationCharacterFamilyClipEvidenceIntegrity;
export const compileAnimationCharacterFamilyReviewInput = implementation.compileAnimationCharacterFamilyReviewInput;
export const assertAnimationCharacterFamilyReviewInputIntegrity = implementation.assertAnimationCharacterFamilyReviewInputIntegrity;
export const compileAnimationCharacterFamilyReviewReceipt = implementation.compileAnimationCharacterFamilyReviewReceipt;
export const assertAnimationCharacterFamilyReviewReceiptIntegrity = implementation.assertAnimationCharacterFamilyReviewReceiptIntegrity;
export const compileAnimationCharacterFamilyStatus = implementation.compileAnimationCharacterFamilyStatus;
export const assertAnimationCharacterFamilyStatusIntegrity = implementation.assertAnimationCharacterFamilyStatusIntegrity;
export const compileAnimationCharacterFamilyRuntimePlan = implementation.compileAnimationCharacterFamilyRuntimePlan;
export const assertAnimationCharacterFamilyRuntimePlanIntegrity = implementation.assertAnimationCharacterFamilyRuntimePlanIntegrity;
export const describeAnimationCharacterFamilyV1 = implementation.describeAnimationCharacterFamilyV1;
