import assert from 'node:assert/strict';
import test from 'node:test';
import { websiteFeaturePatchSchema, canDisableWebsiteFeature } from '../website-feature-controls';

const websiteId = '33333333-3333-4333-8333-333333333333';

test('feature requests are disable-only', () => {
  for (const feature of ['automation', 'auto_publish']) {
    assert.equal(websiteFeaturePatchSchema.safeParse({ websiteId, feature, enabled: false }).success, true);
    assert.equal(websiteFeaturePatchSchema.safeParse({ websiteId, feature, enabled: true }).success, false);
  }
});

test('disable controls are restricted to owners and admins', () => {
  assert.equal(canDisableWebsiteFeature('owner'), true);
  assert.equal(canDisableWebsiteFeature('admin'), true);
  assert.equal(canDisableWebsiteFeature('editor'), false);
  assert.equal(canDisableWebsiteFeature('viewer'), false);
});

test('feature schema rejects unknown features, malformed IDs, missing fields and extra keys', () => {
  const invalid = [
    { websiteId, feature: 'billing', enabled: false },
    { websiteId: 'not-a-uuid', feature: 'automation', enabled: false },
    { websiteId, feature: 'automation' },
    { websiteId, feature: 'automation', enabled: 0 },
    { websiteId, feature: 'automation', enabled: null },
    { websiteId, feature: 'automation', enabled: false, organizationId: 'foreign' },
    { websiteId, feature: 'auto_publish', enabled: false, actorId: 'admin' },
  ];
  for (const payload of invalid) {
    assert.equal(websiteFeaturePatchSchema.safeParse(payload).success, false, JSON.stringify(payload));
  }
});

test('unknown roles cannot disable features', () => {
  for (const role of ['', 'OWNER', 'superadmin', 'anonymous', 'billing']) {
    assert.equal(canDisableWebsiteFeature(role), false);
  }
});
