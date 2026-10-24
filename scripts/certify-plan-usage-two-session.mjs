/** Review-only disposable MariaDB 11.8 contention probe. Does not install migration 015. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const { GROWTHOS_DB_HOST: host, GROWTHOS_DB_NAME: database, GROWTHOS_DB_USER: user,
  GROWTHOS_DB_PASSWORD: password, GROWTHOS_DB_PORT: port,
  GROWTHOS_DISPOSABLE_PLAN_CERTIFY: optIn } = process.env;
if (optIn !== 'synthetic-disposable-only' || host !== '127.0.0.1' ||
    !/^growthos_test_[a-z0-9_]{4,40}$/.test(database ?? '') ||
    !/^synthetic_[a-z0-9_]{4,40}$/.test(user ?? '') ||
    !/^synthetic_[A-Za-z0-9_-]{12,}$/.test(password ?? '') ||
    !/^[0-9]{2,5}$/.test(port ?? '')) {
  console.error('BLOCKED: disposable loopback-only synthetic environment is not verified');
  process.exitCode = 2;
} else {
  const options = { host, database, user, password, port: Number(port), connectionLimit: 2,
    multipleStatements: false, connectTimeout: 3000, timezone: 'Z' };
  let pool;
  try {
    pool = mysql.createPool(options);
    const [identity] = await pool.query('SELECT DATABASE() AS db, VERSION() AS version, @@bind_address AS bind_address');
    assert.equal(identity[0].db,database);
    assert.match(identity[0].version,/11\.8\./);
    assert.equal(identity[0].bind_address,'127.0.0.1');
    const required = ['growth_organizations','growth_intelligence_evidence','growth_intelligence_evidence_events',
      'growth_plan_assignments','growth_plan_usage','growth_plan_usage_events','growth_plan_usage_transitions','growth_plan_assignment_events'];
    const [tables] = await pool.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN (?,?,?,?,?,?,?,?) AND ENGINE=\'InnoDB\'',
      [database,...required]);
    assert.deepEqual(new Set(tables.map(x=>x.TABLE_NAME)),new Set(required));
    const planTriggers = ['plan_assignment_events_no_update','plan_assignment_events_no_delete',
      'plan_usage_transitions_no_update','plan_usage_transitions_no_delete',
      'plan_assignment_update_guard','plan_usage_event_update_guard','plan_assignment_no_delete','plan_usage_event_no_delete'];
    const [triggers] = await pool.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? AND TRIGGER_NAME IN (?,?,?,?,?,?,?,?)',[database,...planTriggers]);
    assert.deepEqual(new Set(triggers.map(x=>x.TRIGGER_NAME)),new Set(planTriggers));
    const org=randomUUID(), feature='synthetic_offline_preview', day='2026-10-01';
    // No website, automation, publication or connector switch is changed.
    await pool.execute('INSERT INTO growth_organizations (id,name) VALUES (?,?)',[org,'Synthetic disposable contention']);
    await pool.execute('INSERT INTO growth_plan_usage (organization_id,feature_key,period_start) VALUES (?,?,?)',[org,feature,day]);
    const a=await pool.getConnection(), b=await pool.getConnection();
    try {
      const [aRows,bRows] = await Promise.all([a.query('SELECT CONNECTION_ID() AS id'),b.query('SELECT CONNECTION_ID() AS id')]);
      assert.notEqual(aRows[0][0].id,bRows[0][0].id,'two independent SQL sessions are required');
      await a.beginTransaction();
      await a.execute('SELECT reserved_units FROM growth_plan_usage WHERE organization_id=? AND feature_key=? AND period_start=? FOR UPDATE',[org,feature,day]);
      await b.query('SET SESSION innodb_lock_wait_timeout=1');
      await b.beginTransaction();
      await assert.rejects(b.execute('SELECT reserved_units FROM growth_plan_usage WHERE organization_id=? AND feature_key=? AND period_start=? FOR UPDATE',[org,feature,day]),
        error => error?.code === 'ER_LOCK_WAIT_TIMEOUT');
      await b.rollback();
      const [first] = await a.execute('UPDATE growth_plan_usage SET reserved_units=reserved_units+1 WHERE organization_id=? AND feature_key=? AND period_start=? AND reserved_units+consumed_units<1',[org,feature,day]);
      assert.equal(first.affectedRows,1);
      await a.commit();
      const [second] = await b.execute('UPDATE growth_plan_usage SET reserved_units=reserved_units+1 WHERE organization_id=? AND feature_key=? AND period_start=? AND reserved_units+consumed_units<1',[org,feature,day]);
      assert.equal(second.affectedRows,0);
      const [[row]] = await b.execute('SELECT reserved_units FROM growth_plan_usage WHERE organization_id=? AND feature_key=? AND period_start=?',[org,feature,day]);
      assert.equal(Number(row.reserved_units),1);
      console.log('PASS: isolated MariaDB 11.8, distinct SQL sessions, lock wait and one-winner quota contention');
    } finally {
      await Promise.allSettled([a.rollback(),b.rollback()]);
      a.release(); b.release();
      await pool.execute('DELETE FROM growth_plan_usage WHERE organization_id=?',[org]);
      await pool.execute('DELETE FROM growth_organizations WHERE id=?',[org]);
    }
  } catch (error) {
    console.error('BLOCKED/FAIL: isolated MariaDB certification did not complete:',error instanceof Error ? error.message : 'unknown error');
    process.exitCode=1;
  } finally { await pool?.end(); }
}
