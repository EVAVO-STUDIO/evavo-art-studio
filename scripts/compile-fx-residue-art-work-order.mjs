#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { compileFxResidueArtWorkOrder } from './fx-residue-art-work-order-lib.mjs';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const source = process.argv[2];
if (!source) fail('usage: node scripts/compile-fx-residue-art-work-order.mjs <handoff.json> [--out <new-file.json>]');
const outIndex = process.argv.indexOf('--out');
const out = outIndex >= 0 ? process.argv[outIndex + 1] : null;
if (outIndex >= 0 && !out) fail('--out requires a path');

let handoff;
try {
  handoff = JSON.parse(fs.readFileSync(path.resolve(source), 'utf8'));
} catch (error) {
  fail(`cannot read valid handoff JSON: ${error instanceof Error ? error.message : String(error)}`);
}

let workOrder;
try {
  workOrder = compileFxResidueArtWorkOrder(handoff);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const text = `${JSON.stringify(workOrder, null, 2)}\n`;
if (out) {
  const destination = path.resolve(out);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try {
    fs.writeFileSync(destination, text, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    fail(`create-only output failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, output: destination, workOrderSha256: workOrder.workOrderSha256 }, null, 2)}\n`);
} else {
  process.stdout.write(text);
}
