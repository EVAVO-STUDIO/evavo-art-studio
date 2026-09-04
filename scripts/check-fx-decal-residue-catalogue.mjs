import fs from 'node:fs';

const path = 'config/fx-decal-residue-catalogue-v1.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = (m) => { throw new Error(`fx-decal-residue-catalogue: ${m}`); };
if (data.schema !== 'evavo_fx_decal_residue_catalogue_v1') fail('unexpected schema');
for (const group of ['impact','organicSplatter','foodSplatter','environmentalResidue']) {
  if (!Array.isArray(data.families?.[group]) || data.families[group].length < 3) fail(`missing family group ${group}`);
}
for (const required of ['bullet-hole','blood-splatter','food-stain','damp-stain','scorch-mark']) {
  const all = Object.values(data.families).flat();
  if (!all.includes(required)) fail(`missing required family ${required}`);
}
for (const substrate of ['wood','plaster','brick','painted-metal','glass']) {
  if (!data.substrates.includes(substrate)) fail(`missing substrate ${substrate}`);
}
for (const qa of ['true-alpha-when-decal','substrate-plausibility','gravity-direction','scale-consistency']) {
  if (!data.quality.includes(qa)) fail(`missing QA ${qa}`);
}
console.log(JSON.stringify({ok:true,families:Object.values(data.families).flat().length,substrates:data.substrates.length}));
