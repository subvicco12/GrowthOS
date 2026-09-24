export type ExternalBlockerKind='credential'|'authorization'|'account_verification'|'api_review'|'external_approval';
export interface ExternalBlocker {integration:string;kind:ExternalBlockerKind;missing:string;status:'needs_connection';}
export function certifyExternalBlockers(blockers:ExternalBlocker[]):boolean{return blockers.every(b=>b.integration.trim()&&b.missing.trim()&&b.status==='needs_connection');}
export function labelExternalBlocker(integration:string,kind:ExternalBlockerKind,missing:string):ExternalBlocker{if(!integration.trim()||!missing.trim())throw new Error('EXTERNAL_BLOCKER_DETAIL_REQUIRED');return{integration:integration.trim(),kind,missing:missing.trim(),status:'needs_connection'};}
