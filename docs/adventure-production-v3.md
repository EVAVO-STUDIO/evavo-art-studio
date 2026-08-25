# Adventure Studio creative production v3

Art Studio may accept Adventure Studio work only through `contracts/adventure-creative-production-v3.schema.json` plus the producer's authoritative v3 work order.

## Authority

Adventure Studio owns project intent, production profile, native geometry, style/palette/layout/model-sheet/X-sheet digests, frame plan, transparency policy and acceptance criteria. Art Studio must not silently reinterpret those authorities.

## Iteration discipline

1. Validate the incoming work order before rendering or editing.
2. Preserve the approved native canvas and all authority digests.
3. Produce a candidate and retain its exact artifact digest.
4. Review against the work order at native/runtime presentation size.
5. Return structured v3 issues for every defect.
6. Prefer the smallest targeted repair that can close the issue.
7. Do not regenerate a whole approved asset when a local repair can preserve approved regions.
8. Maximum automatic revision passes are governed by the work order and may not exceed three.
9. Escalate unresolved blocking defects to human review rather than weakening the acceptance rule.
10. The delivered artifact digest must equal the accepted reviewed candidate digest.

## Transparency

For transparent adventure assets, checkerboard pixels, white/black baked mattes, matte residue, alpha halos and contaminated hidden RGB are defects. Transparency must be proven from decoded alpha data, not inferred from how a preview looks. Hostile-plate review is required when requested by the work order.

## Adventure backgrounds and foreground plates

Background/layout work must preserve authored perspective, walk-floor affordances, actor/object anchors, safe UI bounds, foreground separation and scene composition. Foreground occluders must remain separate transparent plates when requested; do not bake them back into the background.

## Character and prop consistency

When a model sheet, previous approved artifact or reference digest is authoritative, identity, proportions, costume construction, palette/shading logic and silhouette language must remain locked across revisions. Do not add generic AI micro-detail or independently redesign a character between assets.

## Review output

Every candidate returns an `AdventureCreativeReviewV3`-equivalent receipt with candidate digest, disposition, structured issues, closed issue IDs and the required alpha/style evidence digests. Only an accepted review can be converted into an accepted delivery receipt.
