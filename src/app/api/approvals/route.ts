import { readWordPressGrowthOSConfig, WordPressGrowthOSClient } from '../../../core/wordpress-growthos-client';
const decisions={approve:'approved',reject:'rejected',defer:'deferred'} as const;
export async function POST(request:Request):Promise<Response>{
 let config;
 try{config=readWordPressGrowthOSConfig();}catch{return Response.json({ok:false,code:'INVALID_CONFIGURATION'},{status:503});}
 if(!config)return Response.json({ok:false,code:'NEEDS_CONNECTION'},{status:503});
 let body:unknown; try{body=await request.json();}catch{return Response.json({ok:false,code:'INVALID_JSON'},{status:400});}
 if(!body||typeof body!=='object')return Response.json({ok:false,code:'INVALID_APPROVAL_REQUEST'},{status:400});
 const input=body as Record<string,unknown>;
 if('actorId' in input)return Response.json({ok:false,code:'CLIENT_ACTOR_FORBIDDEN'},{status:400});
 const recommendationId=Number(input.recommendationId);
 const action=typeof input.action==='string'?input.action:'';
 const idempotencyKey=typeof input.idempotencyKey==='string'?input.idempotencyKey.trim():'';
 const note=typeof input.note==='string'?input.note.trim():'';
 if(!Number.isInteger(recommendationId)||recommendationId<1||!(action in decisions)||!idempotencyKey||idempotencyKey.length>128||note.length>2000)return Response.json({ok:false,code:'INVALID_APPROVAL_REQUEST'},{status:400});
 try{
  const data=await new WordPressGrowthOSClient(config).decideRecommendation(recommendationId,decisions[action as keyof typeof decisions],idempotencyKey,note||undefined);
  return Response.json({ok:true,data},{status:200});
 }catch(error){
  if(error instanceof Error&&error.message==='WORDPRESS_UNAUTHORIZED')return Response.json({ok:false,code:'UNAUTHORIZED'},{status:401});
  const status=Number((error as any)?.status)||502;
  const code=error instanceof Error?error.message:'APPROVAL_FAILED';
  return Response.json({ok:false,code},{status:status>=400&&status<600?status:502});
 }
}
