import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {createPublicationJob} from '../safe-publication-jobs';import type {ContentRecord} from '../content-lifecycle';
import {verifyScopedPublicationObservation} from '../../server/publication-observation-scope';
const at='2026-10-20T01:00:00.000Z',record:ContentRecord={organizationId:'org1',websiteId:'site1',id:'content1',contentType:'article',stage:'scheduled',version:5,eventIds:['a','b','c','d','e'],sources:[],quality:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:false,notes:'fixture'},approval:{actorId:'owner1',at},schedule:{channel:'wordpress',at}};
const base=createPublicationJob(record,{id:'job1',destination:{id:'dest1',revision:'rev1',target:'https://wordpress.invalid/'}});
const claim={organizationId:'org1',websiteId:'site1',contentId:'content1',channel:'wordpress',idempotencyKey:'publish:org1:site1:content1:wordpress',reservationId:'generation1'};
const job={...base,claim};const claimHash=createHash('sha256').update(claim.idempotencyKey).digest('hex');
const evidence={format:'growthos-synthetic-provider-observation-v1' as const,synthetic:true as const,destination:job.destination,observation:{signature:'a'.repeat(64),observation:{issuer:'synthetic_issuer',eventId:'event1',organizationId:'org1',websiteId:'site1',contentId:'content1',channel:'wordpress',reservationId:'generation1',claimHash,issuedAt:at,expiresAt:new Date(Date.parse(at)+60000).toISOString(),result:{kind:'unknown' as const}}},bindingSignature:'b'.repeat(64)};
const verifier={capability:'trusted-destination-observation-verifier' as const,verify:async()=>({signed:evidence.observation,payloadHash:'c'.repeat(64)})};
test('scoped observation includes destination, claim and signed issuer identity',async()=>{const r=await verifyScopedPublicationObservation(job,evidence,at,verifier);assert.equal(r.destinationId,'dest1');assert.equal(r.claimHash,claimHash);assert.equal(r.websiteId,'site1');});
test('unknown authority and drifted tenant, website, content, channel, destination or claim refuse before signature acceptance',async()=>{
 await assert.rejects(()=>verifyScopedPublicationObservation(job,evidence,at,{} as never),/AUTHORITY_REQUIRED/);
 for(const name of ['organizationId','websiteId','contentId','channel','reservationId','claimHash'] as const){const e=structuredClone(evidence);e.observation.observation[name]='forged';await assert.rejects(()=>verifyScopedPublicationObservation(job,e,at,verifier),/SCOPE_DENIED/);}
 const e=structuredClone(evidence);e.destination.revision='forged';await assert.rejects(()=>verifyScopedPublicationObservation(job,e,at,verifier),/SCOPE_DENIED/);
 await assert.rejects(()=>verifyScopedPublicationObservation(job,evidence,at,{...verifier,verify:async()=>{throw Error('FORGED_SIGNATURE');}}),/FORGED_SIGNATURE/);
});
