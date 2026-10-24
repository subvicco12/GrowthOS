import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeOrganizationFeature, type PlanAssignment, type CurrentPlanVerifier } from '../../server/organization-plan-authority';
import type { Entitlement } from '../types';

const plan: PlanAssignment = { organizationId: 'org', plan: 'free', revision: 1, issuer: 'synthetic',
  evidenceHash: 'a'.repeat(64), expiresAt: '2026-11-01T00:00:00.000Z', revokedAt: null };
const entitlement: Entitlement = { siteId: 'site', featureKey: 'manual-preview', mode: 'on',
  freeAccess: true, proAccess: true, businessAccess: true, quotaFree: 2, quotaPro: 20, quotaBusiness: 100,
  rolloutPercent: 100, emergencyKill: false, failSafe: 'deny', updatedAt: '2026-10-24T00:00:00Z' };
const verifier: CurrentPlanVerifier = { capability: 'trusted-plan-verifier', assertCurrent: async () => {} };
const base = { organizationId: 'org', websiteId: 'site', userId: 'user', role: 'viewer',
  assignment: plan, entitlement, reservedAndConsumedUnits: 0, globallyPaused: false,
  verifier, now: Date.parse('2026-10-24T12:00:00Z') };
test('synthetic verifier exercises plan decision without becoming production authority', async () => {
  assert.equal((await authorizeOrganizationFeature(base)).reason, 'ALLOWED');
  assert.equal((await authorizeOrganizationFeature({ ...base, assignment: { ...plan, plan: 'pro' } })).reason, 'ALLOWED');
  assert.equal((await authorizeOrganizationFeature({ ...base, assignment: { ...plan, plan: 'business' } })).reason, 'ALLOWED');
});
test('missing or stale independent plan authority fails closed', async () => {
  for (const changes of [{ verifier: null }, { assignment: null },
    { assignment: { ...plan, organizationId: 'foreign' } },
    { assignment: { ...plan, revokedAt: '2026-10-24T01:00:00Z' } },
    { assignment: { ...plan, expiresAt: '2026-10-23T00:00:00Z' } },
    { verifier: { ...verifier, assertCurrent: async () => { throw Error('TRUST_REVOKED'); } } }]) {
    await assert.rejects(authorizeOrganizationFeature({ ...base, ...changes }), /AUTHORITY|TRUST_REVOKED/);
  }
});
test('quota, emergency pause, website mismatch, and unknown usage deny', async () => {
  for (const changes of [{ reservedAndConsumedUnits: 2 }, { globallyPaused: true },
    { entitlement: { ...entitlement, emergencyKill: true } }, { websiteId: 'foreign' },
    { reservedAndConsumedUnits: null }, { role: 'anonymous' }]) {
    await assert.rejects(authorizeOrganizationFeature({ ...base, ...changes }), /DENIED|ENTITLED/);
  }
});
