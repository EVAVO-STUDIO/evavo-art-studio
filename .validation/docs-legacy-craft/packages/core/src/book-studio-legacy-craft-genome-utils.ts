import { createHash } from "node:crypto";
import type {
  EvavoCraftInfluence,
  EvavoCraftInfluenceSourceKind,
  EvavoCraftMechanismObservation,
  EvavoCraftRightsBasis,
} from "./book-studio-legacy-craft-genome-types";

export const CRAFT_SHA256 = /^sha256:[a-f0-9]{64}$/;
export const CRAFT_SAFE_ID = /^[a-z][a-z0-9._:-]{1,127}$/;

export const unique = <T>(values: T[]): T[] => Array.from(new Set(values));
export const cleanCraftIds = (values: string[]): string[] => unique(values.map((value) => value.trim()).filter(Boolean)).sort();
export const roundCraftNumber = (value: number, places = 6): number => Number(value.toFixed(places));
export const sha256CraftText = (value: string): string => `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

export const stableCraftJson = (value: unknown): string => JSON.stringify(stableValue(value));

const PRIVATE_LABEL_STOP_WORDS = new Set([
  "accepted", "analysis", "author", "book", "craft", "creator", "domain", "licensed", "private", "profile", "project", "public", "reference", "restricted", "source", "study", "studio", "voice", "writer",
]);

function privateIdentityTokens(value: string): string[] {
  const rawTokens = value.normalize("NFKC").match(/[A-Za-z0-9]+/g) ?? [];
  return unique(rawTokens.filter((token) => {
    const normalized = token.toLowerCase();
    if (normalized.length < 4 || PRIVATE_LABEL_STOP_WORDS.has(normalized)) return false;
    return /[a-z][A-Z]/.test(token)
      || /^[A-Z][A-Za-z0-9]*$/.test(token)
      || /\d/.test(token)
      || (rawTokens.length === 1 && normalized.length >= 8);
  }).map((token) => token.toLowerCase()));
}

function normalizedText(value: string): string {
  return ` ${value.toLowerCase().normalize("NFKC").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

export function textLeaksPrivateLabel(text: string, labels: string[]): boolean {
  const haystack = normalizedText(text);
  return labels.some((label) => {
    const exact = normalizedText(label).trim();
    if (exact.length >= 10 && haystack.includes(` ${exact} `)) return true;
    return privateIdentityTokens(label).some((token) => haystack.includes(` ${token} `));
  });
}

export function textLeaksExactPrivateLabel(text: string, labels: string[]): boolean {
  const haystack = normalizedText(text);
  return labels.some((label) => {
    const exact = normalizedText(label).trim();
    return exact.length >= 10 && haystack.includes(` ${exact} `);
  });
}

export function expectedCraftRightsBasis(kind: EvavoCraftInfluenceSourceKind): EvavoCraftRightsBasis {
  switch (kind) {
    case "public_domain": return "public_domain";
    case "licensed": return "explicit_license";
    case "user_owned": return "user_owned";
    case "project_owned": return "project_owned";
    case "abstract_profile": return "abstract_observation";
    case "restricted_reference": return "restricted_reference";
    case "synthesized_profile": return "derived_abstract_profile";
  }
}

export const craftMechanismValue = (mechanism: EvavoCraftMechanismObservation): number => mechanism.polarity * mechanism.strength * mechanism.confidence;

export function craftInfluenceVector(influence: EvavoCraftInfluence): Map<string, number> {
  const grouped = new Map<string, number[]>();
  for (const mechanism of influence.mechanisms.filter((item) => item.surfaceSpecificity === "general")) {
    const values = grouped.get(mechanism.dimensionId) ?? [];
    values.push(craftMechanismValue(mechanism));
    grouped.set(mechanism.dimensionId, values);
  }
  return new Map(Array.from(grouped, ([dimensionId, values]) => [dimensionId, values.reduce((sum, value) => sum + value, 0) / values.length]));
}

export function craftVectorDistance(left: Map<string, number>, right: Map<string, number>, dimensions: string[]): number {
  if (!dimensions.length) return 0;
  const squared = dimensions.reduce((total, dimensionId) => total + ((left.get(dimensionId) ?? 0) - (right.get(dimensionId) ?? 0)) ** 2, 0);
  return roundCraftNumber(Math.sqrt(squared / dimensions.length) / 2);
}

export const craftWords = (value: string): string[] => value
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[“”‘’]/g, "'")
  .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
