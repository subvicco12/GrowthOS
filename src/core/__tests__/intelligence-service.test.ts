import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverSiteFeatures, discoverComparableCompetitors } from '../intelligence-service';

test('orchestrates deterministic site feature discovery',()=>{
 const result=discoverSiteFeatures([
  {url:'https://example.com/pricing',title:'Pricing'},
  {url:'https://example.com/analytics',title:'Analytics dashboard'},
 ]);
 assert.equal(result.features.length>=2,true);
 assert.equal(typeof result.capturedAt,'string');
});

test('orchestrates comparable competitor selection without AI',()=>{
 const result=discoverComparableCompetitors(
  {category:'qr',useCases:['generate','analytics'],customerTypes:['business'],featureKeys:['dynamic','bulk']},
  [
   {name:'A',domain:'a.example',category:'qr',useCases:['generate'],customerTypes:['business'],featureKeys:['dynamic'],evidenceUrl:'https://a.example'},
   {name:'B',domain:'b.example',category:'photo',useCases:['edit'],customerTypes:['consumer'],featureKeys:['crop'],evidenceUrl:'https://b.example'},
  ],
 );
 assert.equal(result.length,1);
 assert.equal(result[0].domain,'a.example');
});
