/** Application guard for candidate 014. No unsigned configuration or cached health can verify a status. */
import {factoryHash} from '../core/content-factory';
import type {PublicationJob,BoundProviderObservation} from '../core/safe-publication-jobs';
import {publicationClaimHash,type SignedPublicationObservation} from './publication-evidence';

export interface TrustedDestinationObservationVerifier {
 readonly capability:'trusted-destination-observation-verifier';
 /** Verifies BOTH signatures against current independent issuer/key revocation and exact destination revision. */
 verify(job:PublicationJob,envelope:BoundProviderObservation,at:string):Promise<{signed:SignedPublicationObservation;payloadHash:string}>;
}
export async function verifyScopedPublicationObservation(job:PublicationJob,envelope:BoundProviderObservation,at:string,verifier:TrustedDestinationObservationVerifier){
 if(!job.claim||!verifier||verifier.capability!=='trusted-destination-observation-verifier'||typeof verifier.verify!=='function'||!Number.isFinite(Date.parse(at)))throw Error('PUBLICATION_OBSERVATION_AUTHORITY_REQUIRED');
 const o=envelope?.observation?.observation;
 if(!o||envelope.format!=='growthos-synthetic-provider-observation-v1'||envelope.synthetic!==true||
   factoryHash(envelope.destination)!==factoryHash(job.destination)||
   o.organizationId!==job.organizationId||o.websiteId!==job.websiteId||o.contentId!==job.contentId||o.channel!==job.channel||
   o.reservationId!==job.claim.reservationId||o.claimHash!==publicationClaimHash(job.claim))throw Error('PUBLICATION_OBSERVATION_SCOPE_DENIED');
 const verified=await verifier.verify(job,structuredClone(envelope),at);
 if(!verified||verified.signed.signature!==envelope.observation.signature||JSON.stringify(verified.signed.observation)!==JSON.stringify(o)||
   verified.signed.observation.issuer!==o.issuer||verified.signed.observation.eventId!==o.eventId||
   verified.signed.observation.organizationId!==job.organizationId||verified.signed.observation.websiteId!==job.websiteId||
   verified.signed.observation.contentId!==job.contentId||verified.signed.observation.channel!==job.channel||
   verified.signed.observation.reservationId!==job.claim.reservationId||verified.signed.observation.claimHash!==o.claimHash||
   !/^[a-f0-9]{64}$/.test(verified.payloadHash)||!['published','absent','unknown'].includes(verified.signed.observation.result.kind))throw Error('PUBLICATION_OBSERVATION_VERIFIER_MISMATCH');
 return {organizationId:job.organizationId,websiteId:job.websiteId,contentId:job.contentId,channel:job.channel,
   destinationId:job.destination.id,destinationRevision:job.destination.revision,destinationTarget:job.destination.target,
   claimHash:o.claimHash,issuer:o.issuer,eventId:o.eventId,payloadHash:verified.payloadHash,result:verified.signed.observation.result};
}
