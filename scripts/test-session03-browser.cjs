#!/usr/bin/env node
// Local synthetic fixtures only. Run with --import=tsx, never against production.
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const {assertSession03Runtime}=require('../src/server/isolated-operations-http.ts');
const {MySQLIsolatedOperations}=require('../src/server/mysql-isolated-operations.ts');
const {decideInternalApproval}=require('../src/server/mysql-approval-decision.ts');
assertSession03Runtime();const base=new URL(process.env.GROWTHOS_E2E_BASE_URL||'https://localhost:33319');
if(base.protocol!=='https:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password){console.error('REFUSED: local HTTPS browser origin required');process.exit(2);}
(async()=>{
 const {chromium}=require(process.env.GROWTHOS_PLAYWRIGHT_MODULE||'playwright');const pool=require('mysql2/promise').createPool({host:process.env.GROWTHOS_DB_HOST,port:Number(process.env.GROWTHOS_DB_PORT||3306),database:process.env.GROWTHOS_DB_NAME,user:process.env.GROWTHOS_DB_USER,password:process.env.GROWTHOS_DB_PASSWORD});let browser;
 try{
  const org=randomUUID(),site=randomUUID(),owner=randomUUID(),viewer=randomUUID(),domain=site+'.example.invalid',tokens=[];
  await pool.execute('INSERT INTO growth_organizations(id,name) VALUES (?,?)',[org,'Session 03 synthetic browser']);await pool.execute("INSERT INTO growth_websites(id,organization_id,domain,platform) VALUES (?,?,?,'wordpress')",[site,org,domain]);
  for(const [user,role]of [[owner,'owner'],[viewer,'viewer']]){const token=randomBytes(32).toString('base64url');tokens.push(token);await pool.execute('INSERT INTO growth_users(id,email,password_hash,disabled) VALUES (?,?,?,FALSE)',[user,user+'@example.invalid','no-login-test-only']);await pool.execute('INSERT INTO growth_memberships(organization_id,user_id,role) VALUES (?,?,?)',[org,user,role]);await pool.execute('INSERT INTO growth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))',[randomUUID(),user,createHash('sha256').update(token).digest('hex')]);}
  let proof='';const service=new MySQLIsolatedOperations(pool,{read:async()=>proof}),s={organizationId:org,websiteId:site,actorId:owner};
  const challenge=await service.issueOwnership(s);proof=challenge.fileContent;await service.verifyOwnership(s,challenge.id,challenge.token);
  // Positive ownership here is a controlled fixture response, never an external website result.
  const job=await service.createAnalysis(s,{organizationId:org,websiteId:site,requestKey:randomUUID(),sourceLabel:'Browser leased analysis',observedAt:new Date().toISOString(),runAfter:new Date().toISOString(),evidence:{websiteId:site,pages:[{url:'https://'+domain+'/',status:200,indexable:true,h1Count:0,wordCount:20,internalLinks:0}]}});
  const [[approval]]=await pool.execute('SELECT approval_id FROM growth_dev_analysis_jobs WHERE id=?',[job.id]);await decideInternalApproval({organizationId:org,websiteId:site,approvalId:approval.approval_id,actorId:owner,idempotencyKey:randomUUID(),decision:'approved'});
  for(let i=0;i<28;i++)await pool.execute("INSERT INTO growth_dev_analysis_jobs(id,organization_id,website_id,actor_id,request_key,input_hash,source_label,observed_at,input_json,approval_id,status,run_after) SELECT ?,organization_id,website_id,actor_id,?, ?,?,observed_at,input_json,approval_id,'cancelled',run_after FROM growth_dev_analysis_jobs WHERE id=?",[randomUUID(),randomUUID(),'a'.repeat(64),'Pagination browser fixture '+i,job.id]);
  browser=await chromium.launch({executablePath:process.env.GROWTHOS_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900},timezoneId:'UTC'});await context.route('**/*',route=>new URL(route.request().url()).origin===base.origin?route.continue():route.abort());
  const cookies=async token=>{await context.clearCookies();await context.addCookies([{name:'growthos_session',value:token,url:base.origin,secure:true,httpOnly:true,sameSite:'Lax'},{name:'growthos_organization',value:org,url:base.origin,secure:true,httpOnly:true,sameSite:'Lax'}]);};await cookies(tokens[0]);const page=await context.newPage();
  await page.goto(base.origin+'/#websites');await page.getByRole('button',{name:'View settings',exact:true}).click();const panel=page.getByRole('region',{name:'Leased workers and connector operations'});await panel.getByRole('button',{name:'Enroll synthetic read-only connector',exact:true}).waitFor();
  const refresh=async()=>{const response=page.waitForResponse(r=>r.url().includes('/api/isolated-operations?')&&r.url().includes('stream=overview'));await panel.getByRole('button',{name:'Refresh operations',exact:true}).click();assert.equal((await response).status(),200);await panel.getByRole('button',{name:'Refresh operations',exact:true}).waitFor();};
  const operation=async label=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/isolated-operations')&&r.request().method()==='POST');await panel.getByRole('button',{name:label,exact:true}).click();assert.equal((await response).status(),200);await refresh();};
  await operation('Enroll synthetic read-only connector');await operation('Check authenticated synthetic health');await panel.getByText('Connector: enrolled · synthetic_healthy.',{exact:false}).waitFor();
  console.log('PASS browser: encrypted enrollment and authenticated explicitly synthetic read-only health');
  await operation('Run one synthetic worker cycle');await panel.getByText('completed: 1',{exact:false}).waitFor();
  await panel.getByRole('button',{name:'Load older operations',exact:true}).click();await panel.getByText('Browser leased analysis',{exact:true}).waitFor();assert.equal(await panel.locator('article.auditEntry').count(),29);
  console.log('PASS browser: leased worker completion and paginated job history');
  await panel.getByLabel('Operations history stream',{exact:true}).selectOption('recommendations');await panel.getByText('Source hash:',{exact:false}).first().waitFor();await panel.getByLabel('Operations history stream',{exact:true}).selectOption('attempts');await panel.getByText('worker_completed',{exact:true}).first().waitFor();
  console.log('PASS browser: research provenance, recommendations and immutable attempt history');
  await operation('Revoke ownership authority');await panel.getByText('revoked',{exact:true}).first().waitFor();assert.equal(await panel.getByRole('button',{name:'Check authenticated synthetic health',exact:true}).isDisabled(),true);
  console.log('PASS browser: ownership revocation disables connector health authority');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);await cookies(tokens[1]);await page.reload();await page.getByRole('button',{name:'View settings',exact:true}).click();await panel.getByText('revoked',{exact:true}).first().waitFor();assert.equal(await panel.getByRole('button',{name:'Run one synthetic worker cycle',exact:true}).count(),0);
  console.log('PASS browser: mobile width and tenant viewer read-only monitoring');await context.close();console.log('PASS 5 Session 03 browser scenarios; synthetic adapters only');
 }finally{if(browser)await browser.close();await pool.end();await require('../src/server/mysql.ts').getMySQLPool().end();}
})().catch(error=>{console.error(error);process.exitCode=1;});
