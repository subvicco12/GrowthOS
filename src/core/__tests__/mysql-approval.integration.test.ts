import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getMySQLPool } from '../../server/mysql';
import { decideInternalApproval } from '../../server/mysql-approval-decision';

// Requires an explicitly designated disposable MySQL database with migrations 001-008.
// Never run against production. Fixtures intentionally remain for audit traceability.
const enabled = process.env.GROWTHOS_TEST_DB_DISPOSABLE === 'YES' &&
  process.env.GROWTHOS_DB_NAME?.startsWith('growthos_test_') === true;
const integration = enabled ? test : test.skip;

integration('concurrent decisions, replay, tenant boundaries and audit immutability', async () => {
  const db = getMySQLPool();
  const org = randomUUID(), site = randomUUID(), actor = randomUUID(), approval = randomUUID();
  const org2 = randomUUID(), site2 = randomUUID(), approval2 = randomUUID();
  const email = 'approval-' + actor + '@example.invalid';
  await db.execute('INSERT INTO growth_organizations (id,name) VALUES (?,?)', [org,'Approval test']);
  await db.execute('INSERT INTO growth_organizations (id,name) VALUES (?,?)', [org2,'Isolation test']);
  await db.execute('INSERT INTO growth_users (id,email,password_hash,disabled) VALUES (?,?,?,FALSE)', [actor,email,'integration-test-no-login']);
  await db.execute("INSERT INTO growth_websites (id,organization_id,domain,platform) VALUES (?,?,?,'custom')", [site,org,site+'.example.invalid']);
  await db.execute("INSERT INTO growth_websites (id,organization_id,domain,platform) VALUES (?,?,?,'custom')", [site2,org2,site2+'.example.invalid']);
  await db.execute("INSERT INTO growth_approval_queue (id,organization_id,website_id,title,action_type) VALUES (?,?,?,?,'review')", [approval,org,site,'First decision']);
  await db.execute("INSERT INTO growth_approval_queue (id,organization_id,website_id,title,action_type) VALUES (?,?,?,?,'review')", [approval2,org2,site2,'Other tenant']);
  const input = { organizationId: org, websiteId: site, approvalId: approval, actorId: actor,
    idempotencyKey: randomUUID(), decision: 'approved' as const, note: 'reviewed' };
  const settled = await Promise.allSettled([
    decideInternalApproval(input),
    decideInternalApproval({ ...input, idempotencyKey: randomUUID(), decision: 'rejected' })
  ]);
  assert.equal(settled.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(x => x.status === 'rejected').length, 1);
  const winner = settled.find(x => x.status === 'fulfilled');
  assert.ok(winner && winner.status === 'fulfilled');
  const [events] = await db.execute<import('mysql2/promise').RowDataPacket[]>(
    'SELECT id,idempotency_key,decision FROM growth_approval_decisions WHERE organization_id=? AND approval_id=?', [org,approval]);
  assert.equal(events.length, 1);
  const original = { ...input, idempotencyKey: String(events[0].idempotency_key),
    decision: String(events[0].decision) as 'approved' | 'rejected' };
  const replay = await decideInternalApproval(original);
  assert.equal(replay.replay, true);
  assert.equal(replay.decisionId, String(events[0].id));
  await assert.rejects(decideInternalApproval({ ...original, note: 'changed' }), /IDEMPOTENCY_CONFLICT/);
  await assert.rejects(decideInternalApproval({ ...input, approvalId: approval2 }), /APPROVAL_NOT_FOUND/);
  await assert.rejects(db.execute('UPDATE growth_approval_decisions SET note=? WHERE id=?', ['tamper',events[0].id]));
  await assert.rejects(db.execute('DELETE FROM growth_approval_decisions WHERE id=?', [events[0].id]));
  // A fresh pending approval receives two simultaneous identical submissions.
  // Both calls must resolve to one audit event, one new decision and one replay.
  const replayApproval = randomUUID();
  await db.execute(
    "INSERT INTO growth_approval_queue (id,organization_id,website_id,title,action_type) VALUES (?,?,?,?,'review')",
    [replayApproval,org,site,'Concurrent replay']);
  const replayInput = { ...input, approvalId: replayApproval, idempotencyKey: randomUUID() };
  const twins = await Promise.all([
    decideInternalApproval(replayInput),
    decideInternalApproval(replayInput)
  ]);
  assert.equal(twins[0].decisionId, twins[1].decisionId);
  assert.equal(twins.filter(x => x.replay).length, 1);
  const [twinsAudit] = await db.execute<import('mysql2/promise').RowDataPacket[]>(
    'SELECT id FROM growth_approval_decisions WHERE organization_id=? AND approval_id=?',
    [org,replayApproval]);
  assert.equal(twinsAudit.length, 1);
  const [queue] = await db.execute<import('mysql2/promise').RowDataPacket[]>(
    'SELECT status FROM growth_approval_queue WHERE organization_id=? AND id=?', [org,approval]);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].status, original.decision);
});
