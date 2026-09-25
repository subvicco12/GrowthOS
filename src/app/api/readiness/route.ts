import { readWordPressGrowthOSConfig, WordPressGrowthOSClient } from '../../../core/wordpress-growthos-client';
import { validateProductionWordPressConfig } from '../../../core/production-config';

export async function GET():Promise<Response>{
 const configuration=validateProductionWordPressConfig();
 if(!configuration.ok)return Response.json({ok:false,code:configuration.code,connection:'needs_connection'},{status:503});
 try{
  const config=readWordPressGrowthOSConfig();
  if(!config)return Response.json({ok:false,code:'NEEDS_CONNECTION',connection:'needs_connection'},{status:503});
  const client=new WordPressGrowthOSClient(config);
  const readiness=await client.readiness();
  const checks=Array.isArray(readiness?.checks)?readiness.checks:[];
  const failed=checks.filter((check:any)=>check?.ok!==true).map((check:any)=>String(check?.key||'unknown'));
  return Response.json({ok:readiness?.ready===true,connection:'connected',productionReady:readiness?.ready===true,passing:Number(readiness?.passing||0),total:Number(readiness?.total||checks.length),failedChecks:failed});
 }catch(error){
  if(error instanceof Error&&error.message==='WORDPRESS_UNAUTHORIZED')return Response.json({ok:false,code:'UNAUTHORIZED',connection:'needs_connection'},{status:401});
  return Response.json({ok:false,code:'WORDPRESS_UNAVAILABLE',connection:'needs_connection'},{status:502});
 }
}
