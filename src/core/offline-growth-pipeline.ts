import { discoverSyntheticWebsite, type DiscoveryAuthority, type DiscoveryInput, type SyntheticDiscoveryTransport,
  type DiscoveryPage, type DiscoveryResult } from './offline-website-discovery';
import { evaluateObservedPages, type GrowthIdea, type ObservedPage } from './evidence-growth-opportunities';

export interface SyntheticObservationSource { inspect(page: DiscoveryPage, signal: AbortSignal): Promise<ObservedPage> }
export type ManualCompetitorClaim = { evidenceUrl:string; observedAt:string; feature:string;
  plan:'free'|'pro'|'business'; ours:'present'|'absent'|'unknown'; approvedBy:string };
export type GrowthPipelineResult = { discovery:DiscoveryResult; ideas:GrowthIdea[]; competitorState:'unverified'|'none';
  competitorIdeas:{feature:string;plan:string;source:string;status:'review-only';reason:string}[] };

/** Synthetic-only read pipeline. No network provider, recommendation writer or dispatch path is exported. */
export async function runOfflineGrowthPipeline(input:DiscoveryInput,authority:DiscoveryAuthority,
  transport:SyntheticDiscoveryTransport, observations:SyntheticObservationSource,
  competitors:ManualCompetitorClaim[], now:string, signal:AbortSignal):Promise<GrowthPipelineResult> {
  const discovery=await discoverSyntheticWebsite(input,authority,transport,signal);
  const empty:GrowthPipelineResult={discovery,ideas:[],competitorState:'none',competitorIdeas:[]};
  if(discovery.state!=='complete')return empty;
  if(competitors.length>5)throw Error('COMPETITOR_INPUT_DENIED');
  const pages:ObservedPage[]=[];
  for(const page of discovery.pages){
    await authority.assertCurrent(input);
    const observed=await observations.inspect(page,signal);
    if(observed.url!==page.url||observed.sourceHash!==page.bodyHash||observed.status!==page.status||
      observed.observedAt!==page.observedAt)throw Error('OBSERVATION_PROVENANCE_MISMATCH');
    pages.push(observed);
  }
  const ideas=evaluateObservedPages(input,pages,now);
  const competitorIdeas:GrowthPipelineResult['competitorIdeas']=[];
  for(const c of competitors){
    const u=new URL(c.evidenceUrl);
    if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname===input.host||
      c.feature.trim().length<2||c.feature.length>120||!c.approvedBy||
      !['free','pro','business'].includes(c.plan)||!['present','absent','unknown'].includes(c.ours)||
      !Number.isFinite(Date.parse(c.observedAt))||Date.parse(now)-Date.parse(c.observedAt)>7*86400000||
      Date.parse(c.observedAt)>Date.parse(now)+300000)throw Error('COMPETITOR_EVIDENCE_DENIED');
    if(c.ours!=='present')competitorIdeas.push({feature:c.feature.trim(),plan:c.plan,source:c.evidenceUrl,status:'review-only',
      reason:c.ours==='unknown'?'Own feature inventory unknown; verify both sides.':'Manually reported gap; independently verify source and entitlements.'});
  }
  return {discovery,ideas,competitorState:competitors.length?'unverified':'none',competitorIdeas};
}
