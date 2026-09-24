import type { CompetitorProfile, PackageInventory } from './competitive-intelligence';

export interface CompetitiveEvidenceSnapshot {
  siteId:string;
  capturedAt:string;
  ours:PackageInventory;
  competitors:CompetitorProfile[];
}
export interface CompetitiveEvidenceStore {
  save(snapshot:CompetitiveEvidenceSnapshot):Promise<string>;
  latest(siteId:string):Promise<CompetitiveEvidenceSnapshot|null>;
}
function validDate(value:string):boolean{return Number.isFinite(Date.parse(value));}
export function certifyCompetitiveEvidence(snapshot:CompetitiveEvidenceSnapshot):void {
  if(!snapshot.siteId.trim())throw new Error('COMPETITIVE_SITE_REQUIRED');
  if(!validDate(snapshot.capturedAt))throw new Error('COMPETITIVE_CAPTURE_TIME_REQUIRED');
  if(!validDate(snapshot.ours.capturedAt))throw new Error('PACKAGE_CAPTURE_TIME_REQUIRED');
  if(!/^https?:\/\//.test(snapshot.ours.evidenceUrl??''))throw new Error('OWN_PACKAGE_EVIDENCE_REQUIRED');
  for(const competitor of snapshot.competitors){
    if(!competitor.evidence.length)throw new Error('COMPETITOR_EVIDENCE_REQUIRED');
    if(!validDate(competitor.inventory.capturedAt))throw new Error('COMPETITOR_CAPTURE_TIME_REQUIRED');
    if(!/^https?:\/\//.test(competitor.inventory.evidenceUrl??''))throw new Error('COMPETITOR_PACKAGE_EVIDENCE_REQUIRED');
  }
}
export async function persistCompetitiveEvidence(store:CompetitiveEvidenceStore,snapshot:CompetitiveEvidenceSnapshot):Promise<string>{
  certifyCompetitiveEvidence(snapshot);
  const id=await store.save(snapshot);
  if(!id.trim())throw new Error('COMPETITIVE_EVIDENCE_PERSIST_FAILED');
  return id;
}
