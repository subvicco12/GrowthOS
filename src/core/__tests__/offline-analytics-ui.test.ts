import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const read=(path:string)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
test('responsive scoped offline analytics view never creates server mutations',()=>{
 const ui=read('app/analytics-panel.tsx'),shell=read('app/page.tsx'),css=read('app/globals.css');
 for(const text of ['organization-websites','credentials:\'include\'','cache:\'no-store\'','file.size>500_000',
  'Replace local observations','Export safe CSV','Provenance:','Unavailable','Analytics & Performance'])assert.ok(ui.includes(text),text);
 assert.ok(shell.includes("section==='analytics'&&<AnalyticsPanel/>"));
 assert.ok(css.includes('@media(max-width:520px){.analyticsControls'));
 assert.ok(!ui.includes("method:'POST'"));
});
