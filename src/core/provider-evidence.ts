import {z} from 'zod';
export const observationSchema=z.object({websiteId:z.string().uuid(),sourceKind:z.enum(['observed_local','manual_submission','synthetic_fixture']),
 sourceLabel:z.string().trim().min(1).max(200),observedAt:z.string().datetime(),measurements:z.record(z.string(),z.number().finite()).refine(x=>Object.keys(x).length<=40),
 authority:z.literal('unverified'),capabilities:z.array(z.enum(['technical_audit','seo_observation','competitor_evidence','monetization_hypothesis'])).max(4)}).strict();
export type ProviderObservation=z.infer<typeof observationSchema>;
export interface EvidenceProvider {readonly kind:'local_artifact'|'manual'|'synthetic';collect(input:unknown,signal:AbortSignal):Promise<ProviderObservation>}
export class LocalObservationProvider implements EvidenceProvider{
 readonly kind='local_artifact' as const;
 async collect(input:unknown,signal:AbortSignal){if(signal.aborted)throw Error('OBSERVATION_CANCELLED');const artifact=z.object({websiteId:z.string().uuid(),html:z.string().max(131072)}).strict().parse(input);
  return observationSchema.parse({websiteId:artifact.websiteId,sourceKind:'observed_local',sourceLabel:'Uploaded HTML artifact; origin unverified',observedAt:new Date().toISOString(),
   measurements:{utf8Bytes:Buffer.byteLength(artifact.html,'utf8'),headingMarkupCount:(artifact.html.match(/<h[1-6](?:\s|>)/gi)||[]).length},authority:'unverified',capabilities:['technical_audit']});}
}
export interface ProviderBudgetReservation {reserve(input:{estimatedMinor:string;externalSideEffect:boolean}):Promise<{receipt:string;reservedMinor:'0'}>}
export class ZeroSpendReservation implements ProviderBudgetReservation{
 async reserve(input:{estimatedMinor:string;externalSideEffect:boolean}){if(input.estimatedMinor!=='0'||input.externalSideEffect)throw Error('EXTERNAL_SPEND_DISABLED');return {receipt:'local-zero-spend',reservedMinor:'0' as const};}
}
export function productionConnector(){return {state:'disabled' as const,enroll:async()=>{throw Error('INDEPENDENT_CONNECTOR_AUTHORITY_REQUIRED');},capabilities:['read_only'] as const};}
