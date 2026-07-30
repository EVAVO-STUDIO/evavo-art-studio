import { readFile } from "node:fs/promises";
import path from "node:path";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  spriteFamilyManifestSha256,
  spriteFamilyProtocolSummary,
  validateSpriteFamilyManifest,
  verifySpriteFamily,
} from "@evavo/art-sprite-family";

export interface SpriteFamilyCommandValues {
  readonly input?: string;
  readonly "artifact-root"?: string;
}

export type SpriteFamilyCommandResult =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: unknown; exitCode?: number }>;

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function inputPath(values: SpriteFamilyCommandValues, command: string): string {
  if (!values.input) throw new Error(`--input is required for ${command}.`);
  return path.resolve(values.input);
}

function inputArtifactIds(manifest: ReturnType<typeof validateSpriteFamilyManifest>) {
  return [
    ...new Set(
      manifest.frames.flatMap((frame) => [
        ...frame.layers.map((layer) => layer.artifactId),
        ...(frame.declaredCompositeArtifactId
          ? [frame.declaredCompositeArtifactId]
          : []),
      ]),
    ),
  ].sort();
}

export async function handleSpriteFamilyCommand(
  command: string,
  values: SpriteFamilyCommandValues,
): Promise<SpriteFamilyCommandResult> {
  if (command === "sprite-family-protocol") {
    return { handled: true, value: spriteFamilyProtocolSummary() };
  }
  if (
    !new Set([
      "sprite-family-validate",
      "sprite-family-compile",
      "sprite-family-run",
    ]).has(command)
  ) {
    return { handled: false };
  }
  const manifest = validateSpriteFamilyManifest(
    await readJson(inputPath(values, command)),
  );
  if (command === "sprite-family-validate") {
    return { handled: true, value: manifest };
  }
  if (command === "sprite-family-compile") {
    return {
      handled: true,
      value: {
        schemaVersion: "1.0",
        manifest,
        manifestSha256: spriteFamilyManifestSha256(manifest),
        executionMode: "durable-worker-or-deliberate-local",
        runtimeJob: {
          queue: "selection",
          kind: "sprite.family.verify",
          idempotencyKey: `sprite-family:${manifest.familyId}:${spriteFamilyManifestSha256(manifest)}`,
          payload: manifest,
          inputArtifacts: inputArtifactIds(manifest),
          requiredCapabilities: [
            "sprite.family.verify",
            "media.layer-compose",
            "selection.compare",
            "evidence.bundle",
          ],
          maximumAttempts: 1,
          leaseDurationMs: 120_000,
          timeoutMs: 1_800_000,
          labels: {
            familyId: manifest.familyId,
            stage: "sprite-family-verification",
          },
        },
      },
    };
  }
  const result = await verifySpriteFamily(manifest, {
    artifacts: new LocalArtifactStore({
      root: path.resolve(values["artifact-root"] ?? ".art-studio/artifacts"),
    }),
  });
  return {
    handled: true,
    value: result,
    ...(result.evidence.passed ? {} : { exitCode: 3 }),
  };
}
