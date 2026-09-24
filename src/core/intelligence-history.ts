import type { WebsiteSnapshot, QaFinding } from './discovery';
export interface SnapshotChange { type:'route_added'|'route_removed'|'feature_added'|'feature_removed'|'technology_added'|'technology_removed'; value:string; }
export function compareSnapshots(previous:WebsiteSnapshot,current:WebsiteSnapshot):SnapshotChange[]{
 if(previous.siteId!==current.siteId)throw new Error('SNAPSHOT_SITE_MISMATCH');
 const changes:SnapshotChange[]=[]; const diff=(a:string[],b:string[],added:SnapshotChange['type'],removed:SnapshotChange['type'])=>{const A=new Set(a),B=new Set(b);for(const x of B)if(!A.has(x))changes.push({type:added,value:x});for(const x of A)if(!B.has(x))changes.push({type:removed,value:x});};
 diff(previous.routes,current.routes,'route_added','route_removed');
 diff(previous.features.map(f=>f.name),current.features.map(f=>f.name),'feature_added','feature_removed');
 diff(previous.technologies,current.technologies,'technology_added','technology_removed'); return changes;
}
export interface QaRegression { key:string; kind:'new'|'resolved'|'severity_changed'; before?:QaFinding['severity']; after?:QaFinding['severity']; }
export function compareFindings(previous:QaFinding[],current:QaFinding[]):QaRegression[]{
 const A=new Map(previous.map(f=>[f.id,f])),B=new Map(current.map(f=>[f.id,f])); const out:QaRegression[]=[];
 for(const [k,f] of B){const old=A.get(k);if(!old)out.push({key:k,kind:'new',after:f.severity});else if(old.severity!==f.severity)out.push({key:k,kind:'severity_changed',before:old.severity,after:f.severity});}
 for(const [k,f] of A)if(!B.has(k))out.push({key:k,kind:'resolved',before:f.severity}); return out;
}
