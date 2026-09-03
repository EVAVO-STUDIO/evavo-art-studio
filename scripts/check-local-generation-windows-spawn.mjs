#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runner = path.join(root, 'scripts', 'run-local-generation-campaign.mjs');
const source = await readFile(runner, 'utf8');

assert.equal(source.includes("function pnpmExecutable() { return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'; }"), true, 'campaign runner must keep explicit pnpm shim selection');

// Once the Windows repair is merged, these markers are mandatory. Until then this
// checker intentionally fails so the local smoke cannot be considered production-ready.
for (const marker of [
  "const windowsCommandShim = process.platform === 'win32' && /\\.cmd$/iu.test(command);",
  "process.env.ComSpec?.trim() || 'cmd.exe'",
  "const executableArgs = windowsCommandShim ? ['/d', '/s', '/c', command, ...args] : args;",
  'shell: false',
]) {
  assert.equal(source.includes(marker), true, `Windows local-generation spawn contract lost: ${marker}`);
}

assert.equal(source.includes('shell: true'), false, 'local-generation campaign runner must not use shell:true');
console.log('Local generation Windows spawn contract passed.');
