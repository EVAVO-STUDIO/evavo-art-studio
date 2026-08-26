#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CONTRACT = 'evavo.project-local-web-asset-handoff.v1';
const DELIVERY_SCHEMA = 'evavo.art-studio.delivery.v2';
const SHA256 = /^[0-9a-f]{64}$/u;

function fail(message) { throw new Error(message); }
function safeRelative(value, label) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)) fail(`${label} must be a forward-slash relative path`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || value === '.' || value === '..' || value.startsWith('../')) fail(`${label} is not canonical`);
  return value;
}
function exactSha(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} must be lowercase SHA-256`);
  return value;
}
function slug(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(value)) fail(`${label} must be a lowercase ASCII slug`);
  return value;
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

const inputArg = process.argv[2];
const outputArg = process.argv[3];
if (!inputArg || !outputArg) fail('usage: compile-project-local-web-asset-delivery.mjs <handoff.json> <delivery.json>');

const inputBytes = await readFile(path.resolve(inputArg));
const manifest = JSON.parse(inputBytes.toString('utf8'));
if (manifest.contractVersion !== CONTRACT) fail(`contractVersion must be ${CONTRACT}`);
if (typeof manifest.workspaceRoot !== 'string' || !path.isAbsolute(manifest.workspaceRoot)) fail('workspaceRoot must be an absolute target workspace path');
if (typeof manifest.evidenceRoot !== 'string' || !path.isAbsolute(manifest.evidenceRoot)) fail('evidenceRoot must be absolute');
const publicRoot = safeRelative(manifest.publicRoot || 'public/media', 'publicRoot').replace(/\/$/u, '');
if (publicRoot !== 'public/media' && !publicRoot.startsWith('public/media/')) fail('publicRoot must remain beneath public/media');
if (!Array.isArray(manifest.assets) || manifest.assets.length < 1 || manifest.assets.length > 64) fail('assets must contain 1-64 entries');

const items = [];
const seenIds = new Set();
const seenDestinations = new Set();
for (let index = 0; index < manifest.assets.length; index += 1) {
  const asset = manifest.assets[index];
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) fail(`assets[${index}] must be an object`);
  const id = slug(asset.id, `assets[${index}].id`);
  if (seenIds.has(id)) fail(`duplicate asset id: ${id}`);
  seenIds.add(id);
  if (asset.reviewStatus !== 'approved') fail(`${id}.reviewStatus must be approved before project-local handoff`);
  if (asset.variant !== 'web') fail(`${id}.variant must be web; source masters remain outside public/`);
  const source = safeRelative(asset.source, `${id}.source`);
  const sourceSha256 = exactSha(asset.sourceSha256, `${id}.sourceSha256`);
  const filename = safeRelative(asset.filename, `${id}.filename`);
  if (filename.includes('/')) fail(`${id}.filename must be a filename, not a directory path`);
  const extension = path.posix.extname(filename).toLowerCase();
  if (!['.webp','.avif','.png','.jpg','.jpeg'].includes(extension)) fail(`${id}.filename must be a web raster image`);
  const destination = `${publicRoot}/${filename}`;
  const destinationKey = destination.normalize('NFC').toLocaleLowerCase('en-US');
  if (seenDestinations.has(destinationKey)) fail(`duplicate destination: ${destination}`);
  seenDestinations.add(destinationKey);
  items.push({
    id,
    source,
    sourceSha256,
    stagedInput: `.evavo/web-asset-handoff/${id}${extension}`,
    destination,
  });
}

const delivery = {
  schema: DELIVERY_SCHEMA,
  runId: manifest.runId || `web-assets-${sha256(inputBytes).slice(0,16)}`,
  workspaceRoot: manifest.workspaceRoot,
  evidenceRoot: manifest.evidenceRoot,
  stagingOnly: manifest.stagingOnly !== false,
  items,
  cleanup: [],
  provenance: {
    sourceContract: CONTRACT,
    sourceManifestSha256: sha256(inputBytes),
    deliveryMode: 'project-local',
    cloudinaryRequired: false,
    sourceMastersPublished: false,
  },
};

await writeFile(path.resolve(outputArg), `${JSON.stringify(delivery, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: 'passed', output: path.resolve(outputArg), assets: items.length, sourceManifestSha256: delivery.provenance.sourceManifestSha256 }));
