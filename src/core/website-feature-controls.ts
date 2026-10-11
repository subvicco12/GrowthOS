import { z } from 'zod';

/** Only disable operations are permitted until the safety review is complete. */
export const websiteFeaturePatchSchema = z.object({
  websiteId: z.string().uuid(),
  feature: z.enum(['automation', 'auto_publish']),
  enabled: z.literal(false)
}).strict();

export function canDisableWebsiteFeature(role: string): boolean {
  return role === 'owner' || role === 'admin';
}
