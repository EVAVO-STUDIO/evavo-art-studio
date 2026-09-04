import fs from 'node:fs';
import path from 'node:path';

const data = JSON.parse(fs.readFileSync(path.resolve('config/seamless-fx-capabilities-v1.json'), 'utf8'));
const fail = (m) => { throw new Error(`seamless-fx-capabilities: ${m}`); };
const nonEmpty = (v, n) => { if (!Array.isArray(v) || v.length === 0) fail(`${n} must be a non-empty array`); };
if (data.schema !== 'evavo_seamless_fx_capabilities_v1') fail('unexpected schema');
if (data.studio !== 'evavo-art-studio') fail('studio identity mismatch');
if (data.localFirst !== true || data.looping?.supported !== true) fail('local-first looping support is required');
if (data.quality?.requiresTrueAlpha !== true) fail('true alpha QA is required');
if (data.quality?.rejectPaintedCheckerboard !== true) fail('painted checkerboards must be rejected');
nonEmpty(data.looping.methods, 'looping.methods');
nonEmpty(data.looping.requiredQa, 'looping.requiredQa');
nonEmpty(data.styles, 'styles');
nonEmpty(data.families, 'families');
nonEmpty(data.outputs, 'outputs');
console.log(JSON.stringify({ ok: true, studio: data.studio, families: data.families.length, outputs: data.outputs.length }));
