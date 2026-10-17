/** Canonical public origin is operator configured; forwarding headers never establish trust. */
export function rejectUntrustedOrigin(request: Request): Response | null {
  const configured = process.env.GROWTHOS_APP_ORIGIN;
  let canonical: URL;
  try {
    if (!configured) throw new Error('MISSING_ORIGIN');
    canonical = new URL(configured);
    if (canonical.protocol !== 'https:' || canonical.origin !== configured || canonical.username || canonical.password || canonical.pathname !== '/' || canonical.search || canonical.hash)
      throw new Error('INVALID_ORIGIN');
  } catch {
    return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  if (request.headers.get('origin') !== configured || request.headers.get('host') !== canonical.host)
    return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return null;
}

export async function readBoundedJson(request: Request, limit = 4096): Promise<{ value: unknown; error?: never } | { value?: never; error: Response }> {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > limit))
    return { error: Response.json({ ok: false, code: 'REQUEST_TOO_LARGE' }, { status: 413 }) };
  try {
    const reader = request.body?.getReader();
    if (!reader) return { error: Response.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 }) };
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        try { await reader.cancel(); } catch { /* The oversize result is authoritative. */ }
        return { error: Response.json({ ok: false, code: 'REQUEST_TOO_LARGE' }, { status: 413 }) };
      }
      chunks.push(value);
    }
    // Buffer.toString silently replaces malformed UTF-8, which can change JSON keys or values.
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) };
  } catch {
    return { error: Response.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 }) };
  }
}
