import { createHash } from 'node:crypto';
import type { RankedOpportunity } from './opportunities';
export function recommendationFingerprint(input:RankedOpportunity):string{
 const normalized=[input.siteId,input.category,input.title.trim().toLowerCase(),...input.evidence.map(x=>x.trim().toLowerCase()).sort()].join('|');
 return createHash('sha256').update(normalized).digest('hex');
}
