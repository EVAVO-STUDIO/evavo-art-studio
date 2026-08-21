import { EVAVO_AVATAR_ASSET_PACKS } from "../characters/asset-packs.js";

export const COUNCIL_CHARACTER_ASSIGNMENT_CONTRACT =
  "evavo_council_character_assignments_v1";
export const COUNCIL_CHARACTER_PRODUCTION_REQUEST_CONTRACT =
  "evavo_council_character_production_request_v1";

const MEMBER_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const CHARACTER_ID = /^[a-z0-9][a-z0-9._-]{0,119}$/u;

const DEFAULT_PREFERENCES = Object.freeze({
  architect: "top-hat-man",
  researcher: "eva-female",
});

const REQUIRED_PRESENTATION_STATES = Object.freeze([
  "idle",
  "listening",
  "thinking",
  "speaking",
  "dissent",
  "synthesising",
  "complete",
  "error",
]);

function cleanId(value, pattern, error) {
  const selected = String(value ?? "").trim().toLowerCase();
  if (!pattern.test(selected)) throw new Error(error);
  return selected;
}

function normalizeMembers(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) {
    throw new Error("EVAVO_COUNCIL_CHARACTER_MEMBERS_INVALID");
  }
  const seen = new Set();
  return value.map((item) => {
    const id = cleanId(item?.id, MEMBER_ID, "EVAVO_COUNCIL_CHARACTER_MEMBER_INVALID");
    if (seen.has(id)) throw new Error("EVAVO_COUNCIL_CHARACTER_MEMBER_DUPLICATE");
    seen.add(id);
    return Object.freeze({
      id,
      label: String(item?.label ?? id).replace(/[\r\n]+/gu, " ").trim().slice(0, 120) || id,
    });
  });
}

function normalizePacks(value) {
  if (!Array.isArray(value) || value.length > 64) {
    throw new Error("EVAVO_COUNCIL_CHARACTER_PACKS_INVALID");
  }
  const seen = new Set();
  return value.map((pack) => {
    const characterId = cleanId(
      pack?.characterId,
      CHARACTER_ID,
      "EVAVO_COUNCIL_CHARACTER_PACK_INVALID",
    );
    if (seen.has(characterId)) throw new Error("EVAVO_COUNCIL_CHARACTER_PACK_DUPLICATE");
    seen.add(characterId);
    return Object.freeze({
      characterId,
      pack,
    });
  });
}

function normalizePreferences(value) {
  if (value === undefined) return DEFAULT_PREFERENCES;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("EVAVO_COUNCIL_CHARACTER_PREFERENCES_INVALID");
  }
  const result = {};
  for (const [rawMemberId, rawCharacterId] of Object.entries(value)) {
    const member = cleanId(rawMemberId, MEMBER_ID, "EVAVO_COUNCIL_CHARACTER_PREFERENCE_MEMBER_INVALID");
    const character = cleanId(rawCharacterId, CHARACTER_ID, "EVAVO_COUNCIL_CHARACTER_PREFERENCE_CHARACTER_INVALID");
    result[member] = character;
  }
  return Object.freeze(result);
}

function suggestedCharacterId(memberId) {
  return `council-${memberId}`.slice(0, 120);
}

