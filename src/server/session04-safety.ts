import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
export async function assertSession04Execution(c:PoolConnection,organizationId:string,now:number){
 const [[clock]]=await c.query<RowDataPacket[]>('SELECT UTC_TIMESTAMP(6) AS now');
 if(!Number.isFinite(now)||Math.abs(new Date(clock.now).getTime()-now)>5000)throw Error('WORKER_CLOCK_SKEW');
 const [rows]=await c.execute<RowDataPacket[]>('SELECT emergency_stopped,ai_limit_minor,external_enabled FROM growth_dev_fleet_policy WHERE organization_id=? FOR UPDATE',[organizationId]);
 if(!rows[0]||Number(rows[0].emergency_stopped)!==0)throw Error('FLEET_EMERGENCY_STOP');
 if(String(rows[0].ai_limit_minor)!=='0'||Number(rows[0].external_enabled)!==0)throw Error('EXTERNAL_SPEND_DISABLED');
}
