import test from 'node:test';
import assert from 'node:assert/strict';
import { persistCompetitiveEvidence, type CompetitiveEvidenceStore } from '../competitive-evidence';
const now='2026-09-25T00:00:00.000Z';
const snapshot={siteId:'site-1',capturedAt:now,ours:{product:'Ours',features:[],evidenceUrl:'https://ours.example/pricing',capturedAt:now},competitors:[{name:'Peer',domain:'peer.example',similarity:.8,evidence:['https://peer.example/pricing'],inventory:{product:'Peer',features:[],evidenceUrl:'https://peer.example/pricing',capturedAt:now}}]};
class MemoryStore implements CompetitiveEvidenceStore { saved=0; async save(){this.saved++;return 'evidence-1';} async latest(){return snapshot;} }
test('persists dated source-backed competitive evidence',async()=>{const store=new MemoryStore();assert.equal(await persistCompetitiveEvidence(store,snapshot),'evidence-1');assert.equal(store.saved,1)});
test('rejects competitor evidence without source URL',async()=>{const store=new MemoryStore();const bad={...snapshot,competitors:[{...snapshot.competitors[0],inventory:{...snapshot.competitors[0].inventory,evidenceUrl:undefined}}]};await assert.rejects(()=>persistCompetitiveEvidence(store,bad),/COMPETITOR_PACKAGE_EVIDENCE_REQUIRED/);assert.equal(store.saved,0)});
test('rejects undated evidence before persistence',async()=>{const store=new MemoryStore();await assert.rejects(()=>persistCompetitiveEvidence(store,{...snapshot,capturedAt:'invalid'}),/COMPETITIVE_CAPTURE_TIME_REQUIRED/);assert.equal(store.saved,0)});
