import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import { orgA,orgB,siteA,siteB,approvalA,actors } from './fixture.mjs';
const e=process.env;
execFileSync(process.execPath,['staging/preflight.cjs'],{stdio:'inherit',env:e});
if (e.GROWTHOS_TEST_DB_DISPOSABLE!=='YES') throw Error('REFUSED: disposable opt-in required');
const ca=fs.readFileSync(`${e.GROWTHOS_STAGING_CERT_DIR}/cert.pem`);
const db=await mysql.createConnection({host:'127.0.0.1',port:33317,user:e.GROWTHOS_DB_USER,password:e.GROWTHOS_DB_PASSWORD,database:e.GROWTHOS_DB_NAME,multipleStatements:false});
let assertions=0;
function assert(value,message) { if (!value) throw Error('FAIL: '+message); assertions++; console.log('PASS '+message); }
async function http(path,method='GET',body,options={}) {
  const payload=body===undefined?undefined:JSON.stringify(body);
  return new Promise((resolve,reject)=>{
    const req=https.request({host:'127.0.0.1',port:34443,servername:'growthos.test',ca,rejectUnauthorized:true,path,method,headers:{host:options.host||'growthos.test:34443',origin:options.origin||'https://growthos.test:34443',...(payload?{'content-type':'application/json','content-length':Buffer.byteLength(payload)}:{}),...(options.cookie?{cookie:options.cookie}:{}),...(options.forwarded?{'x-forwarded-host':'evil.example','x-forwarded-proto':'http'}:{})}},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString();let data;try{data=JSON.parse(text);}catch{data={};}resolve({status:res.statusCode,data,cookies:res.headers['set-cookie']||[]});});
    });req.on('error',reject);req.end(payload);
  });
}
const cookie=(res,name)=>res.cookies.map(x=>x.split(';')[0]).find(x=>x.startsWith(name+'='));
const select=async (session,org)=>{
  const r=await http('/api/organizations/selection','POST',{organizationId:org},{cookie:session});
  assert(r.status===200,'organization selected');return session+'; '+cookie(r,'growthos_organization');
};
try {
  const [[identity]]=await db.query('SELECT DATABASE() AS db,VERSION() AS version');
  assert(identity.db===e.GROWTHOS_DB_NAME&&/^11\.8\./.test(identity.version),'disposable MariaDB 11.8 identity');
  const [users]=await db.query('SELECT email FROM growth_users ORDER BY email');
  assert(users.length===6&&users.every(x=>x.email.endsWith('@growthos.example.invalid')),'six synthetic users only');
  const [flags]=await db.query('SELECT status,automation_enabled,auto_publish_enabled FROM growth_websites');
  assert(flags.length===2&&flags.every(x=>x.status==='draft'&&!x.automation_enabled&&!x.auto_publish_enabled),'publishing and automation remain disabled');
  const unauth=await http('/api/organization-approvals');assert(unauth.status===401,'unauthenticated approval inbox rejected');
  const sessions={};
  for(const actor of actors) {
    const login=await http('/api/auth/login','POST',{email:actor.email,password:e.GROWTHOS_STAGING_USER_PASSWORD});
    assert(login.status===200,actor.role+' '+actor.org+' real HTTP login');
    sessions[actor.email]=cookie(login,'growthos_session');
    assert(!!sessions[actor.email]&&login.cookies.some(x=>x.includes('HttpOnly')&&x.includes('Secure')&&x.includes('SameSite=Lax')),'secure session cookie');
  }
  const ownerA=await select(sessions[actors[0].email],orgA);
  const adminA=await select(sessions[actors[1].email],orgA);
  const viewerA=await select(sessions[actors[2].email],orgA);
  const ownerB=await select(sessions[actors[3].email],orgB);
  const deniedChoice=await http('/api/organizations/selection','POST',{organizationId:orgB},{cookie:sessions[actors[0].email]});
  assert(deniedChoice.status===403,'cross-tenant organization selection denied');
  const patch={websiteId:siteA,feature:'automation',enabled:false};
  assert((await http('/api/website-features','PATCH',patch,{cookie:viewerA})).status===403,'viewer feature mutation denied');
  assert((await http('/api/website-features','PATCH',{...patch,websiteId:siteB},{cookie:adminA})).status===404,'cross-tenant website mutation denied');
  assert((await http('/api/website-features','PATCH',patch,{cookie:adminA})).status===200,'admin idempotent disable accepted');
  const approval={organizationId:orgA,websiteId:siteA,approvalId:approvalA,idempotencyKey:'staging-replay-001',decision:'approved'};
  assert((await http('/api/admin/approvals/decide','POST',approval,{cookie:viewerA})).status===403,'viewer approval denied');
  assert((await http('/api/admin/approvals/decide','POST',approval,{cookie:ownerB})).status===403,'cross-tenant approval denied');
  const first=await http('/api/admin/approvals/decide','POST',approval,{cookie:ownerA});
  assert(first.status===200&&first.data.replay===false&&first.data.externalAction===false,'owner internal approval committed without external action');
  const replay=await http('/api/admin/approvals/decide','POST',approval,{cookie:ownerA});
  assert(replay.status===200&&replay.data.replay===true&&replay.data.decisionId===first.data.decisionId,'approval replay idempotent');
  assert((await http('/api/auth/logout','POST',undefined,{cookie:sessions[actors[0].email]})).status===200,'logout succeeded');
  assert((await http('/api/organization-approvals','GET',undefined,{cookie:ownerA})).status===401,'revoked session denied');
  assert((await http('/api/auth/login','POST',{email:actors[0].email,password:e.GROWTHOS_STAGING_USER_PASSWORD},{host:'evil.example',forwarded:true})).status===421,'unknown Host rejected at proxy');
  assert((await http('/api/website-features','PATCH',patch,{cookie:adminA,origin:'https://evil.example',forwarded:true})).status===403,'spoofed forwarding headers do not bypass origin');
  const direct=await new Promise(resolve=>{const sock=net.connect({host:'127.0.0.1',port:3000});sock.once('connect',()=>{sock.destroy();resolve(false);});sock.once('error',()=>resolve(true));});
  assert(direct,'direct backend not published on host');
  const [[{n}]]=await db.query('SELECT COUNT(*) AS n FROM growth_approval_decisions');
  assert(n===1,'one immutable approval audit row after replay');
  for (const sql of ['UPDATE growth_approval_decisions SET note=? WHERE id=?','DELETE FROM growth_approval_decisions WHERE id=?']) {
    let refused=false;
    try { await db.execute(sql,sql.startsWith('UPDATE')?['tamper',first.data.decisionId]:[first.data.decisionId]); }
    catch(error) { refused=error.sqlState==='45000'; }
    assert(refused,'approval audit trigger refused '+sql.split(' ')[0]);
  }
  const [[{stillPresent}]]=await db.query('SELECT COUNT(*) AS stillPresent FROM growth_approval_decisions WHERE id=?',[first.data.decisionId]);
  assert(stillPresent===1,'approval audit row remains intact');
  const [[{status}]]=await db.query('SELECT status FROM growth_approval_queue WHERE id=?',[approvalA]);
  assert(status==='approved','approval queue transitioned once');
  const [finalFlags]=await db.query('SELECT automation_enabled,auto_publish_enabled FROM growth_websites');
  assert(finalFlags.every(x=>!x.automation_enabled&&!x.auto_publish_enabled),'feature flags remain disabled');
  const [[{featureAudit}]]=await db.query('SELECT COUNT(*) AS featureAudit FROM growth_website_feature_audit');
  assert(featureAudit===0,'idempotent disable created no false audit event');
  console.log(`PASS ${assertions} authenticated staging assertions`);
} finally { await db.end(); }
