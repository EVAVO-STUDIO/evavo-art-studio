import { PLAN_SCHEMA } from "./compiler.mjs";
import { assert } from "./common.mjs";

export function campaignMarkdown(plan) {
  assert(plan?.schema === PLAN_SCHEMA, `plan.schema must equal ${PLAN_SCHEMA}.`);
  const lines = [
    `# ${plan.campaignId} production plan`,
    "",
    `Plan SHA-256: \`${plan.planSha256}\``,
    "",
    "## Campaign totals",
    "",
    "| Game | Families | Images | Ten-slot batches | Partial batches | Unused slots |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const game of plan.games) {
    lines.push(`| ${game.title} | ${game.totals.families} | ${game.totals.images} | ${game.totals.batches} | ${game.totals.partialBatches} | ${game.totals.unusedBatchSlots} |`);
  }
  lines.push(
    `| **Total** | **${plan.totals.families}** | **${plan.totals.images}** | **${plan.totals.batches}** | **${plan.totals.partialBatches}** | **${plan.totals.unusedBatchSlots}** |`,
    "",
    "Batches are family-locked for continuity. They never mix games or asset families. The final batch of a family may contain fewer than ten required images; it is not padded with invented work.",
    "",
  );
  for (const game of plan.games) {
    lines.push(`## ${game.productionOrder}. ${game.title}`, "", `Style lock: ${game.styleLock}`, "", "| Order | Family | Phase | Images | Batches |", "|---:|---|---|---:|---:|");
    for (const family of game.families) {
      lines.push(`| ${family.priority} | ${family.label} | ${family.phase} | ${family.images} | ${family.batches} |`);
    }
    lines.push("", `First batch: \`${game.batches[0].id}\``, `Last batch: \`${game.batches.at(-1).id}\``, "");
  }
  lines.push(
    "## Pixel-font phase",
    "",
    "Pixel fonts start only after the shared Shell 95 surface and all four game image campaigns complete, as requested. Pixel Font Studio builds these deterministic families without image-generation batches:",
    "",
  );
  for (const font of plan.fontPhase.families) {
    lines.push(`${font.buildOrder}. **${font.displayName}** — ${font.faces.join(", ")} — request \`${font.requestPath}\``);
  }
  lines.push(
    "",
    "## Authority boundary",
    "",
    "This plan compiles prompts and schedules only. It does not call a provider, edit source images, assemble or promote candidates, mutate the game repository, approve art, commit, push, publish, or force-push.",
    "",
  );
  return `${lines.join("\n")}\n`;
}
