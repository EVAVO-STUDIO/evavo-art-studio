# EVA dense-motion Cloudinary admission

This boundary starts only after all ten dense frames have passed deterministic technical inspection and genuine named-human creative review.

It has two offline commands:

```text
plan
admit
```

Neither command performs a Cloudinary network request.

## 1. Plan

```powershell
node scripts/run-project-art-eva-dense-motion-cloudinary-admission.mjs plan `
  --program 'C:\path\to\ten-master-program.json' `
  --workspace-root 'C:\path\to\eva-dense-workspace' `
  --output-root 'C:\path\to\cloudinary-run' `
  --prepared-at '2026-08-22T09:00:00.000Z'
```

The planner revalidates every frame's exact technical-inspection and named-human creative-approval evidence against the ten-master program and exact reviewed PNG bytes. Only then does it emit `cloudinary-upload-plan.json`.

For every ordinal the plan requires the exact work-order public ID and requests:

```text
resource_type: image
type: upload
format: png
overwrite: false
phash: true
backup: true
unique_filename: false
```

All ten reviewed frames must be ready before provider execution. Partial-family activation is forbidden.

## 2. Explicit external upload

A separately authorized networked executor may perform the ten uploads from the plan. Art Studio itself does not hold that authority in this boundary.

The provider executor must capture a manifest using schema:

```text
evavo.project-art-eva-dense-motion-cloudinary-provider-manifest.v1
```

and protocol:

```text
2026-08-22.2
```

Each provider frame must record:

- ordinal and frame id;
- provider `cloudinary`;
- cloud name `dntogqtey`;
- immutable asset id;
- exact planned public id;
- positive version;
- bytes, width `1024`, height `1536`, format `png`;
- ETag;
- exact versioned secure URL;
- local reviewed SHA-256;
- Cloudinary pHash;
- SHA-256 of the captured provider response;
- `createOnly: true`; and
- `overwrite: false`.

The manifest must contain ten unique asset IDs and ten unique public IDs/version identities.

## 3. Admit

```powershell
node scripts/run-project-art-eva-dense-motion-cloudinary-admission.mjs admit `
  --program 'C:\path\to\ten-master-program.json' `
  --workspace-root 'C:\path\to\eva-dense-workspace' `
  --output-root 'C:\path\to\cloudinary-run' `
  --upload-plan 'C:\path\to\cloudinary-upload-plan.json' `
  --provider-manifest 'C:\path\to\cloudinary-provider-manifest.json' `
  --admitted-at '2026-08-22T09:15:00.000Z'
```

Admission validates the captured provider identities against the exact planned local reviewed bytes and creates the semantic per-frame `master.cloudinary-upload.json` receipts consumed by later EVA release assembly.

The admitted `masteredAsset` shape is intentionally aligned with the dense release-evidence contract: provider, cloud name, asset ID, public ID, version, bytes, dimensions, format, ETag, secure URL, local master SHA-256, create-only, overwrite false and immutable true.

## Authority boundary

Planning and admission may read reviewed frame evidence and validate captured provider responses. They cannot:

- execute the provider or network;
- modify images;
- overwrite or delete Cloudinary assets;
- create a human decision;
- make an automatic creative decision;
- release a sequence;
- publish or deploy; or
- activate Avatar Runtime or website media.

The ten existing/fallback three-frame asset identities are not reusable for the dense ten-frame release. All ten dense ordinals require new immutable identities.
