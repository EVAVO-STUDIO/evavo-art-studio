import path from "node:path";

/**
 * Resolve a local CLI path, including the `/C:/...` pathname shape produced by
 * URL.pathname on Windows. Keeping this at the CLI boundary prevents Node's
 * path resolver from turning it into `<drive>:\C:\...`.
 */
export function resolveLocalPath(value: string): string {
  const normalized =
    process.platform === "win32" && /^\/[a-zA-Z]:[\\/]/u.test(value)
      ? value.slice(1)
      : value;
  return path.resolve(normalized);
}
