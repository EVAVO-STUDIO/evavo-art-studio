import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test(
  'established media CI executes the complete Council V4.8 package proof',
  { timeout: 10 * 60 * 1000 },
  () => {
    const result = spawnSync(
      process.execPath,
      [
        '--test',
        'scripts/test-project-art-council-identity-anchor-runtime-package.mjs',
        'scripts/test-project-art-council-identity-anchor-runtime-package-mcp.mjs',
      ],
      {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    assert.equal(
      result.error,
      undefined,
      result.error?.message ?? 'V4.8 test process could not start',
    );
    assert.equal(
      result.status,
      0,
      [result.stdout, result.stderr].filter(Boolean).join('\n'),
    );
  },
);
