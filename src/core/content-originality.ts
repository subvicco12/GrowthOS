/** Bounded local advisory, never a proof of global originality or a quality/approval grant. */
import {z} from 'zod';
import {factoryHash} from './content-factory';
const input=z.object({text:z.string().min(20).max(50000),corpus:z.array(z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),text:z.string().min(20).max(50000),snapshotHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(30)}).strict();
const tokens=(s:string)=>s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
function shingles(words:string[]):Set<string>{const out=new Set<string>();for(let i=0;i+7<=words.length;i++)out.add(factoryHash(words.slice(i,i+7)));return out;}
export function assessSuppliedCorpus(value:unknown):{status:'insufficient_evidence'|'potential_overlap'|'no_overlap_in_supplied_corpus';draftHash:string;corpusHash:string;matches:readonly {sourceId:string;matchingShingles:number}[];grantsQuality:false}{
 const parsed=input.parse(value);if(new Set(parsed.corpus.map(c=>c.id)).size!==parsed.corpus.length||parsed.corpus.some(c=>factoryHash(c.text)!==c.snapshotHash))throw Error('CORPUS_SNAPSHOT_INVALID');
 const draft=shingles(tokens(parsed.text)),matches=parsed.corpus.map(c=>({sourceId:c.id,matchingShingles:[...shingles(tokens(c.text))].filter(s=>draft.has(s)).length})).filter(m=>m.matchingShingles>0);
 return {status:!parsed.corpus.length||!draft.size?'insufficient_evidence':matches.length?'potential_overlap':'no_overlap_in_supplied_corpus',draftHash:factoryHash(parsed.text),corpusHash:factoryHash(parsed.corpus.map(c=>[c.id,c.snapshotHash])),matches,grantsQuality:false};
}
