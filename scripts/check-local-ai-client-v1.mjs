import fs from "node:fs";

const EXPECTED = {
  studio: "art-studio",
  aliases: [],
  allowedWorkloads: ["image", "video", "training"],
  planner: { server: "evavo-local-ai", tool: "evavo_local_ai_plan" },
  catalog: { server: "evavo-local-ai", tool: "evavo_local_ai_catalog" },
  execution: { repository: "EVAVO-STUDIO/evavo-local-compute", provider: "evavo-local-execution", arbitraryCommandTextAccepted: false },
  models: { repository: "EVAVO-STUDIO/evavo-model-lab", weightsInGit: false },
  storage: { repository: "EVAVO-STUDIO/evavo-local-storage", canonicalRoot: "bee://primary/EVAVO/AI" },
  durable: { repository: "EVAVO-STUDIO/evavo-storage" },
  authority: { planningOnly: true, physicalExecutionReceiptRequired: true, creativeApproval: false, publication: false, clientRelease: false },
};
function fail(code) { throw new Error(`EVAVO_LOCAL_AI_CLIENT_${code}`); }
export function validate(value) {
  if (value?.schemaVersion !== 1 || value?.kind !== "evavo-local-ai-client-v1") fail("IDENTITY");
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (JSON.stringify(value[key]) !== JSON.stringify(expected)) fail(key.toUpperCase());
  }
  return { ok: true, studio: value.studio, workloads: value.allowedWorkloads.length };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const path = process.argv[2] ?? "config/local-ai-client-v1.json";
    process.stdout.write(`${JSON.stringify(validate(JSON.parse(fs.readFileSync(path, "utf8"))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
