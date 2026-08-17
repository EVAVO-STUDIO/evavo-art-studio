# EVA identity-motion release

This boundary records the exact three-frame high-resolution identity family
consumed by Avatar Runtime `0.36.0`.

## Evidence

All three images:

- are `1024 × 1536` PNGs;
- came from the adjacent `repair-eva-153620-05` source family;
- completed Cloudinary AI background removal with confidence `1`;
- have immutable asset IDs, versions, byte counts, ETags and pHashes;
- remain within a maximum pHash Hamming distance of `6`;
- keep face-centre movement below eight pixels.

The release order is:

```text
previous → middle → following → middle
```

Runtime presentation continuously samples that loop at a 60 fps display
cadence with `smootherstep` crossfade. The mouth patch uses the same source and
next textures and the same blend weights as the full body. Speech visemes may
alter only bounded mouth geometry; they cannot select a full-character frame.

## Authority

The Art Studio compiler records technical admission evidence only. It does not
claim an independent human creative approval and cannot execute providers,
mutate source images, approve or promote candidates, activate the runtime,
commit, push, deploy or publish.
