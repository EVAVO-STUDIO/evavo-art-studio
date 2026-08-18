import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contract = JSON.parse(
  readFileSync('config/mobile/evavo-glasses.production-plan.json', 'utf8'),
);

function family(id) {
  return contract.assetFamilies.find((entry) => entry.id === id);
}

test('EVAVO Glasses design contract binds the canonical runtime owners', () => {
  assert.equal(contract.schema, 'evavo.art-studio.mobile-design-contract.v1');
  assert.equal(contract.runtimeRepository, 'EVAVO-STUDIO/evavo-glasses');
  assert.equal(contract.integrationOwner, 'EVAVO-STUDIO/evavo-development-studio');
  assert.equal(contract.storageOwner, 'EVAVO-STUDIO/evavo-local-storage');
});

test('mobile layout rules cover phone and tablet accessibility', () => {
  assert.equal(contract.responsive.phone.layout, 'single-column');
  assert.equal(contract.responsive.phone.minimumTouchTargetDp, 48);
  assert.equal(contract.responsive.phone.minimumTouchTargetPt, 44);
  assert.equal(contract.responsive.tablet.minimumWidthDp, 720);
  assert.equal(contract.responsive.tablet.layout, 'two-column-dashboard');
  assert.equal(contract.responsive.tablet.iosMetricColumns, 4);
  assert.equal(contract.responsive.tablet.iosQuickModeColumns, 3);
  assert.ok(contract.responsive.accessibility.includes('reflow-before-text-truncation'));
});

test('app identity points to the shipped iOS and Android icon surfaces', () => {
  const icon = family('app-icon-master');
  assert.ok(icon);
  assert.equal(icon.status, 'existing-reviewed-runtime-identity');
  assert.deepEqual(icon.platforms, ['ios', 'android']);
  assert.ok(icon.runtimeTargets.ios.includes(
    'apps/mobile/ios/Resources/Assets.xcassets/AppIcon.appiconset/GODMODE-1024.png',
  ));
  assert.ok(icon.runtimeTargets.android.includes(
    'apps/mobile/android/app/src/main/res/mipmap-anydpi/ic_launcher.xml',
  ));
});

test('adaptive icon and dashboard texture remain candidate governed', () => {
  const adaptive = family('android-adaptive-icon');
  const texture = family('control-surface-texture');
  assert.equal(adaptive.status, 'candidate-only');
  assert.ok(adaptive.requirements.some((item) => item.includes('themed icons')));
  assert.equal(texture.status, 'procedural-preferred');
  assert.ok(texture.requirements.includes('no baked noise image when native rendering is sufficient'));
});

test('Art Studio cannot silently publish or approve runtime identity changes', () => {
  assert.equal(contract.review.candidateOnly, true);
  assert.equal(contract.review.phoneAndTabletReviewRequired, true);
  assert.equal(contract.authority.mayGenerateCandidates, true);
  assert.equal(contract.authority.mayApproveAssets, false);
  assert.equal(contract.authority.mayWriteRuntimeRepository, false);
  assert.equal(contract.authority.mayCommitOrPushRuntimeRepository, false);
  assert.equal(contract.authority.mayTreatGenerationAsApproval, false);
  assert.equal(contract.authority.mayChangeProductIdentityWithoutApproval, false);
});
