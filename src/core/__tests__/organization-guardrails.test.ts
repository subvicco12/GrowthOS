import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWebsiteAdminAccess } from '../admin-website-access';

test('organization boundaries reject foreign memberships', () => {
  assert.throws(() => assertWebsiteAdminAccess({
    userId: 'member', organizationId: 'other', role: 'owner', active: true
  }, 'selected', 'register'), /UNAUTHORIZED_ORGANIZATION/);
});

test('viewers cannot register websites', () => {
  assert.throws(() => assertWebsiteAdminAccess({
    userId: 'member', organizationId: 'selected', role: 'viewer', active: true
  }, 'selected', 'register'), /INSUFFICIENT_ROLE/);
});
