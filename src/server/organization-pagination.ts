import { z } from 'zod';

const cursorSchema = z.object({
  version: z.literal(1),
  organizationId: z.string().uuid(),
  stream: z.enum(['websites', 'approvals', 'features', 'decisions']),
  key: z.string().min(1).max(253),
  id: z.string().uuid()
}).strict();
export type PageStream = z.infer<typeof cursorSchema>['stream'];
export type PageCursor = z.infer<typeof cursorSchema>;
export const PAGE_SIZE = 25;
const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** A cursor is an untrusted position hint, never an authorization token. */
export function readPageCursor(request: Request, organizationId: string, stream: PageStream): PageCursor | null {
  const value = new URL(request.url).searchParams.get('cursor');
  if (value === null) return null;
  if (!/^[A-Za-z0-9_-]{1,768}$/.test(value)) throw Error('INVALID_CURSOR');
  let data: unknown;
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) throw Error('INVALID_CURSOR');
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw Error('INVALID_CURSOR'); }
  const parsed = cursorSchema.safeParse(data);
  if (!parsed.success || parsed.data.organizationId !== organizationId || parsed.data.stream !== stream ||
    (stream !== 'websites' && !timestamp.test(parsed.data.key))) throw Error('INVALID_CURSOR');
  return parsed.data;
}

export function nextPageCursor(organizationId: string, stream: PageStream, key: string, id: string): string {
  return Buffer.from(JSON.stringify({ version: 1, organizationId, stream, key, id })).toString('base64url');
}

export function pageError(error: unknown): Response {
  const code = error instanceof Error ? error.message : '';
  const status = code === 'INVALID_CURSOR' ? 400 : code === 'AUTHENTICATION_REQUIRED' ? 401 :
    code === 'ORGANIZATION_REQUIRED' || code === 'ORGANIZATION_FORBIDDEN' ? 403 : 503;
  return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code },
    { status, headers: { 'Cache-Control': 'no-store' } });
}
