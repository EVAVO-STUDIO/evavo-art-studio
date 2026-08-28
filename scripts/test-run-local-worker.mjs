import assert from "node:assert/strict";
import test from "node:test";

import { workerCommandLine } from "./run-local-worker.mjs";

test("local worker wrapper supports the complete governed command set", () => {
  for (const command of ["once", "until-idle", "daemon"]) {
    assert.deepEqual(workerCommandLine(command), [
      "pnpm",
      "--filter",
      "@evavo/art-studio-worker",
      "start",
      "--",
      command,
    ]);
  }
  assert.throws(() => workerCommandLine("cloud"), /once, until-idle or daemon/u);
});
