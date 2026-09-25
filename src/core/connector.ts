import { z } from 'zod';

export const connectorEnvelopeSchema = z.object({
  siteId: z.union([z.string().uuid(), z.string().regex(/^[1-9]\\d*$/)]),
  timestamp: z.string().datetime(),
  nonce: z.string().min(16).max(128),
  requestId: z.string().min(8).max(128),
  signature: z.string().regex(/^[0-9a-f]{64}$/i),
}).strict();

export const siteSnapshotSchema = z.object({
  wordpressVersion: z.string().max(64).optional(),
  phpVersion: z.string().max(64).optional(),
  theme: z.object({ name: z.string().max(200), version: z.string().max(64).optional() }).strict().optional(),
  plugins: z.array(z.object({
    name: z.string().max(200),
    version: z.string().max(64).optional(),
    active: z.boolean(),
  }).strict()).max(500).default([]),
  routes: z.array(z.string().max(2048)).max(10000).default([]),
  features: z.array(z.string().max(200)).max(5000).default([]),
  capturedAt: z.string().datetime(),
}).strict();

export type ConnectorEnvelope = z.infer<typeof connectorEnvelopeSchema>;
export type SiteSnapshot = z.infer<typeof siteSnapshotSchema>;

export interface ConnectorCommand<T = unknown> {
  commandId: string;
  type: string;
  payload: T;
  idempotencyKey: string;
  requestedAt: string;
}

// WordPress control-plane site IDs are positive integer strings; non-WordPress transports may use UUIDs.\n// Contract intentionally separates transport validation from authorization.
// Signature, nonce replay protection, site membership, role, feature state and
// command allow-list must all be verified server-side before mutation.
