#!/usr/bin/env node
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import {
  FACE_ROLES,
  PRESETS,
  buildFamily,
  planFamily,
  validateFamily,
} from './pixel-font/builder.mjs';
import { CHARACTER_SETS } from './pixel-font/glyph-library.mjs';
import { parseCsvRoots, pathInside } from './pixel-font/common.mjs';

export const SERVER_NAME = 'evavo-pixel-font-studio';
export const SERVER_VERSION = '1.0.0';
export const CATALOG_TOOL = 'evavo_pixel_font_catalog';
export const PLAN_TOOL = 'evavo_pixel_font_plan';
export const BUILD_TOOL = 'evavo_pixel_font_build';
export const VALIDATE_TOOL = 'evavo_pixel_font_validate';

function flag(value, name, fallback = false) {
  if (value === undefined || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${name} must be true or false.`);
}

export function policy(environment = process.env) {
  const mode = String(environment.EVAVO_PIXEL_FONT_STUDIO_MODE ?? 'read-only').trim().toLowerCase();
  if (!['read-only', 'read-write'].includes(mode)) throw new Error('EVAVO_PIXEL_FONT_STUDIO_MODE must be read-only or read-write.');
  const writesEnabled = mode === 'read-write' && flag(environment.EVAVO_PIXEL_FONT_STUDIO_ALLOW_WRITES, 'EVAVO_PIXEL_FONT_STUDIO_ALLOW_WRITES');
  if (mode === 'read-write' && !writesEnabled) throw new Error('read-write mode also requires EVAVO_PIXEL_FONT_STUDIO_ALLOW_WRITES=true.');
  return Object.freeze({ mode, writesEnabled, roots: Object.freeze(parseCsvRoots(environment.EVAVO_PIXEL_FONT_ALLOWED_ROOTS)) });
}

async function allowed(value, current, label, { future = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  const requested = path.resolve(value);
  let observed = requested;
  try {
    const state = await lstat(requested);
    if (state.isSymbolicLink()) throw new Error(`${label} must not be a symlink.`);
    observed = await realpath(requested);
  } catch (error) {
    if (!future || error?.code !== 'ENOENT') throw error;
    observed = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  }
  if (!current.roots.length || !current.roots.some((root) => pathInside(observed, root))) throw new Error(`${label} is outside EVAVO_PIXEL_FONT_ALLOWED_ROOTS.`);
  return requested;
}

const objectSchema = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const filePath = { type: 'string', minLength: 1, maxLength: 4096 };

export function toolDefinitions(current = policy()) {
  const tools = [
    { name: CATALOG_TOOL, description: 'List deterministic EVAVO pixel-font presets, glyph sets, roles and output formats.', inputSchema: objectSchema({}) },
    { name: PLAN_TOOL, description: 'Compile an exact self-hashed pixel-font family plan without writing font outputs.', inputSchema: objectSchema({ requestPath: filePath, outputRoot: filePath }, ['requestPath', 'outputRoot']) },
    { name: VALIDATE_TOOL, description: 'Independently validate a generated pixel-font family, atlases, BMFont metadata, Godot role map and QA.', inputSchema: objectSchema({ familyPath: filePath }, ['familyPath']) },
  ];
  if (current.writesEnabled) {
    tools.push({
      name: BUILD_TOOL,
      description: 'Generate one original EVAVO pixel-font family into an empty allowed evidence/output root. Requires confirmWrite=true.',
      inputSchema: objectSchema({
        requestPath: filePath,
        outputRoot: filePath,
        planPath: filePath,
        confirmWrite: { type: 'boolean', const: true },
      }, ['requestPath', 'outputRoot', 'confirmWrite']),
    });
  }
  return Object.freeze(tools);
}

function catalog() {
  return Object.freeze({
    schema: 'evavo.pixel-font-studio-catalog.v1',
    presets: Object.freeze(Object.keys(PRESETS).sort()),
    roles: FACE_ROLES,
    characterSets: Object.freeze(Object.fromEntries(Object.entries(CHARACTER_SETS).map(([id, values]) => [id, values.length]))),
    outputFormats: Object.freeze(['AngelCode BMFont .fnt', 'RGBA PNG atlas', 'Godot FontVariation .tres', 'specimen PNG', 'self-hashed JSON evidence']),
    originalGlyphPrimitives: true,
    externalFontBinaryRequired: false,
    providerExecution: false,
    candidatePromotion: false,
    targetRepositoryMutation: false,
    gitPush: false,
    publication: false,
    forcePush: false,
  });
}

export async function callTool(name, input = {}, context = {}) {
  const current = context.policy ?? policy();
  if (!toolDefinitions(current).some((tool) => tool.name === name)) throw new Error(`Unknown or prohibited pixel-font tool ${name}.`);
  if (name === CATALOG_TOOL) return catalog();
  if (name === PLAN_TOOL) {
    const requestPath = await allowed(input.requestPath, current, 'requestPath');
    const outputRoot = await allowed(input.outputRoot, current, 'outputRoot', { future: true });
    return planFamily({ requestPath, outputRoot });
  }
  if (name === VALIDATE_TOOL) {
    const familyPath = await allowed(input.familyPath, current, 'familyPath');
    return validateFamily({ familyPath });
  }
  if (name === BUILD_TOOL) {
    if (!current.writesEnabled || input.confirmWrite !== true) throw new Error('Pixel-font build requires the write environment gate and confirmWrite=true.');
    const requestPath = await allowed(input.requestPath, current, 'requestPath');
    const outputRoot = await allowed(input.outputRoot, current, 'outputRoot', { future: true });
    const planPath = input.planPath ? await allowed(input.planPath, current, 'planPath') : undefined;
    const result = await buildFamily({ requestPath, outputRoot, ...(planPath ? { planPath } : {}) });
    return Object.freeze({
      status: result.validation.status,
      familyId: result.family.familyId,
      familySha256: result.family.familySha256,
      validationSha256: result.validation.validationSha256,
      receiptSha256: result.receipt.receiptSha256,
      familyPath: result.familyPath,
      validationPath: result.validationPath,
      receiptPath: result.receiptPath,
      targetRepositoryMutation: false,
      gitPush: false,
      publication: false,
    });
  }
  throw new Error(`Unknown pixel-font tool ${name}.`);
}

const response = (id, result) => ({ jsonrpc: '2.0', id: id ?? null, result });
const content = (value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }];

export async function handleRequest(request, context = {}) {
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') throw new Error('Invalid JSON-RPC request.');
  const current = context.policy ?? policy();
  if (request.method === 'initialize') {
    return response(request.id, {
      protocolVersion: request.params?.protocolVersion ?? '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: 'Plans and validation are read-only. Builds require the read-write environment gate, allowed roots, an empty create-only output target and confirmWrite=true. The server creates original font artifacts only; it never promotes, publishes, deletes sources or mutates a game repository.',
    });
  }
  if (request.method === 'ping') return response(request.id, {});
  if (request.method === 'notifications/initialized') return null;
  if (request.method === 'tools/list') return response(request.id, { tools: toolDefinitions(current) });
  if (request.method === 'tools/call') {
    try {
      return response(request.id, { content: content(await callTool(request.params?.name, request.params?.arguments ?? {}, { policy: current })), isError: false });
    } catch (error) {
      return response(request.id, { content: content({ error: error instanceof Error ? error.message : String(error) }), isError: true });
    }
  }
  throw new Error(`Unsupported MCP method ${request.method}.`);
}

export async function startServer(options = {}) {
  const current = options.policy ?? policy(options.environment);
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of input) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handleRequest(request, { policy: current });
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } })}\n`);
    }
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  startServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
