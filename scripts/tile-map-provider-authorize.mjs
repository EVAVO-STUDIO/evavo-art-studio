#!/usr/bin/env node
import process from 'node:process';

import { authorizeTileMapProviderRuntime } from './authorize-tile-map-provider-runtime.mjs';

authorizeTileMapProviderRuntime(process.argv.slice(2))
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 2;
  });
