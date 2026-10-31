import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getMySQLPool } from '../../server/mysql';
import { issueMySQLSession } from '../../server/mysql-session';
import { getAuthenticatedOrganizationContext } from '../../server/organization-context';
import { MySQLIsolatedWorkflows } from '../../server/mysql-isolated-workflows';
import { createIsolatedWorkflowHandlers } from '../../server/isolated-workflows-http';
import { decideInternalApproval } from '../../server/mysql-approval-decision';
import { createOwnershipTransport } from '../../server/bounded-ownership-fetch';

const enabled = process.env.GROWTHOS_SESSION02_DISPOSABLE === 'YES' && process.env.GROWTHOS_TEST_DB_DISPOSABLE === 'YES' &&
  /^growthos_test_[a-zA-Z0-9_]+$/.test(process.env.GROWTHOS_DB_NAME ?? '') && ['127.0.0.1','localhost','::1'].includes(process.env.GROWTHOS_DB_HOST ?? '');
const integration = enabled ? test : test.skip;
if (enabled) after(async () => { await getMySQLPool().end(); });

integration('real-session ownership, connector drafts, durable analysis lifecycle, quotas, approvals and immutable evidence history', async () => {
  process.env.GROWTHOS_APP_ORIGIN = 'https://growthos.example';
  const db = getMySQLPool(), org = randomUUID(), other = randomUUID(), website = randomUUID(), otherSite = randomUUID();
  const owner = randomUUID(), editor = randomUUID(), viewer = randomUUID(), tokens: Record<string,string> = {};
  await db.execute('INSERT INTO growth_organizations(id,name) VALUES (?,?),(?,?)', [org,'Session 02 test',other,'Other tenant']);
  for (const [id,organizationId] of [[website,org],[otherSite,other]]) await db.execute("INSERT INTO growth_websites(id,organization_id,domain,platform) VALUES (?,?,?,'wordpress')", [id,organizationId,'owned.example.org']);
  for (const [actor,role] of [[owner,'owner'],[editor,'editor'],[viewer,'viewer']]) {
    await db.execute('INSERT INTO growth_users(id,email,password_hash,disabled) VALUES (?,?,?,FALSE)', [actor,actor+'@example.invalid','no-login-test-only']);
    await db.execute('INSERT INTO growth_memberships(organization_id,user_id,role) VALUES (?,?,?)',[org,actor,role]); tokens[role] = (await issueMySQLSession(actor)).token;
  }
  let proofBody = '', reads = 0, now = Date.now();
  const transport = createOwnershipTransport(['owned.example.org'], { resolve: async () => ['8.8.8.8'], readPinned: async () => { reads++; return proofBody; } });
  const store = new MySQLIsolatedWorkflows(db, transport, () => now);
  const handlers = createIsolatedWorkflowHandlers(getAuthenticatedOrganizationContext, () => store);
  const scope = {organizationId:org,websiteId:website}, authority = {...scope,actorId:owner};
  const request = (body?: unknown, role = 'owner', query = scope) => new Request('https://growthos.example/api/isolated-workflows?'+new URLSearchParams(query),{
    method:body===undefined?'GET':'PATCH', headers:{origin:'https://growthos.example',host:'growthos.example',cookie:`growthos_session=${tokens[role]||''}; growthos_organization=${org}`}, ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const patch = async (body: Record<string,unknown>, expected = 200, role = 'owner') => { const response=await handlers.PATCH(request({...scope,...body},role)); const data=await response.json(); assert.equal(response.status,expected,JSON.stringify(data)); return data; };
  assert.equal((await handlers.GET(request(undefined,'anonymous'))).status,401);
  assert.equal((await handlers.GET(request(undefined,'owner',{organizationId:org,websiteId:otherSite}))).status,404);
  assert.equal((await handlers.GET(request(undefined,'owner',{organizationId:other,websiteId:otherSite}))).status,403);
  await patch({action:'issue'},403,'viewer');
  const challenge = (await patch({action:'issue'})).result;
  const [[stored]] = await db.execute<RowDataPacket[]>('SELECT token_hash FROM growth_dev_ownership WHERE id=?',[challenge.id]);
  assert.equal(stored.token_hash,createHash('sha256').update(challenge.token).digest('hex')); assert.notEqual(stored.token_hash,challenge.token);
  await patch({action:'verify',challengeId:challenge.id,token:'x'.repeat(43)},409); assert.equal(reads,0);
  let checked = await patch({action:'verify',challengeId:challenge.id,token:challenge.token}); assert.equal(checked.result.verified,false);
  proofBody=challenge.fileContent;
  checked=await patch({action:'verify',challengeId:challenge.id,token:challenge.token}); assert.equal(checked.result.verified,true); assert.equal(checked.result.connectorActivated,false);
  await patch({action:'verify',challengeId:challenge.id,token:challenge.token},409);
  const [[verified]] = await db.execute<RowDataPacket[]>('SELECT verified_at,status,automation_enabled,auto_publish_enabled FROM growth_websites WHERE organization_id=? AND id=?',[org,website]);
  assert.ok(verified.verified_at); assert.equal(verified.status,'draft'); assert.equal(verified.automation_enabled,0); assert.equal(verified.auto_publish_enabled,0);
  const prepared=await patch({action:'prepare_connector'}); assert.equal(prepared.result.activated,false); assert.equal(prepared.result.state,'draft');
  await patch({action:'revoke_connector'}); assert.equal((await store.view(authority)).connectorDraft?.state,'revoked');
  const old=(await patch({action:'issue'})).result, next=(await patch({action:'issue'})).result;
  await patch({action:'verify',challengeId:old.id,token:old.token},409); assert.notEqual(old.token,next.token);

  const input = { ...scope,requestKey:randomUUID(),sourceLabel:'Observed page and competitor claim',observedAt:new Date(now).toISOString(),runAfter:new Date(now).toISOString(),
    evidence:{websiteId:website,pages:[{url:'https://owned.example.org/',status:200,indexable:true,title:'',h1Count:0,wordCount:20,internalLinks:0}],
      competitors:[{evidenceUrl:'https://competitor.example.org/features',featureName:'Manual comparison',plan:'free' as const,ourAvailability:'unknown' as const}]} };
  const post = async (value: unknown, expected: number, role='editor') => { const response=await handlers.POST(request(value,role)); const data=await response.json(); assert.equal(response.status,expected,JSON.stringify(data)); return data; };
  await post(input,403,'viewer'); const created=await post(input,201); assert.equal((await post(input,200)).duplicate,true);
  await post({...input,sourceLabel:'changed'},409);
  await post({...input,requestKey:randomUUID(),evidence:{...input.evidence,pages:[{...input.evidence.pages[0],url:'https://foreign.example.org/'}]}},400);
  const jobId=created.id; await patch({action:'run',jobId},409); await patch({action:'run',jobId},403,'editor');
  let view=await store.view(authority); const job=view.jobs.find(j=>j.id===jobId)!; assert.equal(job.approvalStatus,'pending');
  await decideInternalApproval({...scope,approvalId:job.approvalId,actorId:owner,idempotencyKey:randomUUID(),decision:'approved'});
  await patch({action:'schedule',jobId,runAfter:new Date(now+60000).toISOString()}); await patch({action:'run',jobId},409);
  await patch({action:'schedule',jobId,runAfter:new Date(now).toISOString()});
  // Inject a disposable-only failing trigger to prove all result/approval/event writes roll back together.
  await db.query("CREATE TRIGGER session02_test_rollback BEFORE INSERT ON growth_dev_analysis_recommendations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='TEST_ONLY_FAILURE'");
  await patch({action:'run',jobId},503);
  view=await store.view(authority); assert.equal(view.jobs.find(j=>j.id===jobId)!.attempts,0); assert.equal(view.recommendations.length,0);
  await db.query('DROP TRIGGER session02_test_rollback');
  const race=await Promise.all([handlers.PATCH(request({...scope,action:'run',jobId})),handlers.PATCH(request({...scope,action:'run',jobId}))]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  view=await store.view(authority); const complete=view.jobs.find(j=>j.id===jobId)!;
  assert.equal(complete.status,'completed'); assert.equal(complete.attempts,1); assert.equal(complete.result!.evidence,'UNVERIFIED_MANUAL_INPUT');
  assert.equal(complete.result!.competitors.length,1); assert.equal(complete.result!.costMinor,'0'); assert.ok(view.recommendations.length);
  assert.equal(view.recommendations[0].status,'pending');
  await decideInternalApproval({...scope,approvalId:view.recommendations[0].approvalId,actorId:owner,idempotencyKey:randomUUID(),decision:'approved'});
  view=await store.view(authority); assert.ok(view.recommendations.some(r=>r.status==='approved'));
  await assert.rejects(db.execute('DELETE FROM growth_dev_analysis_recommendations WHERE id=?',[view.recommendations[0].id]));
  await assert.rejects(db.execute('UPDATE growth_dev_workflow_events SET event_type=? WHERE id=?',['tampered',view.events[0].id]));
  await assert.rejects(db.execute('DELETE FROM growth_dev_workflow_events WHERE id=?',[view.events[0].id]));
  await patch({action:'cancel',jobId},409);

  const pending=await post({...input,requestKey:randomUUID()},201);
  await db.execute("UPDATE growth_websites SET status='paused' WHERE organization_id=? AND id=?",[org,website]);
  await patch({action:'run',jobId:pending.id},409); await post({...input,requestKey:randomUUID()},409); await patch({action:'cancel',jobId:pending.id});
  await patch({action:'run',jobId:pending.id},409);
  await db.execute("UPDATE growth_websites SET status='draft' WHERE organization_id=? AND id=?",[org,website]);
  const stoppedBySwitch=await post({...input,requestKey:randomUUID()},201);
  await db.execute('INSERT INTO growth_website_feature_audit(id,organization_id,website_id,actor_id,feature,enabled) VALUES (?,?,?,?,?,FALSE)',[randomUUID(),org,website,owner,'automation']);
  await patch({action:'run',jobId:stoppedBySwitch.id},409); await patch({action:'cancel',jobId:stoppedBySwitch.id});
  const stale=await post({...input,requestKey:randomUUID()},201);
  view=await store.view(authority); const staleJob=view.jobs.find(j=>j.id===stale.id)!;
  await decideInternalApproval({...scope,approvalId:staleJob.approvalId,actorId:owner,idempotencyKey:randomUUID(),decision:'approved'});
  now+=8*86400000;
  for(let i=0;i<3;i++){ if(i)await patch({action:'retry',jobId:stale.id}); const failed=await patch({action:'run',jobId:stale.id}); assert.equal(failed.result.status,'failed'); }
  await patch({action:'retry',jobId:stale.id},409); now=Date.now();
  view=await store.view(authority); assert.equal(view.jobs.find(j=>j.id===stale.id)!.attempts,3);
  const quotaSite=randomUUID(); await db.execute("INSERT INTO growth_websites(id,organization_id,domain,platform) VALUES (?,?,?,'custom')",[quotaSite,org,'quota.example.org']);
  const quotaInput={...input,websiteId:quotaSite,evidence:{websiteId:quotaSite,pages:[{...input.evidence.pages[0],url:'https://quota.example.org/'}]}};
  for(let i=0;i<20;i++) await store.createAnalysis({organizationId:org,websiteId:quotaSite,actorId:editor},{...quotaInput,requestKey:randomUUID()});
  await assert.rejects(store.createAnalysis({organizationId:org,websiteId:quotaSite,actorId:editor},{...quotaInput,requestKey:randomUUID()}),/ANALYSIS_QUOTA_EXCEEDED/);
  await assert.rejects(store.view({organizationId:other,websiteId:otherSite,actorId:owner}),/INSUFFICIENT_ROLE/);
  assert.equal((await handlers.GET(request(undefined,'viewer'))).status,200);
});
