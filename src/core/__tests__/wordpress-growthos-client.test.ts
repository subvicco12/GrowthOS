import test from 'node:test';
import assert from 'node:assert/strict';
import { createWordPressGrowthOSClient } from '../wordpress-growthos-client';

test('requires HTTPS for remote WordPress connectors', () => {
  assert.throws(
    () => createWordPressGrowthOSClient({ baseUrl: 'http://example.com', username: 'u', applicationPassword: 'p' }),
    /WORDPRESS_CONNECTOR_HTTPS_REQUIRED/,
  );
});

test('requires connector credentials', () => {
  assert.throws(
    () => createWordPressGrowthOSClient({ baseUrl: 'https://example.com', username: '', applicationPassword: 'p' }),
    /WORDPRESS_CONNECTOR_CREDENTIALS_REQUIRED/,
  );
});

test('normalizes the base URL and sends application-password authentication', async () => {
  const originalFetch = globalThis.fetch;
  let seenUrl = '';
  let seenHeaders: HeadersInit | undefined;
  globalThis.fetch = (async (input, init) => {
    seenUrl = String(input);
    seenHeaders = init?.headers;
    return new Response(JSON.stringify({ ok: true, version: '1.0.9', host: 'example.com' }), { status: 200 });
  }) as typeof fetch;

  try {
    const client = createWordPressGrowthOSClient({
      baseUrl: 'https://example.com/',
      username: 'growth',
      applicationPassword: 'secret',
    });
    const result = await client.health();
    assert.equal(result.ok, true);
    assert.equal(seenUrl, 'https://example.com/wp-json/growthos/v1/health');
    assert.equal((seenHeaders as Record<string, string>).authorization, 'Basic Z3Jvd3RoOnNlY3JldA==');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('maps query parameters for site-scoped reads', async () => {
  const originalFetch = globalThis.fetch;
  let seenUrl = '';
  globalThis.fetch = (async input => {
    seenUrl = String(input);
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;

  try {
    const client = createWordPressGrowthOSClient({
      baseUrl: 'https://example.com',
      username: 'growth',
      applicationPassword: 'secret',
    });
    await client.healthScore('6');
    assert.equal(seenUrl, 'https://example.com/wp-json/growthos/v1/health-score?site_id=6');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
