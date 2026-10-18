import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getMySQLPool } from './mysql';
import { createContentRecord, type ContentRecord, type ContentStore } from '../core/content-lifecycle';

type Row = RowDataPacket & { record_json: string | ContentRecord; version: number | string };
const scope = (value: string) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const decode = (row: Row, organizationId: string, websiteId: string, id: string): ContentRecord => {
  const value = typeof row.record_json === 'string' ? JSON.parse(row.record_json) as ContentRecord : row.record_json;
  if (!value || value.id !== id || value.organizationId !== organizationId || value.websiteId !== websiteId ||
      !Number.isSafeInteger(value.version) || value.version !== Number(row.version) || !Array.isArray(value.eventIds)) throw Error('CONTENT_STORAGE_CORRUPT');
  return value;
};

/** Server-only adapter. The uninstalled schema is specified in docs; missing tables fail closed. */
export class MySQLContentStore implements ContentStore {
  constructor(private readonly pool: Pick<Pool, 'getConnection'> = getMySQLPool()) {}
  async create(input: { id: string; organizationId: string; websiteId: string; contentType: string }): Promise<ContentRecord> {
    const record = createContentRecord(input);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [site] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE', [input.organizationId,input.websiteId]);
      if (site.length !== 1) throw Error('CONTENT_SCOPE_DENIED');
      await connection.execute('INSERT INTO growth_content_records (organization_id,website_id,id,version,stage,record_json) VALUES (?,?,?,?,?,?)',
        [input.organizationId,input.websiteId,input.id,0,record.stage,JSON.stringify(record)]);
      await connection.commit();
      return record;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  async get(organizationId: string, websiteId: string, recordId: string): Promise<ContentRecord | null> {
    if (![organizationId,websiteId,recordId].every(scope)) throw Error('CONTENT_SCOPE_DENIED');
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.execute<Row[]>(
        'SELECT version,record_json FROM growth_content_records WHERE organization_id=? AND website_id=? AND id=?', [organizationId,websiteId,recordId]);
      return rows.length ? decode(rows[0],organizationId,websiteId,recordId) : null;
    } finally { connection.release(); }
  }
  async update(organizationId: string, websiteId: string, recordId: string, version: number,
    apply: (current: ContentRecord) => ContentRecord): Promise<ContentRecord> {
    if (![organizationId,websiteId,recordId].every(scope) || !Number.isSafeInteger(version) || version < 0) throw Error('CONTENT_SCOPE_DENIED');
    const connection: PoolConnection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<Row[]>(
        'SELECT version,record_json FROM growth_content_records WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE', [organizationId,websiteId,recordId]);
      if (rows.length !== 1) throw Error('CONTENT_NOT_FOUND');
      const current = decode(rows[0],organizationId,websiteId,recordId);
      if (current.version !== version) throw Error('CONTENT_VERSION_CONFLICT');
      const next = apply(structuredClone(current));
      if (next.id !== recordId || next.organizationId !== organizationId || next.websiteId !== websiteId ||
          next.version !== version + 1 || next.eventIds.length !== current.eventIds.length + 1 ||
          current.eventIds.some((id,index) => next.eventIds[index] !== id) || !scope(next.eventIds.at(-1)!)) throw Error('INVALID_CONTENT_UPDATE');
      const [event] = await connection.execute<ResultSetHeader>(
        'INSERT INTO growth_content_events (organization_id,website_id,content_id,event_id,version) VALUES (?,?,?,?,?)',
        [organizationId,websiteId,recordId,next.eventIds[next.eventIds.length - 1],next.version]);
      if (event.affectedRows !== 1) throw Error('CONTENT_EVENT_REPLAY');
      const [result] = await connection.execute<ResultSetHeader>(
        'UPDATE growth_content_records SET version=?,stage=?,record_json=? WHERE organization_id=? AND website_id=? AND id=? AND version=?',
        [next.version,next.stage,JSON.stringify(next),organizationId,websiteId,recordId,version]);
      if (result.affectedRows !== 1) throw Error('CONTENT_VERSION_CONFLICT');
      await connection.commit();
      return next;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
}
