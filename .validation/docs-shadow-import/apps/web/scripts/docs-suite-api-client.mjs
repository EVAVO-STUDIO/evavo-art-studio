export function resolveDocsSuiteApiConfiguration(environment = process.env) {
  const token = environment.EVAVO_DOCS_TOKEN?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("EVAVO_DOCS_TOKEN_INVALID");
  }
  const baseUrl = new URL(environment.EVAVO_DOCS_URL ?? "https://docs.evavo.com.au");
  const loopback = baseUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
  if (baseUrl.protocol !== "https:" && !loopback) throw new Error("EVAVO_DOCS_URL_REQUIRES_HTTPS");
  baseUrl.pathname = "/";
  return Object.freeze({ token, baseUrl });
}
