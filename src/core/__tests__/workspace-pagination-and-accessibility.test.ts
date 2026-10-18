import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { nextPageCursor, readPageCursor } from '../../server/organization-pagination';
import { workspaceError } from '../../app/workspace-response';

const orgA = '00000000-0000-4000-8000-000000000001';
const orgB = '00000000-0000-4000-8000-000000000002';
const site = '00000000-0000-4000-8000-000000000003';
const request = (cursor: string) => new Request('https://example.invalid/?cursor=' + encodeURIComponent(cursor));

test('opaque cursor is bound to organization and stream', () => {
  const cursor = nextPageCursor(orgA, 'websites', 'example.invalid', site);
  assert.deepEqual(readPageCursor(request(cursor), orgA, 'websites'), { version: 1, organizationId: orgA, stream: 'websites', key: 'example.invalid', id: site });
  assert.throws(() => readPageCursor(request(cursor), orgB, 'websites'), /INVALID_CURSOR/);
  assert.throws(() => readPageCursor(request(cursor), orgA, 'approvals'), /INVALID_CURSOR/);
});

test('malformed, oversized and noncanonical cursors are refused', () => {
  for (const bad of ['!', 'x'.repeat(769), 'e30', Buffer.from('{"version":1}').toString('base64url')]) {
    assert.throws(() => readPageCursor(request(bad), orgA, 'websites'), /INVALID_CURSOR/);
  }
  const badTimestamp = nextPageCursor(orgA, 'features', 'not-a-timestamp', site);
  assert.throws(() => readPageCursor(request(badTimestamp), orgA, 'features'), /INVALID_CURSOR/);
});

test('HTTP state messages distinguish session expiry, role refusal and service failure', () => {
  assert.match(workspaceError(new Response(null, { status: 401 }), 'Registry').message, /Session expired/);
  assert.match(workspaceError(new Response(null, { status: 403 }), 'Registry').message, /Permission denied/);
  assert.match(workspaceError(new Response(null, { status: 503 }), 'Registry').message, /Registry unavailable/);
});

test('tablet and phone shell keeps labeled navigation, visible focus and touch targets', () => {
  const shell = readFileSync('src/app/page.tsx', 'utf8');
  const css = readFileSync('src/app/globals.css', 'utf8');
  assert.match(shell, /aria-label="Primary navigation"/);
  assert.match(shell, /aria-label="Mobile navigation"/);
  assert.match(shell, /aria-current=\{section===item.id/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /:focus-visible\{outline:3px/);
  assert.match(css, /\.mobileNav button\{min-height:44px/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test('mutation controls remain disable-only and onboarding cannot activate a site', () => {
  const registry = readFileSync('src/app/organization-website-registry.tsx', 'utf8');
  assert.match(registry, /enabled: false/);
  assert.match(registry, /Activation: unavailable/);
  assert.doesNotMatch(registry, /enabled: true|autoPublishEnabled: true/);
});
