import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import type { RepositoryArtFile, RepositoryArtSnapshot } from "@evavo/art-contracts";

export interface RepositoryInspectionOptions {
  readonly maximumFiles?: number;
  readonly maximumDepth?: number;
  readonly maximumRecordedArtFiles?: number;
}

const ignoredDirectories = new Set([".git", ".godot", ".next", "node_modules", "dist", "build", "coverage", ".cache", ".turbo"]);
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".bmp", ".tga", ".tif", ".tiff", ".svg", ".exr", ".hdr"]);
const animationExtensions = new Set([".apng", ".mp4", ".webm", ".mov", ".mkv"]);
const fontExtensions = new Set([".ttf", ".otf", ".woff", ".woff2"]);
const engineExtensions = new Set([".tres", ".res", ".tscn", ".scn", ".import", ".godot"]);
const sourceExtensions = new Set([".psd", ".ase", ".aseprite", ".kra", ".xcf", ".ai", ".afdesign", ".blend"]);
const metadataExtensions = new Set([".json", ".yaml", ".yml", ".toml", ".xml", ".atlas"]);

function categoryFor(extension: string): RepositoryArtFile["category"] {
  if (imageExtensions.has(extension)) return "image";
  if (animationExtensions.has(extension)) return "animation";
  if (fontExtensions.has(extension)) return "font";
  if (engineExtensions.has(extension)) return "engine-resource";
  if (sourceExtensions.has(extension)) return "source-art";
  if (metadataExtensions.has(extension)) return "metadata";
  return "other";
}

function parseGodotVersion(content: string): string | undefined {
  const match = content.match(/config\/features\s*=\s*PackedStringArray\(([^)]+)\)/);
  if (!match?.[1]) return undefined;
  const versions = [...match[1].matchAll(/"([0-9]+(?:\.[0-9]+){1,2})"/g)].map((entry) => entry[1]).filter((entry): entry is string => Boolean(entry));
  return versions[0];
}

function parseGodotViewport(content: string): { width: number; height: number } | undefined {
  const width = content.match(/display\/window\/size\/viewport_width\s*=\s*(\d+)/)?.[1]
    ?? content.match(/display\/window\/size\/window_width_override\s*=\s*(\d+)/)?.[1];
  const height = content.match(/display\/window\/size\/viewport_height\s*=\s*(\d+)/)?.[1]
    ?? content.match(/display\/window\/size\/window_height_override\s*=\s*(\d+)/)?.[1];
  if (!width || !height) return undefined;
  return { width: Number(width), height: Number(height) };
}

function inferGaps(files: readonly RepositoryArtFile[], engine: RepositoryArtSnapshot["engine"]): string[] {
  const names = files.map((file) => file.path.toLowerCase());
  const gaps: string[] = [];
  if (!names.some((name) => /(?:^|\/)(?:icon|app-icon|favicon)(?:[._-]|$)/.test(name))) gaps.push("No clearly named application or game icon was found.");
  if (!names.some((name) => /(?:splash|title|menu|main-menu)/.test(name))) gaps.push("No clearly named splash, title or main-menu artwork was found.");
  if (!names.some((name) => /(?:ui|hud|interface)/.test(name))) gaps.push("No clearly named UI or HUD asset area was found.");
  if (engine === "godot" && !files.some((file) => file.extension === ".tres" && /sprite|frame|atlas/i.test(file.path))) gaps.push("No clearly named Godot SpriteFrames or atlas resource was found.");
  if (!files.some((file) => file.category === "source-art")) gaps.push("No editable source-art files were found; masters may not be revision-safe.");
  return gaps;
}

