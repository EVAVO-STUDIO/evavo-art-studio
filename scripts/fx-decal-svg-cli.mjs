#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { compileFxDecalSvgCandidate } from './fx-decal-svg-candidate.mjs';

function parse(argv) {
  const args = { positional: [], flags: new Map() };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      args.positional.push(value);
      continue;
    }
    const name = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.flags.set(name, next);
      index += 1;
    } else {
      args.flags.set(name, true);
    }
  }
  return args;
}

function flag(args, name, fallback = undefined) {
  const value = args.flags.get(name);
  return value === undefined ? fallback : value;
}

function numberFlag(args, name, fallback) {
  const value = Number(flag(args, name, fallback));
  if (!Number.isFinite(value)) throw new Error(`${name} must be numeric`);
  return value;
}

function safeOutRoot(value) {
  const root = path.resolve(process.cwd(), value);
  const relative = path.relative(process.cwd(), root);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('output must be a new child directory of the current workspace');
  return root;
}

const help = `EVAVO Art Studio FX Decal SVG CLI\n\nUsage:\n  node scripts/fx-decal-svg-cli.mjs render <kind> --id <id> --out <new-dir> [options]\n\nKinds: bullet-hole | splatter | stain | puddle\nOptions: --substrate plaster --seed 1 --amount 0.5 --viscosity 0.5 --direction 90 --porosity 0.5 --no-gravity\n`;

const [command = 'help', ...rest] = process.argv.slice(2);
if (['help','--help','-h'].includes(command)) {
  process.stdout.write(help);
  process.exit(0);
}
if (command !== 'render') throw new Error(`unknown command: ${command}`);
const args = parse(rest);
const kind = args.positional[0];
if (!kind) throw new Error('kind is required');
const id = flag(args, 'id');
const out = flag(args, 'out');
if (typeof id !== 'string' || !id) throw new Error('--id is required');
if (typeof out !== 'string' || !out) throw new Error('--out is required');
const request = {
  id,
  kind,
  substrate: String(flag(args, 'substrate', 'plaster')),
  seed: String(flag(args, 'seed', id)),
  amount: numberFlag(args, 'amount', 0.5),
  viscosity: numberFlag(args, 'viscosity', 0.5),
  directionDegrees: numberFlag(args, 'direction', 90),
  porosity: numberFlag(args, 'porosity', 0.5),
  gravity: flag(args, 'no-gravity') !== true,
};
const candidate = compileFxDecalSvgCandidate(request);
const root = safeOutRoot(out);
fs.mkdirSync(root, { recursive: false });
try {
  fs.writeFileSync(path.join(root, `${id}.mask.svg`), candidate.svg, { encoding: 'utf8', flag: 'wx' });
  fs.writeFileSync(path.join(root, `${id}.candidate.json`), `${JSON.stringify(candidate, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const manifest = {
    format: 'evavo.fx-decal-svg-bundle/v1',
    authority: 'candidate_bundle_only',
    id,
    kind,
    substrate: candidate.substrate,
    candidateSha256: candidate.candidateSha256,
    files: [`${id}.mask.svg`, `${id}.candidate.json`],
    next: ['rasterize-with-existing-art-studio-processing','alpha-and-edge-review','substrate-integration-review'],
    automaticApproval: false,
  };
  fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ ok: true, output: path.relative(process.cwd(), root), candidateSha256: candidate.candidateSha256 })}\n`);
} catch (error) {
  fs.rmSync(root, { recursive: true, force: true });
  throw error;
}
