export type ExecutionState='prepared'|'executing'|'verified'|'failed'|'rolled_back';
export interface ExecutionRecord { id:string; siteId:string; state:ExecutionState; reversible:boolean; beforeRef?:string; afterRef?:string; verificationRef?:string; error?:string; }
export function canExecute(record:ExecutionRecord):boolean{return record.state==='prepared'&&(!record.reversible||!!record.beforeRef);}
export function markExecuting(record:ExecutionRecord):ExecutionRecord {if(!canExecute(record))throw new Error('EXECUTION_NOT_RECOVERABLE');return {...record,state:'executing'};}
export function markVerified(record:ExecutionRecord,verificationRef:string):ExecutionRecord {if(record.state!=='executing'||!verificationRef.trim())throw new Error('VERIFICATION_REQUIRED');return {...record,state:'verified',verificationRef};}
export function markFailed(record:ExecutionRecord,error:string):ExecutionRecord {if(record.state!=='executing')throw new Error('INVALID_EXECUTION_STATE');return {...record,state:'failed',error:error.slice(0,1000)};}
export function markRolledBack(record:ExecutionRecord,afterRef:string):ExecutionRecord {if(record.state!=='failed'||!record.reversible||!record.beforeRef||!afterRef.trim())throw new Error('ROLLBACK_NOT_AVAILABLE');return {...record,state:'rolled_back',afterRef};}
