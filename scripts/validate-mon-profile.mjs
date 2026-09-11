import fs from 'node:fs';
import path from 'node:path';

const profilePath = path.resolve('examples/mon-art-family-governance.v1.json');
const fail = (message) => { console.error(`MÔN profile FAIL: ${message}`); process.exit(1); };
if (!fs.existsSync(profilePath)) fail(`missing ${profilePath}`);
let p;
try { p = JSON.parse(fs.readFileSync(profilePath, 'utf8')); } catch (error) { fail(`invalid JSON: ${error.message}`); }
if (p.id !== 'mon-art-family-governance-v1') fail('unexpected profile id');
if (p.project !== 'moonstone-wales') fail('unexpected project');
for (const family of ['character', 'environment', 'card']) {
  const value = p.assetFamilies?.[family];
  if (!value) fail(`missing family ${family}`);
  for (const key of ['requiredAnchors', 'hardLocks', 'reviewEvidence']) {
    if (!Array.isArray(value[key]) || value[key].length === 0) fail(`${family}.${key} missing or empty`);
  }
}
for (const key of ['requiredFields', 'allowedConfidence']) {
  if (!Array.isArray(p.historicalTagging?.[key]) || p.historicalTagging[key].length === 0) fail(`historicalTagging.${key} missing or empty`);
}
if (!Array.isArray(p.promptPacket?.required) || p.promptPacket.required.length === 0) fail('promptPacket.required missing');
if (p.sourcePreservation?.immutableOriginals !== true) fail('immutable originals must be required');
if (p.sourcePreservation?.noRuntimePromotionFromProvider !== true) fail('provider runtime promotion must be forbidden');
console.log('MÔN art governance profile PASS');
