#!/usr/bin/env node
import path from "node:path";

import { verifyTileMapCandidateProof } from "../apps/cli/dist/tile-map-candidate-proof-verify.js";

const manifest = process.argv[2];
if (!manifest || process.argv.length !== 3) {
  throw new Error(
    "usage: verify-tile-map-candidate-proof.mjs <candidate-proof.manifest.json>",
  );
}

verifyTileMapCandidateProof(manifest)
  .then((result) => {
    process.stdout.write(
      `${JSON.stringify({
        ...result,
        manifest: path.resolve(result.manifest),
      })}\n`,
    );
  })
  .catch((error) => {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "EVAVO_TILE_MAP_PROOF_VERIFY_CLI_ERROR";
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        error: {
          code,
          message: error instanceof Error ? error.message : String(error),
        },
      })}\n`,
    );
    process.exitCode = 2;
  });
