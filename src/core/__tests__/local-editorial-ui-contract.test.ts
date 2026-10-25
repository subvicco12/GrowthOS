import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=(path:string)=>readFileSync(new URL(path,root),'utf8');
test('editorial UI exposes native file transfer, local confirmation, revision controls and mobile layout',()=>{
 const studio=read('app/content-campaign-studio.tsx');const panel=read('app/intelligence-panel.tsx');
 const shell=read('app/page.tsx');const css=read('app/globals.css');
 for(const phrase of ['type="file"','Replace local preview','Revision history','Undo as new revision','beforeunload',
   'Download local JSON package','onDirtyChange','Local editorial preparation state'])assert.ok(studio.includes(phrase),phrase);
 assert.ok(panel.includes('mayReplaceLocalWork'));assert.ok(shell.includes('allowLeavingStudio'));
 assert.ok(css.includes('.studioTransfer'));assert.ok(css.includes('@media(max-width:760px){.studioActions'));
 assert.ok(!studio.includes('fetch('));
});
