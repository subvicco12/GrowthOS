import {request} from 'node:http';
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import type {Pool,PoolConnection,RowDataPacket} from 'mysql2/promise';
import {assertCompatibleDevelopmentSchema} from './schema-compatibility';
import {Session04Portfolio} from './session04-portfolio';
import {assertOwnershipGrant} from './session03-authority';
import {encryptConnectorKey,decryptConnectorKey} from './synthetic-connector-security';
import type {WorkScope} from './mysql-isolated-workflows';
export interface WordPressFixtureTransport {call(route:'enroll'|'health'|'revoke',body:unknown,signature?:string):Promise<any>}
export function localWordPressFixtureTransport(env:Record<string,string|undefined>=process.env):WordPressFixtureTransport{
 const base=new URL(env.GROWTHOS_WORDPRESS_FIXTURE_URL||'http://127.0.0.1:33320');
 if(base.origin!=='http://127.0.0.1:33320'||base.pathname!=='/'||base.search||base.hash||base.username||base.password||env.GROWTHOS_SESSION04_DISPOSABLE!=='YES'||!env.GROWTHOS_RO_FIXTURE_ADMIN_TOKEN)throw Error('WORDPRESS_FIXTURE_UNAVAILABLE');
 return {call(route,body,signature){return new Promise((resolve,reject)=>{const payload=JSON.stringify(body);if(Buffer.byteLength(payload)>4096){reject(Error('FIXTURE_BODY_LIMIT'));return;}
 const req=request({hostname:'127.0.0.1',port:33320,path:'/index.php?rest_route=/growthos-ro/v1/'+route,method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(payload),...(route==='health'?{'x-growthos-ro-signature':signature||''}:{'x-growthos-fixture-admin':env.GROWTHOS_RO_FIXTURE_ADMIN_TOKEN!})}},response=>{
  if(response.statusCode!==200){response.destroy();reject(Error('FIXTURE_REQUEST_REFUSED'));return;}let size=0;const chunks:Buffer[]=[];response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>16384){response.destroy(Error('FIXTURE_RESPONSE_LIMIT'));return;}chunks.push(chunk);});response.on('error',reject);response.on('end',()=>{try{resolve(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));}catch{reject(Error('FIXTURE_RESPONSE_INVALID'));}});
 });const timer=setTimeout(()=>req.destroy(Error('FIXTURE_TIMEOUT')),3000);req.on('error',reject);req.on('close',()=>clearTimeout(timer));req.end(payload);
 });}};
}
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
type Row=RowDataPacket&Record<string,any>;
export class WordPressFixtureService extends Session04Portfolio{
 constructor(pool:Pick<Pool,'getConnection'>,private readonly transport:WordPressFixtureTransport,private readonly wpMaster:()=>string=()=>process.env.GROWTHOS_DEV_CONNECTOR_KEY||''){super(pool);}
 private binding(s:WorkScope,row:Row){return ['wordpress_fixture',s.organizationId,s.websiteId,row.id,row.authority_epoch,row.credential_revision].join('|');}
 private async wpIncident(c:PoolConnection,s:WorkScope,kind:string){await this.event(c,s,s.websiteId,kind);await c.execute('INSERT INTO growth_dev_incidents(id,organization_id,website_id,actor_id,kind,detail) VALUES (?,?,?,?,?,?)',[randomUUID(),s.organizationId,s.websiteId,s.actorId,kind,'Local WordPress fixture only; not production trust']);}
 async enrollWordPress(s:WorkScope){const pending=await this.transaction(async c=>{
  await assertCompatibleDevelopmentSchema(c);const site=await this.site(c,s),epoch=await assertOwnershipGrant(c,s,Date.now());if(site.platform!=='wordpress'||['paused','archived'].includes(site.status))throw Error('CONNECTOR_PREREQUISITE_REQUIRED');
  const [rows]=await c.execute<Row[]>('SELECT * FROM growth_dev_wordpress_fixtures WHERE organization_id=? AND website_id=? FOR UPDATE',[s.organizationId,s.websiteId]);const old=rows[0];
  const row={id:old?.id||randomUUID(),authority_epoch:epoch,credential_revision:old?.state==='pending'&&Number(old.authority_epoch)===epoch?Number(old.credential_revision):Number(old?.credential_revision||0)+1}as Row;
  const secret=old?.state==='pending'&&Number(old.authority_epoch)===epoch?decryptConnectorKey(old.encrypted_key,this.wpMaster(),this.binding(s,row)):randomBytes(32).toString('base64url');
  const encrypted=encryptConnectorKey(secret,this.wpMaster(),this.binding(s,row)),fingerprint=sha(secret);
  await c.execute("INSERT INTO growth_dev_wordpress_fixtures(id,organization_id,website_id,authority_epoch,credential_revision,encrypted_key,fingerprint,state) VALUES (?,?,?,?,?,?,?,'pending') ON DUPLICATE KEY UPDATE authority_epoch=VALUES(authority_epoch),credential_revision=VALUES(credential_revision),encrypted_key=VALUES(encrypted_key),fingerprint=VALUES(fingerprint),state='pending',health_state='unknown'",[row.id,s.organizationId,s.websiteId,epoch,row.credential_revision,encrypted,fingerprint]);
  return {id:String(row.id),authority_epoch:Number(row.authority_epoch),credential_revision:Number(row.credential_revision),secret,fingerprint,domain:String(site.domain)};});
 const result=await this.transport.call('enroll',{connectorId:pending.id,organizationId:s.organizationId,websiteId:s.websiteId,domain:pending.domain,revision:pending.credential_revision,secret:pending.secret,mode:'wordpress_fixture'});
 if(result.mode!=='wordpress_fixture'||result.fingerprint!==pending.fingerprint||JSON.stringify(result.capabilities)!=='["health:read"]')throw Error('CONNECTOR_ENROLLMENT_REFUSED');
 return this.transaction(async c=>{await assertCompatibleDevelopmentSchema(c);await this.site(c,s);if(await assertOwnershipGrant(c,s,Date.now())!==Number(pending.authority_epoch))throw Error('OWNERSHIP_AUTHORITY_REQUIRED');
  const [rows]=await c.execute<Row[]>('SELECT fingerprint,state FROM growth_dev_wordpress_fixtures WHERE organization_id=? AND website_id=? FOR UPDATE',[s.organizationId,s.websiteId]);if(rows[0]?.fingerprint!==pending.fingerprint||rows[0]?.state!=='pending')throw Error('CONNECTOR_ENROLLMENT_REFUSED');
  await c.execute("UPDATE growth_dev_wordpress_fixtures SET state='enrolled' WHERE organization_id=? AND website_id=?",[s.organizationId,s.websiteId]);await this.wpIncident(c,s,'wordpress_fixture_enrolled');return {mode:'wordpress_fixture',fingerprint:pending.fingerprint,revision:pending.credential_revision,productionTrusted:false};});
 }
 async healthWordPress(s:WorkScope){const info=await this.transaction(async c=>{await assertCompatibleDevelopmentSchema(c);const site=await this.site(c,s),epoch=await assertOwnershipGrant(c,s,Date.now());if(['paused','archived'].includes(site.status))throw Error('WEBSITE_STOPPED');const [rows]=await c.execute<Row[]>('SELECT * FROM growth_dev_wordpress_fixtures WHERE organization_id=? AND website_id=? FOR UPDATE',[s.organizationId,s.websiteId]);const row=rows[0];if(!row||row.state!=='enrolled'||Number(row.authority_epoch)!==epoch)throw Error('CONNECTOR_ENROLLMENT_REQUIRED');return {id:String(row.id),authority_epoch:Number(row.authority_epoch),credential_revision:Number(row.credential_revision),fingerprint:String(row.fingerprint),domain:String(site.domain),secret:decryptConnectorKey(row.encrypted_key,this.wpMaster(),this.binding(s,row))};});
 const payload={connectorId:info.id,organizationId:s.organizationId,websiteId:s.websiteId,domain:info.domain,revision:Number(info.credential_revision),nonce:randomUUID(),observedAt:new Date().toISOString(),mode:'wordpress_fixture'};
 let ok=false;try{const response=await this.transport.call('health',payload,createHmac('sha256',info.secret).update(JSON.stringify(payload)).digest('hex'));const expected={...payload,capabilities:['health:read'],wordpressVersion:response.payload?.wordpressVersion,status:'ok'};
  if(typeof expected.wordpressVersion!=='string'||JSON.stringify(expected)!==JSON.stringify(response.payload)||!/^[a-f0-9]{64}$/.test(response.signature))throw Error('FIXTURE_RESPONSE_INVALID');
  ok=timingSafeEqual(Buffer.from(response.signature,'hex'),createHmac('sha256',info.secret).update(JSON.stringify(response.payload)).digest());
 }catch{ok=false;}
 return this.transaction(async c=>{await assertCompatibleDevelopmentSchema(c);await this.site(c,s);const epoch=await assertOwnershipGrant(c,s,Date.now());const [rows]=await c.execute<Row[]>('SELECT state,fingerprint,authority_epoch FROM growth_dev_wordpress_fixtures WHERE organization_id=? AND website_id=? FOR UPDATE',[s.organizationId,s.websiteId]);if(epoch!==Number(info.authority_epoch)||rows[0]?.state!=='enrolled'||rows[0]?.fingerprint!==info.fingerprint)throw Error('CONNECTOR_ENROLLMENT_REQUIRED');
  await c.execute('UPDATE growth_dev_wordpress_fixtures SET health_state=?,checked_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=?',[ok?'wordpress_fixture_healthy':'failed',s.organizationId,s.websiteId]);await this.wpIncident(c,s,ok?'wordpress_fixture_health_ok':'wordpress_fixture_health_failed');return {mode:'wordpress_fixture',state:ok?'wordpress_fixture_healthy':'failed',productionTrusted:false};});
 }
 async revokeWordPress(s:WorkScope){const id=await this.transaction(async c=>{await assertCompatibleDevelopmentSchema(c);await this.site(c,s);const [rows]=await c.execute<Row[]>('SELECT id FROM growth_dev_wordpress_fixtures WHERE organization_id=? AND website_id=? FOR UPDATE',[s.organizationId,s.websiteId]);await c.execute("UPDATE growth_dev_wordpress_fixtures SET state='revoked',health_state='unknown' WHERE organization_id=? AND website_id=?",[s.organizationId,s.websiteId]);await this.wpIncident(c,s,'wordpress_fixture_revoked');return rows[0]?.id;});
 let remoteAcknowledged=false;if(id)try{const result=await this.transport.call('revoke',{connectorId:id});remoteAcknowledged=result.revoked===true;}catch{/* Local revocation remains enforced. */}return {revoked:true,remoteAcknowledged,productionTrusted:false};}
}
