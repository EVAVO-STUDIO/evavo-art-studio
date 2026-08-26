# Web Project Pack Art Production

A web project pack is not a collection of prompts, placeholder rectangles or generated descriptions. Art Studio treats those as planning material only.

For an EVAVO client website, actual visual assets follow the same governed provider and mastering boundaries as other Art Studio work.

## Production sequence

```text
approved creative direction + asset request
  -> decide source strategy
     -> client-supplied source
     -> rights-cleared sourced media
     -> governed provider generation/edit
  -> immutable candidate/source artifact
  -> provenance and exact byte hash
  -> candidate review / ranking
  -> promotion or named review
  -> professional mastering
  -> responsive crop/derivative production
  -> approved master + derivative manifest
  -> project-local delivery under public/media where appropriate
  -> BeeStation project retention through evavo-local-storage
  -> optional EVAVO Storage ingest/index/replication
```

## Generated visuals

Generated web visuals must execute through an admitted Art Studio provider. A compiled prompt or work order alone is not execution evidence.

Prefer a governed local ComfyUI profile when:

- a reviewed API workflow profile exists for the required visual job;
- its pinned model/workflow/runtime is suitable for the art direction;
- references can be bound by exact hashes;
- the local worker can retain provider and output evidence.

Otherwise use another explicitly admitted Art Studio image provider such as the governed OpenAI image adapter. Provider output is always an unapproved intermediate candidate.

Never use a generic code-drawn placeholder as the production visual merely because provider execution is unavailable.

## Client identity

A client's face or personal identity remains source-led. Do not invent a client portrait from text. If clean client photography is missing, retain that as an asset dependency and design a temporary typographic/atmospheric treatment rather than presenting an invented portrait as the client.

Reference-board screenshots, collages and moodboards are source evidence, not clean photography. They may guide composition and palette but must not silently become production hero masters.

## Sourced media

Rights-cleared stock can be better than generated media for venue, city, dress-code and atmosphere support. Retain source URL, usage/licence basis, downloaded-byte hash and final art-direction review. Stock is supporting material and must not replace personal/client identity by convenience.

## Delivery and storage

Approved web derivatives can be compiled through `compile-project-local-web-asset-delivery.mjs` and the existing governed workspace handoff. That path keeps source masters outside `public/`, publishes only approved web derivatives, and makes Cloudinary optional.

Durable project records are retained through the storage authorities rather than by Art Studio writing BeeStation physical paths itself:

- `EVAVO-STUDIO/evavo-local-storage` — exact BeeStation/local artifact bytes and retention receipts;
- `EVAVO-STUDIO/evavo-storage` — logical/index/remote storage and the stricter Art ingest path where useful.

Art Studio should provide exact source/output hashes, byte counts, provenance and approval state so the coordinator can create the standard project artifact index and execute `evavo-local-storage-project-retention`.

## Done standard

A production web asset is done only when:

- source strategy is explicit;
- rights/provenance are known;
- generated work has actual provider execution evidence;
- client identity is source-bound;
- candidate approval/promotion is explicit;
- mastering is completed;
- mobile/tablet/desktop crop or responsive use has been reviewed where relevant;
- web derivative bytes are exact and optimized;
- project-local handoff is verified;
- durable BeeStation retention receipt exists for the required project milestone.
