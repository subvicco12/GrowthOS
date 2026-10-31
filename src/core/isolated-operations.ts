import { z } from 'zod';
import { workflowScope } from './isolated-workflows';
const scope = workflowScope.shape;
export const operationsQuery = workflowScope.extend({ stream: z.enum(['overview','jobs','recommendations','events','attempts']), cursor: z.string().max(900).optional() }).strict();
export type OperationStream = z.infer<typeof operationsQuery>['stream'];
export const operationAction = z.discriminatedUnion('action', [
  z.object({ ...scope, action: z.enum(['tick','recover','revoke_ownership','expire_ownership','health','revoke_connector']) }).strict(),
  z.object({ ...scope, action: z.literal('enroll'), endpoint: z.string().url().max(2048), mode: z.literal('synthetic_readonly') }).strict(),
  z.object({ ...scope, action: z.literal('cancel'), jobId: z.string().uuid() }).strict(),
  z.object({ ...scope, action: z.literal('revoke_approval'), approvalId: z.string().uuid(), reason: z.string().trim().min(1).max(200) }).strict()
]);
const cursorSchema = z.object({ organizationId: z.string().uuid(), websiteId: z.string().uuid(), stream: z.enum(['jobs','recommendations','events','attempts']),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/), id: z.string().uuid() }).strict();
export type OperationCursor = z.infer<typeof cursorSchema>;
export function decodeOperationCursor(raw: string | undefined, organizationId: string, websiteId: string, stream: OperationStream): OperationCursor | null {
  if (raw === undefined) return null;
  try {
    if (!/^[A-Za-z0-9_-]{1,900}$/.test(raw)) throw Error();
    const bytes = Buffer.from(raw,'base64url'); if(bytes.toString('base64url')!==raw)throw Error();
    const cursor=cursorSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
    if(cursor.organizationId!==organizationId||cursor.websiteId!==websiteId||cursor.stream!==stream)throw Error();
    return cursor;
  } catch { throw Error('INVALID_CURSOR'); }
}
export function encodeOperationCursor(cursor: OperationCursor): string { return Buffer.from(JSON.stringify(cursor)).toString('base64url'); }
export function retryBackoffMs(attempts: number): number {
  if(!Number.isInteger(attempts)||attempts<1||attempts>3)throw Error('INVALID_ATTEMPTS');
  return Math.min(60000,5000*2**(attempts-1));
}
