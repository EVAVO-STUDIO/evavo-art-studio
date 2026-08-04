import { randomUUID } from "node:crypto";
import process from "node:process";

export const BOOK_LEGACY_CRAFT_GENOME_ENDPOINT = "/api/v1/book-studio/legacy-craft-genome";
export const BOOK_LEGACY_CRAFT_GENOME_CONTRACT = "evavo_docs_book_legacy_craft_genome_v1";
export const BOOK_LEGACY_CRAFT_GENOME_MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const BOOK_LEGACY_CRAFT_OPERATIONS = Object.freeze([
  "compile_profile",
  "create_provider_packet",
  "validate_provider_response",
  "scan_phrase_overlap",
]);

const operations = new Set(BOOK_LEGACY_CRAFT_OPERATIONS);
const callers = new Set([
  "Website Book Studio craft-genome compatibility route",
  "EVAVO Docs Suite legacy craft-genome CLI",
  "EVAVO Docs Suite legacy craft-genome MCP",
]);

export function isLegacyCraftRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readLegacyCraftWebsiteCommit(environment = process.env, override) {
  const value = String(override ?? environment.EVAVO_WEBSITE_COMMIT_SHA ?? environment.VERCEL_GIT_COMMIT_SHA ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40,64}$/.test(value)) {
    throw new Error("EVAVO_WEBSITE_COMMIT_SHA must contain the exact 40-64 character Website Git commit.");
  }
  return value;
}

export function validateLegacyCraftPayload(value, expectedOperation) {
  if (!isLegacyCraftRecord(value) || typeof value.operation !== "string" || !operations.has(value.operation)) {
    throw new Error("Legacy craft input must be one supported Website craft-genome operation object.");
  }
  if (expectedOperation && value.operation !== expectedOperation) {
    throw new Error(`Legacy craft command requires operation ${expectedOperation}.`);
  }
  return value;
}

export function buildLegacyCraftRequest(payload, requestedBy, options = {}) {
  if (!callers.has(requestedBy)) throw new Error("Legacy craft request caller is unsupported.");
  const validatedPayload = validateLegacyCraftPayload(payload, options.expectedOperation);
  const requestId = String(options.requestId ?? `legacy-craft:${randomUUID()}`).trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) throw new Error("Legacy craft request ID is invalid.");
  const requestedAt = String(options.requestedAt ?? new Date().toISOString());
  if (Number.isNaN(Date.parse(requestedAt))) throw new Error("Legacy craft requestedAt is invalid.");
  return {
    outputKind: "evavo_docs_book_legacy_craft_genome_request",
    schemaVersion: 1,
    contract: BOOK_LEGACY_CRAFT_GENOME_CONTRACT,
    authorityMode: "compatibility_migration",
    requestId,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: readLegacyCraftWebsiteCommit(options.environment, options.sourceCommit),
    payload: validatedPayload,
    requestedAt,
    requestedBy,
    authoritativeWritesAllowed: false,
    providerCallAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    automaticCanonicalAdmissionAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}
