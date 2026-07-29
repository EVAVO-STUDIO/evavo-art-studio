import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SpriteAtlasPackageWriteResult } from "@evavo/art-media";

import { createGodotSpriteFramesDescriptor } from "./descriptor.js";
import { GODOT_SPRITE_FRAMES_IMPORTER } from "./importer-script.js";
import {
  resolveGodotProjectPath,
  safeGodotFileName,
  toGodotResourcePath,
} from "./path.js";
import type {
  GodotSpriteFramesWriteOptions,
  GodotSpriteFramesWriteResult,
} from "./types.js";

async function atomicWrite(target: string, content: string): Promise<void> {
  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, target);
  } catch (error: unknown) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function writeGodotSpriteFramesImporter(
  atlasPackage: SpriteAtlasPackageWriteResult,
  projectPathInput: string,
  options: GodotSpriteFramesWriteOptions = {},
): Promise<GodotSpriteFramesWriteResult> {
  const projectPath = await resolveGodotProjectPath(projectPathInput);
  toGodotResourcePath(projectPath, atlasPackage.imagePath);
  toGodotResourcePath(projectPath, atlasPackage.dataPath);

  const outputDirectory = path.dirname(atlasPackage.dataPath);
  const resourceFileName = safeGodotFileName(
    options.resourceFileName,
    `${atlasPackage.packageData.atlasId}.sprite_frames.tres`,
    ".tres",
  );
  const descriptorFileName = safeGodotFileName(
    options.descriptorFileName,
    `${atlasPackage.packageData.atlasId}.godot.json`,
    ".json",
  );
  const importerFileName = safeGodotFileName(
    options.importerFileName,
    `${atlasPackage.packageData.atlasId}.spriteframes.import.gd`,
    ".gd",
  );
  const resourcePath = path.join(outputDirectory, resourceFileName);
  const descriptorPath = path.join(outputDirectory, descriptorFileName);
  const importerPath = path.join(outputDirectory, importerFileName);
  toGodotResourcePath(projectPath, resourcePath);
  const descriptor = createGodotSpriteFramesDescriptor(
    atlasPackage,
    projectPath,
    resourcePath,
  );

  await atomicWrite(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  await atomicWrite(importerPath, GODOT_SPRITE_FRAMES_IMPORTER);

  return {
    descriptor,
    descriptorPath,
    importerPath,
    resourcePath,
    headlessCommand: [
      "godot",
      "--headless",
      "--path",
      projectPath,
      "--script",
      toGodotResourcePath(projectPath, importerPath),
      "--",
      toGodotResourcePath(projectPath, descriptorPath),
    ],
  };
}
