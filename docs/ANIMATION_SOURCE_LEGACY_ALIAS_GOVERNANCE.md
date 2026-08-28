# Animation Source Legacy Alias Governance

## Purpose

The retired compatibility helpers in:

```text
scripts/lib/animation-source-bundle.mjs
```

must not regain production authority through a package alias, compiler path, browser remap, Deno import map, or scoped import-map entry.

The syntax-aware code scanner protects direct and computed code access. The configuration scanner closes the separate resolution layer where a harmless-looking specifier could otherwise resolve to the legacy library.

## Governed configuration

The local scanner inspects Git-tracked:

- `package.json` files;
- `tsconfig.json`, `tsconfig.*.json`, `jsconfig.json`, and `jsconfig.*.json` files;
- `deno.json` and `deno.jsonc` files;
- `import-map.json`, `import_map.json`, and `importmap.json` files.

It examines runtime or resolution-bearing fields:

- package `imports`;
- package `exports`;
- package `browser` remaps;
- TypeScript and JavaScript `compilerOptions.paths`;
- import-map `imports`;
- import-map `scopes`.

Documentation strings and unrelated metadata are not treated as executable aliases.

## Resolution rules

Every governed target is resolved from the configuration file's directory. TypeScript and JavaScript path targets use `compilerOptions.baseUrl` when supplied.

The scanner rejects:

- an exact path to the legacy library;
- a percent-encoded path to the legacy library;
- a `file:` URL to the legacy library;
- a wildcard target capable of resolving to the legacy library;
- a directory-prefix mapping capable of appending the legacy filename;
- conditional package exports containing any forbidden target;
- malformed governed JSON or JSONC;
- linked or unstable tracked configuration files.

The public CLI remains distinct and allowed:

```text
scripts/animation-source-bundle.mjs
```

An alias to the CLI does not resolve to the retired library under `scripts/lib` and therefore remains valid.

## Repository authority

Only Git-tracked configuration has repository authority. Untracked local experiments do not affect the report.

Tracked paths are decoded as strict UTF-8, required to be NFC, checked for traversal and portable case collisions, and read twice through one stable open file handle. Symbolic and hard-linked configuration files fail closed through the shared tracked-file boundary.

The guard is local-only and does not execute:

- providers;
- renderers;
- deployments;
- repository mutations;
- GitHub Actions;
- Vercel.

## Local verification

```powershell
node --check scripts/lib/animation-source-legacy-config-v2.mjs
node --test scripts/test-ci-media-tool-animation-source-legacy-v2-config.mjs
node --test scripts/test-ci-media-tool-animation-source-legacy-v2-config-docs.mjs
node --test scripts/test-ci-media-tool-animation-source-legacy-v2-*.mjs
pnpm check
```

The actual tracked Art Studio repository is scanned by the regression suite, so introducing a forbidden alias makes the local check fail before `main` can be updated.
