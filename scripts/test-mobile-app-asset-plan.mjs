import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileMobileAppAssetPlan,
  isDirectExecution,
  MOBILE_ASSET_PLAN_SCHEMA,
  MobileAssetPlanError,
} from './compile-mobile-app-asset-plan.mjs';

function fixture() {
  return {
    schema: 'evavo.mobile-app-production-plan.v1',
    requestId: 'evavo-glasses-mobile-2026-08',
    source: {
      schema: 'evavo.mobile-app-production-brief.v1',
      sha256: 'a'.repeat(64),
    },
    app: {
      id: 'au.com.evavo.glasses',
      name: 'GODMODE',
      summary: 'A wearer-controlled EVAVO companion for approved smart glasses.',
    },
    platforms: ['android', 'ios'],
    runtimeRepository: 'EVAVO-STUDIO/evavo-glasses',
    context: {
      brand: {
        palette: { accent: '#FF244E', background: '#050507', text: '#FFFFFF' },
        typography: ['system-sans'],
        tone: 'Premium, restrained and non-generic.',
        suppliedAssetRefs: ['repository://brand/evavo-wordmark.svg'],
      },
      device: {
        productFamily: 'Chronus M02S family smart glasses',
        vendorCompanion: {
          name: 'HeyCyan',
          androidPackage: 'com.glasssutdio.wear',
          iosAppStoreId: '6742974094',
          role: 'Pairing recovery, Wi-Fi media transfer and firmware fallback only.',
        },
        capabilities: ['camera', 'microphone', 'bluetooth-audio'],
        constraints: ['no-hidden-capture', 'local-stop-always-wins'],
      },
      experience: {
        audiences: ['owner-wearer'],
        primaryJobs: ['pair-accessory', 'start-bounded-assistant'],
        requiredScreens: ['control', 'assist', 'glasses', 'media', 'safety'],
        safetyControls: ['stop-everything'],
        prohibitedClaims: ['privacy-guaranteed'],
      },
    },
    assetRequests: [
      {
        id: 'primary-app-icon',
        kind: 'app-icon',
        purpose: 'Recognisable EVAVO Glasses launcher and store identity.',
        platforms: ['android', 'ios'],
        runtimeTargets: {
          android: ['apps/mobile/android/app/src/main/res/drawable/ic_launcher_foreground.xml'],
          ios: ['apps/mobile/ios/Resources/Assets.xcassets/AppIcon.appiconset/GODMODE-1024.png'],
        },
        backgroundPolicy: 'opaque',
        visualConstraints: ['no-small-text', 'distinctive-at-32px', 'preserve-evavo-e-and-o'],
      },
    ],
    cooperation: {
      orchestration: 'EVAVO-STUDIO/evavo-development-studio',
      creativeProduction: 'EVAVO-STUDIO/evavo-art-studio',
      localExecution: 'EVAVO-STUDIO/evavo-local-storage',
      durableAssets: 'EVAVO-STUDIO/evavo-storage',
      runtimeOwner: 'EVAVO-STUDIO/evavo-glasses',
    },
    authority: {
      artStudioMayGenerateCandidates: true,
      artStudioMayPublishRuntimeMain: false,
      localStorageMayExecuteTrackedJobs: true,
      localStorageMayPublishRuntimeMain: false,
      developmentStudioMayValidateAndRoutePublication: true,
      successfulGenerationEqualsApproval: false,
      successfulVendorHandoffEqualsDeviceAuthority: false,
      humanApprovalRequired: true,
    },
    delivery: {
      candidateOnly: true,
      humanApprovalRequired: true,
      storageRoute: 'both',
      runtimePromotionOwner: 'EVAVO-STUDIO/evavo-glasses',
    },
  };
}

test('compiles deterministic context-rich candidate tasks', () => {
  const first = compileMobileAppAssetPlan(fixture());
  const second = compileMobileAppAssetPlan(fixture());
  assert.equal(first.schema, MOBILE_ASSET_PLAN_SCHEMA);
  assert.equal(first.planSha256, second.planSha256);
  assert.equal(first.tasks.length, 1);
  assert.equal(first.tasks[0].context.device.vendorCompanion.androidPackage, 'com.glasssutdio.wear');
  assert.equal(first.tasks[0].context.device.vendorCompanion.iosAppStoreId, '6742974094');
  assert.equal(first.tasks[0].production.provider.selection, 'unselected');
  assert.equal(first.tasks[0].production.provider.providerExecutionAuthorized, false);
  assert.equal(first.tasks[0].runtimeHandoff.directWriteAllowed, false);
  assert.match(first.tasks[0].workspace.root, /^workspace:\/\/mobile-apps\//u);
  assert.ok(first.tasks[0].production.proofMatrix.includes('16-24-32-48-64-128-pixel-legibility-strip'));
});

test('rejects weakened approval and publication authority', () => {
  const unsafe = fixture();
  unsafe.authority.artStudioMayPublishRuntimeMain = true;
  assert.throws(
    () => compileMobileAppAssetPlan(unsafe),
    (error) => error instanceof MobileAssetPlanError && error.code === 'authority_boundary_rejected',
  );

  const approvedByGeneration = fixture();
  approvedByGeneration.authority.successfulGenerationEqualsApproval = true;
  assert.throws(
    () => compileMobileAppAssetPlan(approvedByGeneration),
    (error) => error instanceof MobileAssetPlanError && error.code === 'authority_boundary_rejected',
  );
});

test('rejects traversal and secret-bearing plans', () => {
  const traversal = fixture();
  traversal.assetRequests[0].runtimeTargets.android = ['../../outside.png'];
  assert.throws(
    () => compileMobileAppAssetPlan(traversal),
    (error) => error instanceof MobileAssetPlanError && error.code === 'unsafe_runtime_target',
  );

  const secret = fixture();
  secret.providerCredential = 'ghp_abcdefghijklmnopqrstuvwxyz123456';
  assert.throws(
    () => compileMobileAppAssetPlan(secret),
    (error) => error instanceof MobileAssetPlanError && error.code === 'secret_key_rejected',
  );
});

test('CLI direct-execution detection is case-insensitive on Windows', () => {
  assert.equal(
    isDirectExecution(
      'C:\\GitRepos\\evavo-art-studio\\scripts\\compile-mobile-app-asset-plan.mjs',
      'c:\\gitrepos\\evavo-art-studio\\scripts\\compile-mobile-app-asset-plan.mjs',
      'win32',
    ),
    true,
  );
  assert.equal(
    isDirectExecution(
      'C:\\GitRepos\\evavo-art-studio\\scripts\\other.mjs',
      'C:\\GitRepos\\evavo-art-studio\\scripts\\compile-mobile-app-asset-plan.mjs',
      'win32',
    ),
    false,
  );
});