export async function inspectRepository(rootInput: string, options: RepositoryInspectionOptions = {}): Promise<RepositoryArtSnapshot> {
  const root = await realpath(rootInput);
  const maximumFiles = options.maximumFiles ?? 25_000;
  const maximumDepth = options.maximumDepth ?? 14;
  const maximumRecordedArtFiles = options.maximumRecordedArtFiles ?? 5_000;
  const queue: Array<{ absolute: string; depth: number }> = [{ absolute: root, depth: 0 }];
  const artFiles: RepositoryArtFile[] = [];
  const extensionCounts: Record<string, number> = {};
  const categoryCounts: Record<RepositoryArtFile["category"], number> = {
    image: 0,
    animation: 0,
    font: 0,
    "engine-resource": 0,
    "source-art": 0,
    metadata: 0,
    other: 0,
  };
  let filesScanned = 0;
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.depth > maximumDepth) {
      truncated = true;
      continue;
    }
    const entries = await readdir(current.absolute, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (filesScanned >= maximumFiles) {
        truncated = true;
        queue.length = 0;
        break;
      }
      const absolute = path.join(current.absolute, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) queue.push({ absolute, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = await lstat(absolute);
      if (stats.isSymbolicLink()) continue;
      filesScanned += 1;
      const extension = path.extname(entry.name).toLowerCase();
      extensionCounts[extension || "<none>"] = (extensionCounts[extension || "<none>"] ?? 0) + 1;
      const category = categoryFor(extension);
      categoryCounts[category] += 1;
      if (category !== "other" && artFiles.length < maximumRecordedArtFiles) {
        artFiles.push({
          path: path.relative(root, absolute).split(path.sep).join("/"),
          extension,
          sizeBytes: stats.size,
          category,
        });
      }
    }
  }

  let engine: RepositoryArtSnapshot["engine"] = "unknown";
  let engineVersionHint: string | undefined;
  let viewport: { width: number; height: number } | undefined;
  let projectName = path.basename(root);
  const signals: string[] = [];

  try {
    const godot = await readFile(path.join(root, "project.godot"), "utf8");
    engine = "godot";
    engineVersionHint = parseGodotVersion(godot);
    viewport = parseGodotViewport(godot);
    const name = godot.match(/config\/name\s*=\s*"([^"]+)"/)?.[1];
    if (name) projectName = name;
    signals.push("Found project.godot at repository root.");
    if (engineVersionHint) signals.push(`Godot feature version hint: ${engineVersionHint}.`);
    if (viewport) signals.push(`Configured viewport: ${viewport.width}×${viewport.height}.`);
  } catch {
    try {
      const unityVersion = await readFile(path.join(root, "ProjectSettings", "ProjectVersion.txt"), "utf8");
      engine = "unity";
      const version = unityVersion.match(/m_EditorVersion:\s*([^\r\n]+)/)?.[1]?.trim();
      if (version) engineVersionHint = version;
      signals.push("Found Unity ProjectSettings/ProjectVersion.txt.");
    } catch {
      try {
        const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { name?: unknown };
        engine = "web";
        if (typeof packageJson.name === "string" && packageJson.name.length > 0) projectName = packageJson.name;
        signals.push("Found a web package.json at repository root.");
      } catch {
        signals.push("No supported engine marker was found at repository root.");
      }
    }
  }

  const snapshot: RepositoryArtSnapshot = {
    schemaVersion: "1.0",
    root,
    projectName,
    engine,
    filesScanned,
    artFiles,
    extensionCounts,
    categoryCounts,
    signals,
    gaps: inferGaps(artFiles, engine),
    truncated,
    ...(engineVersionHint ? { engineVersionHint } : {}),
    ...(viewport ? { viewport } : {}),
  };
  return snapshot;
}

export function assertPathWithinAllowedRoots(candidate: string, allowedRoots: readonly string[]): string {
  const resolved = path.resolve(candidate);
  const allowed = allowedRoots.some((root) => {
    const base = path.resolve(root);
    const relative = path.relative(base, resolved);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
  if (!allowed) throw new Error("Repository path is outside EVAVO_ART_ALLOWED_ROOTS.");
  return resolved;
}
