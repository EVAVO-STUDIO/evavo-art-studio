# Source bridge review checklist

## Deterministic source evidence

- [ ] The supplied Runtime checkout resolves to the expected private repository checkout.
- [ ] All ten source paths exist as ordinary non-symlink files.
- [ ] Every source Git blob SHA-1 matches the v2 programme.
- [ ] Every PNG passes complete chunk, CRC, decode, filter, encoding and canvas checks.
- [ ] The preflight reports ten distinct ordinals and ten distinct source paths.

## Materialisation evidence

- [ ] No candidate or receipt path exists before the run.
- [ ] Every candidate SHA-256 and Git blob SHA-1 equals its source.
- [ ] Every candidate byte length equals its source.
- [ ] Every materialisation receipt records `exactSourceBytes: true` and `transformed: false`.
- [ ] The campaign receipt records ten candidates, ten inspection receipts and ten materialisation receipts.
- [ ] A replay re-verifies source files, candidate files and semantic receipt hashes.

## Closed downstream authority

- [ ] Candidate assurance remains false.
- [ ] Alpha matte review and alpha mastering remain false.
- [ ] Technical and creative approvals remain false.
- [ ] Cloudinary upload and sequence release remain false.
- [ ] Runtime and website activation remain false.
- [ ] The live three-frame fallback remains unchanged.
