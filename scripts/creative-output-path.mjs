#!/usr/bin/env node
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

const config = JSON.parse(await readFile(new URL("../config/creative-output-layout-v1.json", import.meta.url), "utf8"));
const [directory, requestedName] = process.argv.slice(2);
if (!directory || !requestedName) throw new Error("usage: node scripts/creative-output-path.mjs <configured-directory> <filename>");
if (!config.directories.includes(directory)) throw new Error(`CREATIVE_OUTPUT_DIRECTORY_NOT_ALLOWED:${directory}`);
const filename = basename(requestedName);
if (filename !== requestedName || filename === "." || filename === "..") throw new Error("CREATIVE_OUTPUT_FILENAME_INVALID");
const localAppData = process.env.LOCALAPPDATA || join(homedir(), ".local", "share");
const fallback = config.defaultRoot.replace(/^%LOCALAPPDATA%[\\/]/u, `${localAppData}/`);
const root = resolve(process.env[config.rootEnvironmentVariable] || fallback);
const targetDirectory = resolve(root, directory);
if (!(targetDirectory === root || targetDirectory.startsWith(`${root}${sep}`))) throw new Error("CREATIVE_OUTPUT_PATH_ESCAPE");
await mkdir(targetDirectory, { recursive: true });
const target = resolve(targetDirectory, filename);
if (!target.startsWith(`${targetDirectory}${sep}`)) throw new Error("CREATIVE_OUTPUT_TARGET_ESCAPE");
process.stdout.write(`${JSON.stringify({ studio: config.studio, root, directory: targetDirectory, target, overwriteAllowed: false }, null, 2)}\n`);
