/** One-connection transaction boundary for candidate 010–013. No default participant can publish. */
import type {Pool,PoolConnection} from 'mysql2/promise';
import type {FactoryScope} from '../core/content-factory';
import type {AtomicPublicationRepository,AtomicPublicationTransaction,IndependentPublicationFence} from '../core/publication-atomic-integration';

const valid=(s:string)=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const refuse=(reason:string):never=>{throw Error(reason);};

/** Every participant must use this exact connection, including current trust, quota and audit checks.
 * The installer and this module supply no implementation or implicit provider permission. */
export interface CertifiedAtomicParticipants {
  readonly capability:'certified-010-013-atomic-participants';
  assertCompatible(connection:PoolConnection):Promise<void>;
  open(connection:PoolConnection,scope:FactoryScope,jobId:string,fence:IndependentPublicationFence):AtomicPublicationTransaction;
  /** Exact-identity readback only; never authorizes a retry. */
  readCommittedIdentity(scope:FactoryScope,jobId:string):Promise<'committed'|'absent'|'indeterminate'>;
}

/** Transaction transport; certification of SQL operations is delegated to explicitly injected participants.
 * It must not be wired into a route until actual 010–013 metadata, independent lease and quota gates pass. */
export class MySQLAtomicPublicationRepository implements AtomicPublicationRepository {
  readonly capability='single-transaction-publication' as const;
  constructor(private readonly pool:Pick<Pool,'getConnection'>,private readonly participants:CertifiedAtomicParticipants){
    if(!pool?.getConnection||participants?.capability!=='certified-010-013-atomic-participants'||
      typeof participants.assertCompatible!=='function'||typeof participants.open!=='function'||typeof participants.readCommittedIdentity!=='function')refuse('ATOMIC_PARTICIPANTS_REQUIRED');
  }
  async transaction<T>(scope:FactoryScope,jobId:string,fence:IndependentPublicationFence,work:(tx:AtomicPublicationTransaction)=>Promise<T>):Promise<T>{
    if(![scope.organizationId,scope.websiteId,scope.contentId,jobId].every(valid)||!fence?.assertCurrent||!fence?.release||typeof work!=='function')refuse('ATOMIC_SCOPE_OR_FENCE_DENIED');
    const connection=await this.pool.getConnection();let begun=false,commitAttempted=false;
    try{
      await this.participants.assertCompatible(connection);
      await fence.assertCurrent();
      await connection.beginTransaction();begun=true;
      const tx=this.participants.open(connection,scope,jobId,fence);
      if(!tx)refuse('ATOMIC_PARTICIPANTS_UNAVAILABLE');
      const order=['lockScope','loadContent','authorize','checkPublicationFunding','insertClaim','startFunding','consumeAuthorization','insertFundingBinding','contentUnknown','appendAudit','saveUnknownJob','checkCommitBoundary'] as const;
      let phase=0;
      const guarded=Object.fromEntries(order.map((method,index)=>[method,async(...args:unknown[])=>{
        if(phase!==index)refuse('ATOMIC_OPERATION_ORDER_DENIED');
        const operation=tx[method] as (...values:unknown[])=>Promise<unknown>;
        if(typeof operation!=='function')refuse('ATOMIC_OPERATION_MISSING');
        const result=await operation.call(tx,...args);
        phase++;return result;
      }])) as unknown as AtomicPublicationTransaction;
      const result=await work(guarded);
      if(phase!==order.length)refuse('ATOMIC_TRANSACTION_INCOMPLETE');
      // The independently held lease is required through the actual COMMIT return.
      await fence.assertCurrent();
      commitAttempted=true;
      try{await connection.commit();}catch(error){
        const unknown=Error('PUBLICATION_COMMIT_INDETERMINATE',{cause:error}) as Error&{code:string};
        unknown.code='PUBLICATION_COMMIT_INDETERMINATE';throw unknown;
      }
      return result;
    }catch(error){
      if(begun&&!commitAttempted)await connection.rollback().catch(()=>{throw Error('ATOMIC_ROLLBACK_UNCERTAIN',{cause:error});});
      // An attempted COMMIT has an unknown outcome; do not assume rollback undoes it.
      throw error;
    }finally{connection.release();}
  }
  async readCommittedIdentity(scope:FactoryScope,jobId:string):Promise<'committed'|'absent'|'indeterminate'>{
    if(![scope.organizationId,scope.websiteId,scope.contentId,jobId].every(valid))refuse('ATOMIC_READBACK_SCOPE_DENIED');
    return this.participants.readCommittedIdentity(scope,jobId);
  }
}
