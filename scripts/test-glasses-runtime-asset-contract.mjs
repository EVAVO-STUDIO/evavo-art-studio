import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plan = JSON.parse(
  readFileSync('config/mobile/evavo-glasses.production-plan.json', 'utf8'),
);

assert.equal(plan.schema, 'evavo.art-studio.mobile-design-contract.v1');
assert.equal(plan.product, 'EVAVO Glasses');
assert.equal(plan.runtimeRepository, 'EVAVO-STUDIO/evavo-glasses');
assert.equal(plan.brand.accent, '#FF244E');
assert.equal(plan.responsive.phone.layout, 'single-column');
assert.equal(plan.responsive.tablet.layout, 'two-column-dashboard');
assert.equal(plan.responsive.tablet.minimumWidthDp, 720);

const families = new Map(plan.assetFamilies.map((entry) => [entry.id, entry]));
const master = families.get('app-icon-master');
assert.equal(master?.status, 'existing-reviewed-runtime-identity');
assert.ok(master.runtimeTargets.ios.includes(
  'apps/mobile/ios/Resources/Assets.xcassets/AppIcon.appiconset/GODMODE-1024.png',
));

const adaptive = families.get('android-adaptive-icon');
assert.equal(adaptive?.status, 'integrated-reviewed-runtime-identity');
for (const target of [
  'apps/mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
  'apps/mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
  'apps/mobile/android/app/src/main/res/mipmap-anydpi-v33/ic_launcher.xml',
  'apps/mobile/android/app/src/main/res/mipmap-anydpi-v33/ic_launcher_round.xml',
  'apps/mobile/android/app/src/main/res/drawable/ic_launcher_foreground.xml',
  'apps/mobile/android/app/src/main/res/drawable/ic_launcher_monochrome.xml',
]) {
  assert.ok(adaptive.runtimeTargets.android.includes(target), `Missing shipped adaptive icon target: ${target}`);
}
assert.ok(adaptive.requirements.some((value) => value.includes('Android 13')));
assert.ok(adaptive.requirements.some((value) => value.includes('themed icon')));

const texture = families.get('control-surface-texture');
assert.equal(texture?.status, 'platform-native-integrated');
assert.ok(texture.requirements.some((value) => value.includes('iOS')));
assert.ok(texture.requirements.some((value) => value.includes('Android')));

assert.equal(plan.review.humanOrGovernedReviewRequired, true);
assert.equal(plan.authority.mayGenerateCandidates, true);
assert.equal(plan.authority.mayApproveAssets, false);
assert.equal(plan.authority.mayWriteRuntimeRepository, false);
assert.equal(plan.authority.mayTreatGenerationAsApproval, false);
assert.equal(plan.authority.mayChangeProductIdentityWithoutApproval, false);

console.log('Validated shipped GODMODE runtime assets, responsive contract and candidate authority boundary.');
