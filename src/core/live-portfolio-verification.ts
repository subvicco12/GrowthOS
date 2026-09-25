import { growthSites } from './portfolio';

export interface LivePortfolioSite {
  id: string | number;
  domain?: string;
  url?: string;
  home_url?: string;
  status?: string;
}

export interface PortfolioVerification {
  ok: boolean;
  expected: number;
  observed: number;
  missingDomains: string[];
  unexpectedDomains: string[];
  duplicateDomains: string[];
}

function normalizeDomain(value:string):string {
  const candidate=value.trim().toLowerCase();
  if(!candidate)return '';
  try {
    const url=new URL(candidate.includes('://')?candidate:`https://${candidate}`);
    return url.hostname.replace(/^www\./,'');
  } catch {
    return candidate.replace(/^www\./,'').split('/')[0] ?? '';
  }
}

export function verifyLivePortfolio(rows:readonly LivePortfolioSite[]):PortfolioVerification {
  const expectedDomains=growthSites.map(site=>normalizeDomain(site.domain));
  const observedDomains=rows.map(row=>normalizeDomain(row.domain??row.url??row.home_url??'')).filter(Boolean);
  const counts=new Map<string,number>();
  for(const domain of observedDomains)counts.set(domain,(counts.get(domain)??0)+1);
  const observedUnique=[...counts.keys()];
  const missingDomains=expectedDomains.filter(domain=>!counts.has(domain));
  const unexpectedDomains=observedUnique.filter(domain=>!expectedDomains.includes(domain));
  const duplicateDomains=[...counts.entries()].filter(([,count])=>count>1).map(([domain])=>domain);
  return {
    ok: rows.length===expectedDomains.length && missingDomains.length===0 && unexpectedDomains.length===0 && duplicateDomains.length===0,
    expected: expectedDomains.length,
    observed: rows.length,
    missingDomains,
    unexpectedDomains,
    duplicateDomains,
  };
}
