import type { SpriteFrameQualityReport } from "@evavo/art-quality";

export function failedGateIds(report: SpriteFrameQualityReport): readonly string[] {
  return Object.freeze(
    report.gates
      .filter((gate) => gate.blocking && gate.status === "fail")
      .map((gate) => gate.id)
      .sort(),
  );
}

export function warningGateIds(report: SpriteFrameQualityReport): readonly string[] {
  return Object.freeze(
    report.gates
      .filter((gate) => gate.status === "warning")
      .map((gate) => gate.id)
      .sort(),
  );
}

export function technicalActions(report: SpriteFrameQualityReport): readonly string[] {
  const failed = new Set(failedGateIds(report));
  const actions = new Set<string>();
  if (failed.has("alpha-channel") || failed.has("fake-transparency")) {
    actions.add("background-mastering-required");
  }
  if (failed.has("dimensions") || failed.has("frame-crop")) {
    actions.add("canvas-or-crop-rework-required");
  }
  if (failed.has("edge-halo") || failed.has("transparent-pixel-colour")) {
    actions.add("edge-mastering-required");
  }
  if (failed.has("file-format")) actions.add("runtime-format-rework-required");
  if (actions.size === 0) {
    actions.add(
      report.passed
        ? "technical-pass-human-review-required"
        : "manual-technical-review-required",
    );
  }
  return Object.freeze([...actions].sort());
}

export function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { readonly code: unknown }).code);
  }
  return "ART_BATCH_FILE_REVIEW_FAILED";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function duplicateGroups(
  items: readonly Readonly<Record<string, unknown>>[],
  key: "sourceSha256" | "rawRgbaSha256",
): readonly Readonly<Record<string, unknown>>[] {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const hash = item[key];
    const relativePath = item.path;
    if (typeof hash !== "string" || typeof relativePath !== "string") continue;
    const paths = groups.get(hash) ?? [];
    paths.push(relativePath);
    groups.set(hash, paths);
  }
  return Object.freeze(
    [...groups.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([hash, paths]) =>
        Object.freeze({ hash, paths: Object.freeze([...paths].sort()) }),
      )
      .sort((left, right) =>
        String(left.paths[0]).localeCompare(String(right.paths[0]), "en"),
      ),
  );
}
