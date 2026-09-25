export interface DiscoveryGateRecord { siteId:string; capturedAt:string; routes:string[]; evidenceCount:number; }
export interface CompetitorGateRecord { capturedAt:string; competitors:{domain:string;evidenceUrls:string[]}[]; }
export interface PackageGateRecord { capturedAt:string; plans:string[]; recommendationEvidence:string[]; }
export interface EntitlementGateRecord { checkedAt:string; freeDeniedPaidFeature:boolean; proAllowedPaidFeature:boolean; businessAllowedPaidFeature:boolean; emergencyKillDenied:boolean; }

const validDate=(value:string)=>Number.isFinite(Date.parse(value));
const validUrl=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'||u.protocol==='http:'}catch{return false}};

export function hasPilotDiscoveryEvidence(record:DiscoveryGateRecord|undefined):boolean {
 return !!record && !!record.siteId && validDate(record.capturedAt) && record.routes.length>0 && record.evidenceCount>0;
}
export function hasCompetitorSnapshotEvidence(record:CompetitorGateRecord|undefined):boolean {
 return !!record && validDate(record.capturedAt) && record.competitors.length>0 && record.competitors.every(c=>!!c.domain&&c.evidenceUrls.length>0&&c.evidenceUrls.every(validUrl));
}
export function hasPackageRecommendationEvidence(record:PackageGateRecord|undefined):boolean {
 if(!record||!validDate(record.capturedAt)||record.recommendationEvidence.length===0)return false;
 const plans=new Set(record.plans.map(p=>p.trim().toLowerCase()));
 return ['free','pro','business'].every(p=>plans.has(p));
}
export function hasEntitlementEnforcementEvidence(record:EntitlementGateRecord|undefined):boolean {
 return !!record && validDate(record.checkedAt) && record.freeDeniedPaidFeature && record.proAllowedPaidFeature && record.businessAllowedPaidFeature && record.emergencyKillDenied;
}
