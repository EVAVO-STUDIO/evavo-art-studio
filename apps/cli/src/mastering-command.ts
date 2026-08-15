import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  atomicWriteFile,
  recoverBackgroundAlpha,
  suppressChromaSpill,
  type BackgroundAlphaRecoveryOptions,
} from "@evavo/art-media";
import {
  analyseDecodedSpriteFrame,
  decodeSpriteFrame,
} from "@evavo/art-quality";

export interface MasteringCommandValues {
  readonly input?: string;
  readonly output?: string;
  readonly evidence?: string;
  readonly expectations?: string;
  readonly matte?: string;
  readonly "connection-distance"?: string;
  readonly "opaque-seed-distance"?: string;
  readonly "edge-search-radius"?: string;
  readonly "bleed-radius"?: string;
  readonly "minimum-border-matte-fraction"?: string;
  readonly "maximum-composite-channel-error"?: string;
  readonly "checker-connection-distance"?: string;
  readonly "checker-foreground-seed-distance"?: string;
  readonly "checker-minimum-border-fraction"?: string;
  readonly "checker-maximum-composite-channel-error"?: string;
  readonly "suppress-chroma-spill"?: boolean;
}

export type MasteringCommandResult =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: unknown; exitCode?: number }>;

function required(value: string | undefined, option: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${option} is required.`);
  return normalized;
}

function optionalNumber(
  value: string | undefined,
  option: string,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${option} must be a finite number.`);
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function jsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8")) as unknown;
}

function recoveryOptions(
  values: MasteringCommandValues,
  matteColour: string | undefined,
): BackgroundAlphaRecoveryOptions {
  const connectionDistance = optionalNumber(
    values["connection-distance"],
    "--connection-distance",
  );
  const opaqueSeedDistance = optionalNumber(
    values["opaque-seed-distance"],
    "--opaque-seed-distance",
  );
  const edgeSearchRadius = optionalNumber(
    values["edge-search-radius"],
    "--edge-search-radius",
  );
  const bleedRadius = optionalNumber(values["bleed-radius"], "--bleed-radius");
  const minimumBorderMatteFraction = optionalNumber(
    values["minimum-border-matte-fraction"],
    "--minimum-border-matte-fraction",
  );
  const maximumCompositeChannelError = optionalNumber(
    values["maximum-composite-channel-error"],
    "--maximum-composite-channel-error",
  );
  const checkerConnectionDistance = optionalNumber(
    values["checker-connection-distance"],
    "--checker-connection-distance",
  );
  const checkerForegroundSeedDistance = optionalNumber(
    values["checker-foreground-seed-distance"],
    "--checker-foreground-seed-distance",
  );
  const checkerMinimumBorderFraction = optionalNumber(
    values["checker-minimum-border-fraction"],
    "--checker-minimum-border-fraction",
  );
  const checkerMaximumCompositeChannelError = optionalNumber(
    values["checker-maximum-composite-channel-error"],
    "--checker-maximum-composite-channel-error",
  );
  return {
    ...(matteColour === undefined ? {} : { matteColour }),
    ...(connectionDistance === undefined ? {} : { connectionDistance }),
    ...(opaqueSeedDistance === undefined ? {} : { opaqueSeedDistance }),
    ...(edgeSearchRadius === undefined ? {} : { edgeSearchRadius }),
    ...(bleedRadius === undefined ? {} : { bleedRadius }),
    ...(minimumBorderMatteFraction === undefined
      ? {}
      : { minimumBorderMatteFraction }),
    ...(maximumCompositeChannelError === undefined
      ? {}
      : { maximumCompositeChannelError }),
    ...(checkerConnectionDistance === undefined
      ? {}
      : { checkerConnectionDistance }),
    ...(checkerForegroundSeedDistance === undefined
      ? {}
      : { checkerForegroundSeedDistance }),
    ...(checkerMinimumBorderFraction === undefined
      ? {}
      : { checkerMinimumBorderFraction }),
    ...(checkerMaximumCompositeChannelError === undefined
      ? {}
      : { checkerMaximumCompositeChannelError }),
  };
}

