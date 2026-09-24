import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverFeatureCandidates } from '../feature-intelligence';
import { comparePackageSnapshots } from '../package-intelligence';
import { scoreCompetitor } from '../competitor-discovery';

test('discovers explicit tool and pricing features from page evidence',()=>{
 const features=discoverFeatureCandidates([
  {url:'https://example.com/website-cost-calculator',title:'Website Cost Calculator'},
  {url:'https://example.com/pricing',title:'Pricing & Plans'},
 ]);
 assert.equal(features.some(f=>f.name==='Core online tool'&&f.confidence==='high'),true);
 assert.equal(features.some(f=>f.name==='Paid plans / pricing'),true);
});

test('package comparison creates tier-specific upgrade opportunities',()=>{
 const ours={siteId:'1',productName:'Example',capturedAt:'2026-09-24T00:00:00Z',plans:[
  {plan:'free',featureKeys:['core'],limits:{},evidence:[],capturedAt:'x'},
  {plan:'pro',featureKeys:['core'],limits:{},evidence:[],capturedAt:'x'},
  {plan:'business',featureKeys:['core'],limits:{},evidence:[],capturedAt:'x'},
 ]};
 const competitor={...ours,siteId:'2',plans:[
  {plan:'free',featureKeys:['core'],limits:{},evidence:[],capturedAt:'x'},
  {plan:'pro',featureKeys:['core','advanced'],limits:{},evidence:['pricing'],capturedAt:'x'},
  {plan:'business',featureKeys:['core','advanced','team'],limits:{},evidence:['pricing'],capturedAt:'x'},
 ]};
 const rows=comparePackageSnapshots(ours,[competitor],{advanced:'Advanced feature',team:'Team features'});
 assert.equal(rows.find(x=>x.featureKey==='advanced')?.recommendation,'pro_upgrade');
 assert.equal(rows.find(x=>x.featureKey==='team')?.recommendation,'business_upgrade');
});

test('competitor scoring uses category, use-case, customer and feature similarity',()=>{
 const result=scoreCompetitor(
  {category:'pdf',useCases:['merge','compress'],customerTypes:['consumer','professional'],featureKeys:['merge','compress']},
  {name:'Example',domain:'example.com',category:'pdf',useCases:['merge'],customerTypes:['professional'],featureKeys:['merge'],evidenceUrl:'https://example.com'},
 );
 assert.equal(result.similarity>.5,true);
 assert.equal(result.reasons.length>=3,true);
});
