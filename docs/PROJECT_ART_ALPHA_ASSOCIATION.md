# Project Art alpha association contract

Real transparency is not enough by itself. A file can contain a correct alpha
plane and still develop dark, pale, green or magenta edge fringes when one tool
treats its RGB as straight alpha and another treats it as premultiplied alpha.

Art Studio now makes that boundary explicit.

## Terms

- **Straight alpha** stores the unassociated subject colour in RGB and coverage
  in alpha. This is the canonical Art Studio sprite, atlas and retained-master
  representation.
- **Premultiplied alpha** stores RGB already multiplied by alpha. This is often
  used by compositors, render targets and video or motion pipelines.
- Conversion is not a metadata rename. RGB bytes must be transformed.

## Governed operations

```json
{ "op": "alpha-premultiply" }
```

converts straight RGBA to premultiplied RGBA using deterministic nearest 8-bit
rounding. Pixels at alpha zero become transparent black because associated RGB
is mathematically zero there.

```json
{ "op": "alpha-unpremultiply", "mode": "strict" }
```

converts premultiplied RGBA to straight RGBA. Strict mode rejects either of the
following because the source does not satisfy the premultiplied-alpha invariant:

- an RGB channel greater than alpha;
- non-zero RGB at alpha zero.

For a damaged or quantised source, an explicit `mode: "clamp"` first clamps RGB
to alpha and then unpremultiplies. Clamp is a recovery operation, not proof that
the source was correctly encoded.

## Canonical atlas contract

Project Art atlases are encoded as straight RGBA and now publish:

```json
{
  "schema": "evavo.project-art-alpha-encoding.v1",
  "association": "straight",
  "premultiplied": false,
  "colourSpace": "srgb",
  "transparentRgbPolicy": "bounded-visible-rgb-bleed"
}
```

The same object is retained in the EVAVO manifest, TexturePacker-compatible
metadata, Phaser metadata, Godot region map and execution receipt. A downstream
importer therefore does not need to guess how RGB and alpha are associated.

## Photoshop, After Effects and video handoff

Before a round trip, record the expected alpha interpretation of the receiving
tool or codec. Do not compensate for a dark fringe by painting a light fringe,
or compensate for a green fringe by erasing more of the subject.

Use this sequence:

1. keep the immutable source and current straight-alpha master;
2. convert to premultiplied alpha only for a destination that explicitly needs
   associated RGB;
3. bind the conversion operation and source hash into the sandbox plan;
4. on return, unpremultiply in strict mode;
5. if the destination discarded RGB at alpha zero, run
   `hidden-rgb-rebuild` after unpremultiplication before filtered texture use;
6. proof the encoded output on black, white, middle-grey, green and magenta;
7. inspect linear filtering, scale reduction and mipmapped runtime output.

Do not premultiply twice. Do not unpremultiply a straight-alpha source. Both
mistakes alter visible edge colour even though the alpha plane remains valid.

## Relationship to background removal

Alpha association does not remove a matte, checkerboard or natural background.
The source must first pass the existing decoded-pixel transparency admission and
background-recovery path. The order is:

```text
source classification
  -> governed background recovery or native-alpha admission
  -> edge decontamination and hidden-RGB rebuild
  -> straight-alpha retained master
  -> explicit premultiply only when a destination requires it
```

## Safety boundary

These operations are deterministic pixel transforms inside the create-only
Project Art sandbox. They do not overwrite source files, approve candidates,
activate runtime assets, mutate another repository, deploy or publish. Unknown
conversion modes and invalid strict premultiplied pixels fail closed.

Regression coverage proves exact conversion, source immutability, transparent
zero handling, strict rejection, explicit clamp recovery and atlas metadata.
