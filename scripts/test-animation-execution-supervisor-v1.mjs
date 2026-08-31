#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const parts = await Promise.all([
  readFile(
    new URL(
      "./test-animation-execution-supervisor-v1.payload.001.txt",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "./test-animation-execution-supervisor-v1.payload.002.txt",
      import.meta.url,
    ),
    "utf8",
  ),
]);

let source = brotliDecompressSync(
  Buffer.from(parts.join(""), "base64"),
).toString("utf8");
source = source.replace(
  '"../tools/animation_execution_supervisor_v1.mjs"',
  JSON.stringify(
    new URL("../tools/animation_execution_supervisor_v1.mjs", import.meta.url).href,
  ),
);
source = source.replace(
  '"../tools/animation_execution_supervisor_v1_mcp.mjs"',
  JSON.stringify(
    new URL(
      "../tools/animation_execution_supervisor_v1_mcp.mjs",
      import.meta.url,
    ).href,
  ),
);
source = source.replace(
  "const HERE = dirname(fileURLToPath(import.meta.url));",
  `const HERE = ${JSON.stringify(here)};`,
);

await import(
  `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`
);
