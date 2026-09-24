import { readWordPressGrowthOSConfig, WordPressGrowthOSClient } from '../../../core/wordpress-growthos-client';
import { validateProductionWordPressConfig } from '../../../core/production-config';
export async function GET():Promise<Response>{
 const configuration=validateProductionWordPressConfig();
 if(!configuration.ok)return Response.json({ok:false,code:configuration.code,connection:'needs_connection'},{status:503});
 try{
  const config=readWordPressGrowthOSConfig();
  if(!config)return Response.json({ok:false,code:'NEEDS_CONNECTION',connection:'needs_connection'},{status:503});
  const client=new WordPressGrowthOSClient(config);
  const [sites,connectors]=await Promise.all([client.sites(),client.connectors()]);
  const siteRows=Array.isArray(sites)?sites:(sites.sites??sites.items??[]);
  const connectorRows=Array.isArray(connectors)?connectors:(connectors.connectors??connectors.items??[]);
  return Response.json({ok:true,connection:'ready',host:config.baseUrl,sites:{count:siteRows.length,ids:siteRows.map((s:any)=>String(s.id))},connectors:{count:connectorRows.length,connected:connectorRows.filter((c:any)=>c.status==='connected').length}});
 }catch(error){
  if(error instanceof Error&&error.message==='WORDPRESS_UNAUTHORIZED')return Response.json({ok:false,code:'UNAUTHORIZED',connection:'needs_connection'},{status:401});
  return Response.json({ok:false,code:'WORDPRESS_UNAVAILABLE',connection:'needs_connection'},{status:502});
 }
}
