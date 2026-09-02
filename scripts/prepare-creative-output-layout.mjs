#!/usr/bin/env node
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const config = JSON.parse(await readFile(new URL("../config/creative-output-layout-v1.json", import.meta.url), "utf8"));
const localAppData = process.env.LOCALAPPDATA || join(homedir(), ".local", "share");
const fallback = config.defaultRoot.replace(/^%LOCALAPPDATA%[\\/]/u, `${localAppData}/`);
const root = resolve(process.env[config.rootEnvironmentVariable] || fallback);
for (const directory of config.directories) await mkdir(resolve(root, directory), { recursive: true });
process.stdout.write(`${JSON.stringify({ studio: config.studio, root, directories: config.directories.map(directory => resolve(root, directory)) }, null, 2)}\n`);
