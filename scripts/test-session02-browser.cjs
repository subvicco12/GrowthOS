#!/usr/bin/env node
// Development proposal only: real local HTTPS app and disposable MariaDB, no external navigation.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const base = new URL(process.env.GROWTHOS_E2E_BASE_URL || 'https://localhost:33319');
if (process.env.GROWTHOS_SESSION02_DISPOSABLE !== 'YES' || process.env.GROWTHOS_TEST_DB_DISPOSABLE !== 'YES' ||
    !/^growthos_test_[a-zA-Z0-9_]+$/.test(process.env.GROWTHOS_DB_NAME || '') || !['127.0.0.1','localhost','::1'].includes(process.env.GROWTHOS_DB_HOST || '') ||
    !['127.0.0.1','localhost','[::1]'].includes(base.hostname) || base.protocol !== 'https:' || base.username || base.password) {
  console.error('REFUSED: Session 02 browser requires explicit disposable schema and local HTTPS app.'); process.exit(2);
}
(async () => {
  const { chromium } = require(process.env.GROWTHOS_PLAYWRIGHT_MODULE || 'playwright');
  const pool = require('mysql2/promise').createPool({ host: process.env.GROWTHOS_DB_HOST, port: Number(process.env.GROWTHOS_DB_PORT || 3306),
    user: process.env.GROWTHOS_DB_USER, password: process.env.GROWTHOS_DB_PASSWORD, database: process.env.GROWTHOS_DB_NAME });
  let browser;
  try {
    const org=randomUUID(), site=randomUUID(), tokens=[];
    await pool.execute('INSERT INTO growth_organizations(id,name) VALUES (?,?)',[org,'Session 02 browser fixture']);
    const domain=site+'.example.invalid';
    await pool.execute("INSERT INTO growth_websites(id,organization_id,domain,platform) VALUES (?,?,?,'wordpress')",[site,org,domain]);
    for(const role of ['owner','viewer']){
      const user=randomUUID(),token=randomBytes(32).toString('base64url');tokens.push(token);
      await pool.execute('INSERT INTO growth_users(id,email,password_hash,disabled) VALUES (?,?,?,FALSE)',[user,user+'@example.invalid','test-only-no-login']);
      await pool.execute('INSERT INTO growth_memberships(organization_id,user_id,role) VALUES (?,?,?)',[org,user,role]);
      await pool.execute('INSERT INTO growth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))',[randomUUID(),user,createHash('sha256').update(token).digest('hex')]);
    }
    browser=await chromium.launch({executablePath:process.env.GROWTHOS_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900},timezoneId:'UTC'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===base.origin?route.continue():route.abort());
    async function cookies(token){await context.clearCookies();await context.addCookies([
      {name:'growthos_session',value:token,url:base.origin,secure:true,httpOnly:true,sameSite:'Lax'},
      {name:'growthos_organization',value:org,url:base.origin,secure:true,httpOnly:true,sameSite:'Lax'}]);}
    await cookies(tokens[0]);const page=await context.newPage();
    async function open(){await page.goto(base.origin+'/#websites');await page.getByRole('button',{name:'View settings',exact:true}).click();await page.getByRole('button',{name:'Create ownership challenge',exact:true}).waitFor();}
    await open();const panel=page.getByRole('region',{name:'Ownership and durable analysis'});
    async function click(label,method='PATCH',expected=200,locator=panel){
      const response=page.waitForResponse(r=>r.url().includes('/api/isolated-workflows')&&r.request().method()===method);
      await locator.getByRole('button',{name:label,exact:true}).click();const r=await response;assert.equal(r.status(),expected,await r.text());return r;
    }
    await click('Create ownership challenge');await panel.getByText('Verification requires an operator allowlist entry',{exact:false}).waitFor();
    await click('Verify ownership file');await panel.getByText('Ownership was not verified:',{exact:false}).waitFor();
    console.log('PASS browser: persisted ownership challenge and explicit unavailable external proof');
    await panel.getByLabel('Research source label',{exact:true}).fill('Browser manual research fixture');
    await panel.getByLabel('Observed at',{exact:true}).fill(new Date().toISOString().slice(0,16));
    await panel.getByLabel('Page observations JSON',{exact:true}).fill(JSON.stringify([{url:'https://'+domain+'/',status:200,indexable:true,title:'',h1Count:0,wordCount:20,internalLinks:0}]));
    await panel.getByLabel('Competitor claims JSON (optional)',{exact:true}).fill(JSON.stringify([{evidenceUrl:'https://competitor.example.invalid/features',featureName:'Browser supplied claim',plan:'free',ourAvailability:'unknown'}]));
    await click('Save analysis for internal approval','POST',201);
    const job=panel.locator('article.auditEntry').filter({has:page.getByText('Browser manual research fixture',{exact:true})});
    const approval=page.waitForResponse(r=>r.url().endsWith('/api/admin/approvals/decide')&&r.request().method()==='POST');
    await job.getByRole('button',{name:'Approve internal analysis',exact:true}).click();assert.equal((await approval).status(),200);
    await click('Run due local analysis','PATCH',200,job);
    await job.getByText('completed · approval approved',{exact:false}).waitFor();
    await panel.getByRole('heading',{name:'Persisted recommendations and growth opportunities (up to 100)'}).waitFor();
    assert.ok(await panel.getByRole('button',{name:'Approve for internal planning',exact:true}).count());
    console.log('PASS browser: persisted source, approval-gated local analysis and derived recommendations');
    const decision=page.waitForResponse(r=>r.url().endsWith('/api/admin/approvals/decide')&&r.request().method()==='POST');
    await panel.getByRole('button',{name:'Approve for internal planning',exact:true}).first().click();assert.equal((await decision).status(),200);
    await panel.getByText('internal status approved',{exact:false}).first().waitFor();
    await page.reload();await page.getByRole('button',{name:'View settings',exact:true}).click();
    await panel.getByText('completed · approval approved',{exact:false}).waitFor();await panel.getByText('internal status approved',{exact:false}).first().waitFor();
    console.log('PASS browser: result and recommendation status survive full reload');
    await panel.getByLabel('Research source label',{exact:true}).fill('Browser cancellation fixture');
    await panel.getByLabel('Observed at',{exact:true}).fill(new Date().toISOString().slice(0,16));
    await panel.getByLabel('Page observations JSON',{exact:true}).fill(JSON.stringify([{url:'https://'+domain+'/',status:200,indexable:true,h1Count:1,wordCount:100,internalLinks:1}]));
    await click('Save analysis for internal approval','POST',201);
    const cancel=panel.locator('article.auditEntry').filter({has:page.getByText('Browser cancellation fixture',{exact:true})});
    await click('Cancel analysis','PATCH',200,cancel);await cancel.getByText('cancelled · approval pending',{exact:false}).waitFor();
    console.log('PASS browser: queued analysis cancellation is durable');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    console.log('PASS browser: durable workflow panel fits 390px viewport');
    await cookies(tokens[1]);await page.reload();await page.getByRole('button',{name:'View settings',exact:true}).click();
    await panel.getByText('completed · approval approved',{exact:false}).waitFor();
    assert.equal(await panel.getByRole('button',{name:'Create ownership challenge',exact:true}).count(),0);
    assert.equal(await panel.getByRole('button',{name:'Save analysis for internal approval',exact:true}).count(),0);
    assert.equal(await panel.getByRole('button',{name:'Approve for internal planning',exact:true}).count(),0);
    console.log('PASS browser: viewer sees persisted records without mutation controls');
    console.log('PASS 6 Session 02 browser scenarios; no external requests or live automation');await context.close();
  }finally{if(browser)await browser.close();await pool.end();}
})().catch(error=>{console.error(error);process.exitCode=1;});