export function createCouncilCharacterAssignmentPlan({
  members,
  assetPacks = EVAVO_AVATAR_ASSET_PACKS,
  preferences,
} = {}) {
  const normalizedMembers = normalizeMembers(members);
  const normalizedPacks = normalizePacks(assetPacks);
  const preferred = normalizePreferences(preferences);
  const available = new Map(normalizedPacks.map((entry) => [entry.characterId, entry.pack]));
  const used = new Set();
  const assignments = [];

  for (const member of normalizedMembers) {
    const requested = preferred[member.id] ?? null;
    const assigned = requested && available.has(requested) && !used.has(requested)
      ? requested
      : null;
    if (assigned) used.add(assigned);
    assignments.push(Object.freeze({
      memberId: member.id,
      label: member.label,
      characterId: assigned,
      status: assigned ? "assigned" : "missing-character-pack",
      suggestedCharacterId: assigned ? null : suggestedCharacterId(member.id),
      reason: assigned
        ? "approved-one-to-one-character-pack"
        : requested && used.has(requested)
          ? "preferred-character-already-assigned"
          : requested && !available.has(requested)
            ? "preferred-character-pack-unavailable"
            : "no-approved-unique-character-pack",
    }));
  }

  const missing = assignments.filter((item) => item.status !== "assigned");
  return Object.freeze({
    contractVersion: COUNCIL_CHARACTER_ASSIGNMENT_CONTRACT,
    complete: missing.length === 0,
    memberCount: assignments.length,
    approvedPackCount: normalizedPacks.length,
    assignedCount: assignments.length - missing.length,
    missingCharacterCount: missing.length,
    assignments: Object.freeze(assignments),
    missingCharacters: Object.freeze(missing.map((item) => Object.freeze({
      memberId: item.memberId,
      label: item.label,
      suggestedCharacterId: item.suggestedCharacterId,
    }))),
  });
}

export function characterAssignmentsFromPlan(plan) {
  if (!plan || plan.contractVersion !== COUNCIL_CHARACTER_ASSIGNMENT_CONTRACT) {
    throw new Error("EVAVO_COUNCIL_CHARACTER_PLAN_INVALID");
  }
  const result = {};
  for (const item of plan.assignments ?? []) {
    if (item.status === "assigned" && item.characterId) {
      result[item.memberId] = item.characterId;
    }
  }
  return Object.freeze(result);
}

export function missingCouncilCharacterProductionRequests(plan) {
  if (!plan || plan.contractVersion !== COUNCIL_CHARACTER_ASSIGNMENT_CONTRACT) {
    throw new Error("EVAVO_COUNCIL_CHARACTER_PLAN_INVALID");
  }
  const assigned = new Set(
    (plan.assignments ?? [])
      .filter((item) => item.status === "assigned" && item.characterId)
      .map((item) => item.characterId),
  );
  return Object.freeze((plan.missingCharacters ?? []).map((item) => {
    const characterId = cleanId(
      item.suggestedCharacterId,
      CHARACTER_ID,
      "EVAVO_COUNCIL_CHARACTER_PRODUCTION_ID_INVALID",
    );
    if (assigned.has(characterId)) {
      throw new Error("EVAVO_COUNCIL_CHARACTER_PRODUCTION_ID_COLLISION");
    }
    return Object.freeze({
      contractVersion: COUNCIL_CHARACTER_PRODUCTION_REQUEST_CONTRACT,
      authority: "EVAVO-STUDIO/evavo-art-studio",
      effect: "plan-only",
      memberId: cleanId(item.memberId, MEMBER_ID, "EVAVO_COUNCIL_CHARACTER_PRODUCTION_MEMBER_INVALID"),
      memberLabel: String(item.label ?? item.memberId).replace(/[\r\n]+/gu, " ").trim().slice(0, 120),
      characterId,
      objective: "Create one original, production-ready Council character identity and deterministic animated avatar pack without resembling or duplicating an existing Council character.",
      visualDirection: Object.freeze([
        "EVAVO-crafted rather than generic AI-assistant styling",
        "strong readable silhouette at compact Council-card scale",
        "professional creative-technology studio character design",
        "visually distinct from all already-approved Council identities",
        "transparent production assets with clean edge treatment",
      ]),
      requiredStates: REQUIRED_PRESENTATION_STATES,
      requiredDeliverables: Object.freeze([
        "identity-locked master",
        "transparent idle and attention masters",
        "listening and thinking motion",
        "speaking and viseme-ready motion",
        "dissent and synthesis gestures",
        "completion and error states",
        "reduced-motion fallback",
        "asset-pack manifest with provenance",
        "independent frame-quality review evidence",
      ]),
      approvals: Object.freeze({
        providerExecution: false,
        candidateApproval: false,
        candidatePromotion: false,
        runtimeActivation: false,
        publication: false,
      }),
    });
  }));
}
