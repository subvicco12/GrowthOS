import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLivePortfolio } from '../live-portfolio-verification';

const six=[
 {id:1,domain:'barcodeqrhub.com'},
 {id:2,url:'https://www.priceinsight360.com/'},
 {id:3,home_url:'https://businessstarttools.com'},
 {id:4,domain:'aitoolstores.com'},
 {id:5,url:'https://pdfimagetools.online/'},
 {id:6,domain:'calcumint.com'},
];

test('accepts exactly the configured six-site production portfolio',()=>{
 const result=verifyLivePortfolio(six);
 assert.equal(result.ok,true);
 assert.deepEqual(result.missingDomains,[]);
 assert.deepEqual(result.unexpectedDomains,[]);
 assert.deepEqual(result.duplicateDomains,[]);
});

test('fails closed when a configured production site is missing',()=>{
 const result=verifyLivePortfolio(six.slice(0,5));
 assert.equal(result.ok,false);
 assert.deepEqual(result.missingDomains,['calcumint.com']);
});

test('fails closed on replacement or unexpected sites',()=>{
 const result=verifyLivePortfolio([...six.slice(0,5),{id:7,domain:'example.com'}]);
 assert.equal(result.ok,false);
 assert.deepEqual(result.missingDomains,['calcumint.com']);
 assert.deepEqual(result.unexpectedDomains,['example.com']);
});

test('fails closed when a production domain is duplicated',()=>{
 const result=verifyLivePortfolio([...six.slice(0,5),{id:7,domain:'barcodeqrhub.com'}]);
 assert.equal(result.ok,false);
 assert.deepEqual(result.duplicateDomains,['barcodeqrhub.com']);
});
