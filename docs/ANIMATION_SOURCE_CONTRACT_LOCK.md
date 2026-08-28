# Animation Source Contract Lock

## Purpose

Art Studio and Cel Animation Studio carry separate copies of the Animation Source Bundle contract because their Node and pnpm toolchains are intentionally independent.

The contract lock prevents those copies from silently drifting.

It pins the exact bytes of:

```text
contracts/animation-source-bundle-v1.schema.json
contracts/fixtures/animation-source-bundle-v1.json
scripts/lib/animation-source-bundle.mjs
```

The lock is:

```text
contracts/animation-source-bundle-v1.lock.json
```

The current contract-set identity is:

```text
sha256:25494dbbf6a511850dd3b43b818cde01e36654666d3672bd8d08d8eb291e8f0b
```

## Local verification

Run from Art Studio:

```powershell
Set-Location "C:\GitRepos\evavo-art-studio"
node scripts/check-animation-source-contract-lock.mjs
```

The check does not use GitHub, a network service, Vercel, a provider or a writable automation bot. It reconstructs Git blob identities directly from local bytes and verifies the aggregate contract-set digest.

## Cross-studio verification

When the repositories are siblings under `C:\GitRepos`, the checker automatically detects Cel Animation Studio and verifies both copies.

Require the peer explicitly when the parity result is release evidence:

```powershell
node scripts/check-animation-source-contract-lock.mjs --require-peer
```

An explicit location can also be supplied:

```powershell
node scripts/check-animation-source-contract-lock.mjs `
  --peer "C:\GitRepos\cel-animation-studio" `
  --require-peer
```

The environment equivalent is:

```powershell
$env:EVAVO_ANIMATION_SOURCE_PEER_ROOT = "C:\GitRepos\cel-animation-studio"
node scripts/check-animation-source-contract-lock.mjs --require-peer
```

## Failure behaviour

The command fails when:

- a locked local file changes without a reviewed lock revision;
- the schema digest differs from the executable runtime constant;
- a lock contains unknown fields, missing files or duplicate paths;
- the aggregate contract-set digest is wrong;
- a required peer repository is absent;
- the peer lock differs;
- any peer schema, fixture or runtime byte differs.

It never repairs, copies or rewrites either repository. A contract change must be made deliberately in both studios, validated in both toolchains and committed as an explicit compatibility revision.

## Automated coverage

Art Studio runs:

```text
scripts/test-ci-media-tool-animation-source-contract-lock.mjs
```

through the existing `scripts/test-ci-media-tool-*.mjs` validation lane. The regression creates a temporary peer repository, proves an exact match, mutates one peer file and confirms that drift is rejected.
