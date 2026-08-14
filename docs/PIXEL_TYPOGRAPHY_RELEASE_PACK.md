# Pixel Typography Release Pack

Pixel Typography Release Pack creates a portable, offline handoff that keeps the authoritative Pixel Typography Review package beside its non-authoritative CRT Presentation package without flattening the distinction between them.

```text
font master
    -> Pixel Typography Review        authoritative native/display evidence
        -> CRT Presentation           non-authoritative presentation treatment
            -> Release Pack           portable retained handoff and offline index
```

The release pack does not redraw art, approve creative direction, modify either source package, install files into another repository, commit or push Git, deploy, publish, force-push, or rewrite history.

## Why this layer exists

A CRT preview is useful for period presentation, but it must never silently replace the native pixel grid or validated display-aspect evidence. A release pack makes that boundary obvious to reviewers and delivery recipients while binding every retained byte to one deterministic manifest.

It also prevents a common handoff failure where screenshots, native pages, display-corrected pages, and CRT treatments are copied into an unstructured folder with no reliable indication of which files are authoritative.

## Inputs

A build requires both of these already-generated packages:

```text
<review>/pixel-typography-review.json
<crt>/pixel-typography-crt.json
```

Before any copy begins, the tool invokes the repository's fixed validators with `shell=False`:

```text
tools/pixel_typography_review.py validate-output
tools/pixel_typography_crt_preview.py validate-output
```

The CRT validator receives the exact review package supplied to the release build, so a CRT package cannot be repackaged against unrelated review evidence.

## Output

```text
<release>/
  review/                              retained authoritative review package
  crt/                                 retained CRT presentation package
  index.html                           offline visual index
  README.md                            concise handoff boundary and identities
  pixel-typography-release-pack.json   canonical self-hashed manifest
```

The offline index recognises and labels native authoritative pages, display-aspect authoritative pages, CRT presentation pages, and native, display, and CRT integer-inspection previews.

It loads no external font, script, image, stylesheet, analytics service, or network resource. Source pixels are linked directly from the retained packages and are not re-encoded.

## CLI

### Capability contract

```powershell
python tools\pixel_typography_release_pack.py catalog
```

### Build

The output path must not exist:

```powershell
python tools\pixel_typography_release_pack.py build `
  --review C:\EVAVO\pixel-typography-reviews\heavy-metal-fighting `
  --crt C:\EVAVO\pixel-typography-crt\heavy-metal-fighting `
  --output C:\EVAVO\pixel-typography-releases\heavy-metal-fighting `
  --label "HEAVY METAL FIGHTING pixel typography review"
```

### Independent validation

```powershell
python tools\pixel_typography_release_pack.py validate-output `
  --output C:\EVAVO\pixel-typography-releases\heavy-metal-fighting
```

Validation reopens the canonical manifest, verifies its self-hash, rejects added or missing files, recomputes every file SHA-256 and both retained source-tree identities, reconstructs the page map, recomputes the release digest, and reruns the original Review and CRT validators against the retained copies.

### Deterministic comparison

```powershell
python tools\pixel_typography_release_pack.py compare `
  --first C:\EVAVO\pixel-typography-releases\hmf-a `
  --second C:\EVAVO\pixel-typography-releases\hmf-b
```

A match requires both independently validated packages to have the same manifest self-hash and release digest.

### Focused internal checks

```powershell
python tools\pixel_typography_release_pack.py self-test
```

The focused suite covers deterministic rebuilding, HTML escaping, create-only output, retained-file tampering, unexpected-file rejection, and symlink rejection where the host permits symlink creation.

## Determinism and safety

The implementation uses only Python's standard library. It provides:

- create-only output;
- sibling temporary staging and atomic final rename;
- fixed validator entrypoints with no shell;
- sorted canonical JSON;
- SHA-256 identities for every retained file;
- source-package tree hashes;
- a complete output inventory;
- a self-hashed canonical manifest;
- strict regular-file handling;
- symlink rejection in source, output, and parent paths;
- overlap rejection between Review, CRT, and output roots;
- bounded file-count and byte-count safety limits;
- escaped human labels and paths in the offline HTML index;
- no timestamps, absolute source paths, random output data, or external network dependency in retained output.

The random suffix used for the temporary staging directory is never retained and therefore cannot affect output identity.

## Authority boundary

A technically valid release pack proves that retained bytes match validated source packages and that the package structure is deterministic. It does not prove that the typography is creatively approved or ready to install into a game.

The manifest explicitly denies authority for:

```text
authoritative review approval
creative approval
source-review mutation
CRT-source mutation
font-master mutation
target-repository mutation
Git commit or push
deployment or publication
force push or history rewrite
```

Installation and repository publication remain separate, ownership-safe transactions.
