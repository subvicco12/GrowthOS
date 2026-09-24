import type { QaFinding } from './discovery';
import type { RankedOpportunity } from './opportunities';
const severityWeight:Record<QaFinding['severity'],number>={critical:5,high:4,medium:3,low:2};
export function qaRegressionsToOpportunities(siteId:string,previous:QaFinding[],current:QaFinding[]):RankedOpportunity[]{
 const old=new Map(previous.map(f=>[f.id,f])); const out:RankedOpportunity[]=[];
 for(const f of current){const before=old.get(f.id);const worsened=!before||severityWeight[f.severity]>severityWeight[before.severity];if(!worsened)continue;
  const impact=severityWeight[f.severity],confidence=5,effort=f.severity==='critical'?2:3,risk=f.category==='security'?5:2;
  const score=Math.round(((impact*confidence)/(effort+risk))*100)/100;
  out.push({siteId,category:'qa',title:`Resolve ${f.title}`,evidence:[f.evidence,before?`Severity changed from ${before.severity} to ${f.severity}`:'New QA finding'],impact,confidence,effort,recurringCostUsd:0,risk,score,approvalClass:risk>=5?'red':'green'});
 }
 return out.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title));
}