export async function handleMasteringCommand(
  command: string,
  values: MasteringCommandValues,
): Promise<MasteringCommandResult> {
  if (command !== "master-alpha") return { handled: false };
  const inputPath = path.resolve(required(values.input, "--input"));
  const outputPath = path.resolve(required(values.output, "--output"));
  const matteColour = values.matte?.trim() || undefined;
  const evidencePath = path.resolve(
    values.evidence?.trim() || `${outputPath}.evidence.json`,
  );
  const suppliedExpectations = values.expectations
    ? await jsonFile(values.expectations)
    : {};
  if (!isRecord(suppliedExpectations)) {
    throw new Error("--expectations must contain a JSON object.");
  }

  const extraction = await recoverBackgroundAlpha(
    await readFile(inputPath),
    recoveryOptions(values, matteColour),
  );
  const spillSuppression = values["suppress-chroma-spill"]
    ? await suppressChromaSpill(extraction.png, {
        matteColour:
          extraction.evidence.matte?.hex ??
          extraction.evidence.classification.inferredMatte?.hex ??
          required(matteColour, "--matte"),
      })
    : null;
  const masteredPng = spillSuppression?.png ?? extraction.png;
  const decoded = await decodeSpriteFrame(masteredPng);
  const existingMattes = Array.isArray(suppliedExpectations.knownMatteColours)
    ? suppliedExpectations.knownMatteColours
    : [];
  const checkerMattes = extraction.evidence.classification.checkerboard.detected
    ? extraction.evidence.classification.checkerboard.colours.map(
        (colour) =>
          `#${[colour.r, colour.g, colour.b]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")}`,
      )
    : [];
  const knownMatteColours = [
    ...(extraction.evidence.matte?.hex
      ? [extraction.evidence.matte.hex]
      : matteColour
        ? [matteColour]
        : []),
    ...(extraction.evidence.classification.inferredMatte?.hex
      ? [extraction.evidence.classification.inferredMatte.hex]
      : []),
    ...checkerMattes,
    ...existingMattes,
  ];
  const quality = analyseDecodedSpriteFrame(decoded, {
    ...suppliedExpectations,
    frameId:
      typeof suppliedExpectations.frameId === "string"
        ? suppliedExpectations.frameId
        : path.basename(outputPath),
    transparency: "alpha-required",
    expectedWidth:
      typeof suppliedExpectations.expectedWidth === "number"
        ? suppliedExpectations.expectedWidth
        : decoded.width,
    expectedHeight:
      typeof suppliedExpectations.expectedHeight === "number"
        ? suppliedExpectations.expectedHeight
        : decoded.height,
    expectedFormat: "png",
    safePadding:
      typeof suppliedExpectations.safePadding === "number"
        ? suppliedExpectations.safePadding
        : 1,
    ...(knownMatteColours.length ? { knownMatteColours } : {}),
  });
  const evidence = {
    schemaVersion: "1.0",
    command: "master-alpha",
    inputPath,
    outputPath,
    evidencePath,
    approvalState: "unapproved",
    promotionEligible: quality.passed,
    extraction: extraction.evidence,
    spillSuppression: spillSuppression?.evidence ?? null,
    quality,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await atomicWriteFile(outputPath, masteredPng);
  await atomicWriteFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  return {
    handled: true,
    value: {
      schemaVersion: "1.0",
      outputPath,
      evidencePath,
      outputSha256:
        spillSuppression?.evidence.outputSha256 ??
        extraction.evidence.outputSha256,
      recoveryStrategy: extraction.evidence.strategy,
      chromaSpillSuppressed: spillSuppression !== null,
      qualityPassed: quality.passed,
      promotionEligible: quality.passed,
      approvalState: "unapproved",
    },
    ...(quality.passed ? {} : { exitCode: 3 }),
  };
}
