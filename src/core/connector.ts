import { z } from 'zod';

export const connectorEnvelopeSchema = z.object({
  siteId: z.string().uuid(),
  timestamp: z.string().datetime(),
  nonce: z.string().min(16),
  requestId: z.string().min(8),
  signature: z.string().min(32),
});

export const siteSnapshotSchema = z.object({
  wordpressVersion: z.string().optional(),
  phpVersion: z.string().optional(),
  theme: z.object({ name: z.string(), version: z.string().optional() }).optional(),
  plugins: z.array(z.object({
    name: z.string(),
    version: z.string().optional(),
    active: z.boolean(),
  })).default([]),
  routes: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  capturedAt: z.string().datetime(),
});

export type ConnectorEnvelope = z.infer<typeof connectorEnvelopeSchema>;
export type SiteSnapshot = z.infer<typeof siteSnapshotSchema>;

export interface ConnectorCommand<T = unknown> {
  commandId: string;
  type: string;
  payload: T;
  idempotencyKey: string;
  requestedAt: string;
}

// Contract intentionally separates transport validation from authorization.
// Signature, nonce replay protection, site membership, role, feature state and
// command allow-list must all be verified server-side before mutation.
