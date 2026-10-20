import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ConnectorEvidenceVerifier, connectorEvidencePayload, type SignedConnectorAttestation, type TrustedConnectorIssuer, type CurrentConnectorTrust } from './connector-evidence';
import type { PublicationDestination } from '../core/publication-authorization';
export interface ConnectorCheckpointVerifier {
  assertCurrent(input: { signed: SignedConnectorAttestation; payloadHash: string; trust: CurrentConnectorTrust }): Promise<void>;
}
export interface TrustCheckpoint {
  revision: string; generation: number; revoked: boolean; sequence: number; hash: string | null;
  pending: { sequence: number; hash: string; previous: string | null } | null;
}
export interface TrustLease {
  read(): Promise<TrustCheckpoint>;
  /** Must persist independently of database backup/restore before resolving. CAS and monotonicity mandatory. */
  compareAndSet(previous: TrustCheckpoint, next: TrustCheckpoint): Promise<void>;
}
export interface IndependentTrustAnchor {
  /** Non-reentrant exclusive key lease, across every writer AND the full claim SQL transaction.
   * Must not share database backup rollback domain. No default or in-memory production adapter. */
  exclusive<T>(key: string, work: (lease: TrustLease) => Promise<T>): Promise<T>;
}
export interface ConnectorEvidenceRepository {
  readonly capability: 'connector-evidence-writer';
  /** Atomic: compare previous current hash; append globally unique issuer/key/event; update
   * current pointer AND legacy health under org/site lock. Exact recovery may read same hash.
   * NEVER mutate authorizations, reservations, claims, site activation or key trust. */
  commitObservation(input: { key: string; sequence: number; previous: string | null; hash: string; signed: SignedConnectorAttestation; probe: SequencedConnectorProbe }): Promise<void>;
  readCurrent(key: string): Promise<{ sequence: number; hash: string; probe: SequencedConnectorProbe } | null>;
}
export interface RegisteredConnectorIssuer extends TrustedConnectorIssuer { generation: number; capabilities: readonly ('read'|'publish')[] }
export interface SequencedConnectorProbe { attestation: SignedConnectorAttestation; sequence: number; previousHash: string | null; generation: number; controlSignature: string }
export const connectorTrustKey = (e: Pick<TrustedConnectorIssuer,'id'|'keyId'>) => JSON.stringify([e.id,e.keyId]);
export const probeControlPayload = (p: Omit<SequencedConnectorProbe,'controlSignature'>) => JSON.stringify(['growthos-probe-v2',p.generation,p.sequence,p.previousHash,connectorEvidencePayload(p.attestation.evidence),p.attestation.signature]);
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
const digest = (p: Omit<SequencedConnectorProbe,'controlSignature'>) => createHash('sha256').update(probeControlPayload(p)).digest('hex');
function validateCheckpoint(c: TrustCheckpoint) {
  if (!c || !c.revision || !integer(c.generation) || !integer(c.sequence) || typeof c.revoked !== 'boolean' ||
      (c.hash !== null && !/^[a-f0-9]{64}$/.test(c.hash)) || (c.sequence === 0) !== (c.hash === null)) throw Error('TRUST_ANCHOR_INVALID');
  if (c.pending && (!integer(c.pending.sequence) || c.pending.sequence <= c.sequence || c.pending.previous !== c.hash || !/^[a-f0-9]{64}$/.test(c.pending.hash))) throw Error('TRUST_PENDING_INVALID');
}
/** Server-owned registry, copied on construction. No self-registration or environment credentials. */
export class ConnectorTrustService {
  private readonly registry: RegisteredConnectorIssuer[];
  constructor(registry: readonly RegisteredConnectorIssuer[], private readonly anchor: IndependentTrustAnchor, private readonly repository: ConnectorEvidenceRepository) {
    if (repository.capability !== 'connector-evidence-writer' || registry.some(i => !integer(i.generation) || i.capabilities.length === 0 || new Set(i.capabilities).size !== i.capabilities.length || i.capabilities.some(c=>!['read','publish'].includes(c))) || new Set(registry.map(connectorTrustKey)).size !== registry.length) throw Error('TRUST_CONFIGURATION_INVALID');
    new ConnectorEvidenceVerifier(registry);
    this.registry=registry.map(i=>({...i,secret:Buffer.from(i.secret),capabilities:[...i.capabilities]}));
  }
  async ingest(input: SequencedConnectorProbe, target: PublicationDestination, now: number): Promise<'recorded'> {
    // Detach all signed fields before signature checks or waiting for a lease.
    const probe=structuredClone(input),destination=structuredClone(target);
    if (!probe?.attestation?.evidence || !integer(probe.sequence) || probe.sequence === 0 || !integer(probe.generation) ||
        (probe.previousHash !== null && !/^[a-f0-9]{64}$/.test(probe.previousHash)) || !/^[a-f0-9]{64}$/.test(probe.controlSignature)) throw Error('PROBE_INVALID');
    const issuer=this.registry.find(i=>i.id===probe.attestation.evidence.issuer && i.keyId===probe.attestation.evidence.keyId);
    if (!issuer || issuer.revoked || issuer.generation !== probe.generation) throw Error('ISSUER_UNKNOWN_OR_REVOKED');
    const expected=createHmac('sha256',issuer.secret).update(probeControlPayload(probe)).digest();
    if (!timingSafeEqual(expected,Buffer.from(probe.controlSignature,'hex'))) throw Error('PROBE_CONTROL_SIGNATURE_INVALID');
    return this.anchor.exclusive(connectorTrustKey(issuer),async lease=>{
      const before=await lease.read();validateCheckpoint(before);
      if (before.revoked || before.revision !== issuer.trustRevision || before.generation !== issuer.generation) throw Error('TRUST_ROLLBACK_OR_REVOKED');
      new ConnectorEvidenceVerifier([issuer]).verifyProbe(probe.attestation,destination,{issuer:issuer.id,keyId:issuer.keyId,revision:before.revision,revoked:before.revoked},now);
      if (probe.attestation.evidence.capabilities.some(c=>!issuer.capabilities.includes(c))) throw Error('CAPABILITY_DENIED');
      const hash=digest(probe);
      if (before.pending) {
        if (before.pending.hash !== hash || before.pending.sequence !== probe.sequence || before.pending.previous !== probe.previousHash) throw Error('TRUST_RECOVERY_REQUIRED');
      } else {
        if (probe.previousHash !== before.hash || probe.sequence <= before.sequence) throw Error('PROBE_REPLAY_OR_ROLLBACK');
        await lease.compareAndSet(before,{...before,pending:{hash,sequence:probe.sequence,previous:probe.previousHash}});
      }
      // A failure leaves the independent anchor PENDING. Nothing clears or rolls it back.
      await this.repository.commitObservation({key:connectorTrustKey(issuer),sequence:probe.sequence,previous:probe.previousHash,hash,signed:probe.attestation,probe});
      const saved=await this.repository.readCurrent(connectorTrustKey(issuer));
      if (!saved || saved.hash!==hash || saved.sequence!==probe.sequence) throw Error('PROBE_PERSISTENCE_UNVERIFIED');
      const pending=await lease.read();validateCheckpoint(pending);
      if (pending.revoked || pending.pending?.hash!==hash || pending.generation!==issuer.generation || pending.revision!==issuer.trustRevision) throw Error('TRUST_CHANGED');
      await lease.compareAndSet(pending,{...pending,hash,sequence:probe.sequence,pending:null});
      return 'recorded' as const;
    });
  }
  /** Wrap the ENTIRE claim transaction, not just evidence verification. No SQL locks may
   * be held before obtaining this lease. Callback's checkpoint is unusable after return. */
  async withClaimLease<T>(issuerId: string,keyId: string, work: (checkpoint: ConnectorCheckpointVerifier)=>Promise<T>): Promise<T> {
    const issuer=this.registry.find(i=>i.id===issuerId && i.keyId===keyId);
    if (!issuer || issuer.revoked || !issuer.capabilities.includes('publish')) throw Error('ISSUER_UNKNOWN_OR_REVOKED');
    return this.anchor.exclusive(connectorTrustKey(issuer),async lease=>{
      let active=true;
      const checkpoint:ConnectorCheckpointVerifier={assertCurrent:async raw=>{
        const input=structuredClone(raw);
        if(!active)throw Error('TRUST_LEASE_EXPIRED');
        const state=await lease.read();validateCheckpoint(state);
        if(state.revoked || state.pending || state.hash===null || state.revision!==issuer.trustRevision || state.generation!==issuer.generation || input.trust.issuer!==issuer.id || input.trust.keyId!==issuer.keyId || input.trust.revoked || input.trust.revision!==state.revision)throw Error('TRUST_ANCHOR_DENIED');
        const current=await this.repository.readCurrent(connectorTrustKey(issuer));
        if(!current || current.hash!==state.hash || current.sequence!==state.sequence)throw Error('CONNECTOR_DATABASE_ROLLBACK');
        const payloadHash=createHash('sha256').update(connectorEvidencePayload(input.signed.evidence)).digest('hex');
        // Durable history must bind the exact signed payload, not just the current row's self-reported hash.
        if (digest(current.probe)!==state.hash || current.probe.generation!==state.generation || current.probe.sequence!==state.sequence || connectorEvidencePayload(current.probe.attestation.evidence)!==connectorEvidencePayload(input.signed.evidence) || current.probe.attestation.signature!==input.signed.signature || payloadHash!==input.payloadHash) throw Error('CONNECTOR_CHECKPOINT_UNRESOLVED');
        const control=createHmac('sha256',issuer.secret).update(probeControlPayload(current.probe)).digest();
        if (!/^[a-f0-9]{64}$/.test(current.probe.controlSignature) || !timingSafeEqual(control,Buffer.from(current.probe.controlSignature,'hex')))throw Error('PROBE_CONTROL_SIGNATURE_INVALID');
      }};
      try{return await work(checkpoint);}finally{active=false;}
    });
  }
}

export interface TrustAdministrator {
  readonly capability: 'trust-administrator';
  authorizeRevocation(key: string): Promise<void>;
  auditRevocation(key: string, generation: number): Promise<void>;
}
/** No un-revoke operation. Audit failure never restores trust. */
export async function revokeConnectorTrust(anchor: IndependentTrustAnchor, administrator: TrustAdministrator, key: string, generation: number): Promise<void> {
  if(administrator.capability!=='trust-administrator' || !integer(generation) || generation===Number.MAX_SAFE_INTEGER)throw Error('TRUST_ADMIN_DENIED');
  await administrator.authorizeRevocation(key);
  await anchor.exclusive(key,async lease=>{
    const before=await lease.read();validateCheckpoint(before);
    if(before.generation!==generation)throw Error('TRUST_REVISION_CONFLICT');
    if(!before.revoked)await lease.compareAndSet(before,{...before,generation:generation+1,revoked:true});
    await administrator.auditRevocation(key,generation+1);
  });
}
