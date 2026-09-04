import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const parent = mkdtempSync(path.join(os.tmpdir(), 'evavo-art-fx-probe-'));
const output = path.join(parent, 'probe');
try {
  const result = spawnSync(process.execPath, ['scripts/run-fx-workstation-probe.mjs', output], { encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'FX workstation probe failed');
  const parsed = JSON.parse(result.stdout.trim());
  if (parsed.ok !== true || parsed.outputs !== 2 || !/^[a-f0-9]{64}$/.test(parsed.manifestSha256 ?? '')) throw new Error('FX workstation probe summary invalid');
  const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'evavo.fx-art-workstation-probe/v1' || manifest.outputs?.length !== 2) throw new Error('FX workstation probe manifest invalid');
  if (manifest.authority?.creativeApprovalGranted !== false || manifest.authority?.publicationGranted !== false) throw new Error('FX workstation probe authority invalid');
  const ids = new Set(manifest.outputs.map((entry) => entry.id));
  for (const id of ['probe-plaster-bullet-hole','probe-blood-splatter']) if (!ids.has(id)) throw new Error(`missing probe output ${id}`);
  for (const entry of manifest.outputs) {
    if (!/^[a-f0-9]{64}$/.test(entry.candidateSha256 ?? '') || !/^[a-f0-9]{64}$/.test(entry.svgSha256 ?? '') || !/^[a-f0-9]{64}$/.test(entry.candidateFileSha256 ?? '')) throw new Error(`${entry.id}: SHA evidence invalid`);
    statSync(path.join(output, entry.svg));
    statSync(path.join(output, entry.candidate));
  }
  console.log(JSON.stringify({ ok: true, gate: 'evavo-art-fx-workstation-probe-v1', outputs: manifest.outputs.length }));
} finally {
  rmSync(parent, { recursive: true, force: true });
}
