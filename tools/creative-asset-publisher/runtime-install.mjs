import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractTar } from "./runtime-tar.mjs";
import { verifyExtractedRuntime } from "./runtime-verification.mjs";

export function installSealedRuntime(bundle) {
  const baseRoot = path.resolve(process.env.EVAVO_CREATIVE_ASSET_RUNTIME_ROOT || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "EVAVO", "creative-asset-publisher"));
  const runtimeRoot = path.join(baseRoot, bundle.bundleSha256);
  const marker = path.join(runtimeRoot, ".bundle-sha256");
  const markerValid = () => {
    if (!fs.existsSync(marker)) return false;
    const metadata = fs.lstatSync(marker);
    return metadata.isFile() && !metadata.isSymbolicLink() && fs.readFileSync(marker, "utf8") === `${bundle.bundleSha256}\n`;
  };
  if (!markerValid()) {
    fs.mkdirSync(baseRoot, { recursive: true, mode: 0o700 });
    const temporary = path.join(baseRoot, `.extract-${process.pid}-${crypto.randomBytes(6).toString("hex")}`);
    fs.mkdirSync(temporary, { mode: 0o700 });
    try {
      const archiveStats = extractTar(bundle.archive, temporary);
      if (archiveStats.entryCount !== bundle.entryCount || archiveStats.fileCount !== bundle.fileCount || archiveStats.totalFileBytes !== bundle.totalFileBytes) throw new Error("Runtime archive statistics do not match the descriptor.");
      const runtimeStats = verifyExtractedRuntime(temporary, bundle.expectedRuntime);
      if (runtimeStats.fileCount !== bundle.fileCount) throw new Error("Extracted runtime file count does not match the descriptor.");
      fs.writeFileSync(path.join(temporary, ".bundle-sha256"), `${bundle.bundleSha256}\n`, { flag: "wx", mode: 0o600 });
      try { fs.renameSync(temporary, runtimeRoot); }
      catch (error) {
        if (!markerValid()) throw error;
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    } catch (error) {
      fs.rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
  }
  if (!markerValid()) throw new Error("Installed runtime marker is absent or invalid.");
  const runtimeStats = verifyExtractedRuntime(runtimeRoot, bundle.expectedRuntime);
  if (runtimeStats.fileCount !== bundle.fileCount) throw new Error("Installed runtime file count does not match the descriptor.");
  return Object.freeze({ runtimeRoot, runtimeStats });
}
