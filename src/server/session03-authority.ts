import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { WorkScope } from './mysql-isolated-workflows';
export async function recordOwnershipGrant(connection: PoolConnection, scope: WorkScope, challengeId: string, now: number) {
  await connection.execute('INSERT INTO growth_dev_ownership_grants(organization_id,website_id,challenge_id,epoch,valid_until) VALUES (?,?,?,1,?) ON DUPLICATE KEY UPDATE challenge_id=VALUES(challenge_id),epoch=epoch+1,valid_until=VALUES(valid_until),revoked_at=NULL',
    [scope.organizationId,scope.websiteId,challengeId,new Date(now+7*86400000)]);
  await connection.execute("UPDATE growth_dev_connector_enrollments SET state='revoked',health_state='unknown' WHERE organization_id=? AND website_id=?",[scope.organizationId,scope.websiteId]);
}
export async function assertOwnershipGrant(connection: PoolConnection, scope: WorkScope, now: number): Promise<number> {
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT epoch,valid_until,revoked_at FROM growth_dev_ownership_grants WHERE organization_id=? AND website_id=? FOR UPDATE',[scope.organizationId,scope.websiteId]);
  if(!rows[0]||rows[0].revoked_at||new Date(rows[0].valid_until).getTime()<=now)throw Error('OWNERSHIP_AUTHORITY_REQUIRED');
  return Number(rows[0].epoch);
}
export async function assertApprovalNotRevoked(connection: PoolConnection, scope: WorkScope, approvalId: string) {
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT approval_id FROM growth_dev_approval_revocations WHERE organization_id=? AND website_id=? AND approval_id=? FOR UPDATE',[scope.organizationId,scope.websiteId,approvalId]);
  if(rows.length)throw Error('APPROVAL_REVOKED');
}
export async function readStopFence(connection: PoolConnection, scope: Pick<WorkScope,'organizationId'|'websiteId'>): Promise<number> {
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT fence FROM growth_dev_stop_fences WHERE organization_id=? AND website_id=? FOR UPDATE',[scope.organizationId,scope.websiteId]);
  const fence=Number(rows[0]?.fence||0);if(!Number.isSafeInteger(fence))throw Error('LEASE_FENCE_EXHAUSTED');return fence;
}
export async function bumpStopFence(connection: PoolConnection, scope: Pick<WorkScope,'organizationId'|'websiteId'>): Promise<void> {
  await readStopFence(connection,scope);
  await connection.execute('INSERT INTO growth_dev_stop_fences(organization_id,website_id,fence) VALUES (?,?,1) ON DUPLICATE KEY UPDATE fence=fence+1',[scope.organizationId,scope.websiteId]);
}
