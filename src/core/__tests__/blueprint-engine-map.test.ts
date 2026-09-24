import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('command center represents all 22 blueprint engines',()=>{
 const source=readFileSync('src/app/page.tsx','utf8');
 for(const engine of ['Website Discovery','Automated QA','Uptime & Synthetic Monitoring','Security & Dependency Intelligence','Competitor Intelligence','Packaging Intelligence','Feature/Entitlement Control','Technical SEO','Search & AI Visibility','Content Intelligence','CRO & Experimentation','Social Automation','Email & Lifecycle','Organic Promotion','Reputation Intelligence','Monetization & Paid Growth','Retention & Referral','Revenue Attribution','Business Growth Intelligence','GitHub Engineering Agent','Governance & Cost Control']) assert.match(source,new RegExp(engine.replace(/[&/]/g,'\\$&')));
 assert.match(source,/22 engines/);
 assert.doesNotMatch(source,/Twenty GrowthOS engines/);
});
