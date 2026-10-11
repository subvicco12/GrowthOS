/** Legacy global WordPress approval adapter disabled until tenant-bound authorization is implemented. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  return Response.json(
    { ok: false, code: 'LEGACY_ADAPTER_DISABLED', message: 'Approvals require organization-scoped authorization.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
