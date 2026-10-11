/** Legacy global WordPress adapter disabled until tenant-bound authorization is implemented. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json(
    { ok: false, code: 'LEGACY_ADAPTER_DISABLED', message: 'Use the authenticated organization-scoped dashboard.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
