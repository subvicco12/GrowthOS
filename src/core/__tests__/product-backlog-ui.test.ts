import {test} from 'node:test';import {strict as assert} from 'node:assert';import {readFileSync} from 'node:fs';
const panel=readFileSync('src/app/product-backlog-panel.tsx','utf8');const competitor=readFileSync('src/app/competitor-workspace.tsx','utf8');
const css=readFileSync('src/app/globals.css','utf8');const page=readFileSync('src/app/page.tsx','utf8');
test('competitor selection flows into scoped local backlog and review-only handoff',()=>{
 assert.match(competitor,/opportunities=\{opportunities\}/);assert.match(competitor,/key=\{org\+site\}/);
 assert.match(panel,/fromCompetitorOpportunity\(o,scope\)/);assert.match(panel,/developmentHandoff\(current,scope,state\(current\)\)/);
 assert.match(panel,/Confirm replacement/);assert.match(panel,/setBacklog\(pending\)/);
 assert.doesNotMatch(panel,/fetch\(|method:['"]POST|method:['"]PATCH/);
});
test('mobile layouts, touch controls and navigation are present',()=>{
 assert.match(page,/id:'competitors',label:'Competitors'/);assert.match(css,/@media\(max-width:650px\)\{\.backlogFields,\.backlogCards\{grid-template-columns:1fr\}/);
 assert.match(css,/\.competitorWorkspace button\{min-height:44px\}/);assert.match(panel,/aria-label="Local product improvement backlog"/);
});
