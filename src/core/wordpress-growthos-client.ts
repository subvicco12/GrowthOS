export interface WordPressGrowthOSConfig { baseUrl:string; username:string; applicationPassword:string; }
export function readWordPressGrowthOSConfig(env:Record<string,string|undefined>=process.env):WordPressGrowthOSConfig|null{
 const baseUrl=env.GROWTHOS_WORDPRESS_URL?.trim();
 const username=env.GROWTHOS_WORDPRESS_USERNAME?.trim();
 const applicationPassword=env.GROWTHOS_WORDPRESS_APPLICATION_PASSWORD?.trim();
 if(!baseUrl||!username||!applicationPassword)return null;
 const url=new URL(baseUrl);
 if(url.protocol!=='https:')throw new Error('WORDPRESS_HTTPS_REQUIRED');
 return {baseUrl:url.origin,username,applicationPassword};
}
export class WordPressGrowthOSClient {
 constructor(private readonly config:WordPressGrowthOSConfig){}
 private authHeader(){return 'Basic '+Buffer.from(this.config.username+':'+this.config.applicationPassword).toString('base64');}
 private async get<T>(path:string,params:Record<string,string|number|undefined>={}):Promise<T>{
  const url=new URL('/wp-json/growthos/v1/'+path.replace(/^\//,''),this.config.baseUrl);
  for(const [key,value] of Object.entries(params))if(value!==undefined)url.searchParams.set(key,String(value));
  const response=await fetch(url,{method:'GET',headers:{Authorization:this.authHeader(),Accept:'application/json'},cache:'no-store'});
  if(response.status===401||response.status===403)throw new Error('WORDPRESS_UNAUTHORIZED');
  if(!response.ok)throw new Error('WORDPRESS_API_'+response.status);
  return response.json() as Promise<T>;
 }
 dashboard(siteId?:number){return this.get<any>('dashboard',{site_id:siteId});}
 recommendations(siteId?:number){return this.get<any>('recommendations',{site_id:siteId});}
 connectors(siteId?:number){return this.get<any>('connectors',{site_id:siteId});}
 sites(){return this.get<any>('sites');}
 async decideRecommendation(recommendationId:number,decision:'approved'|'rejected'|'deferred',idempotencyKey:string,note?:string){
  if(!Number.isInteger(recommendationId)||recommendationId<1)throw new Error('INVALID_RECOMMENDATION_ID');
  const url=new URL('/wp-json/growthos/v1/recommendations/'+recommendationId+'/decision',this.config.baseUrl);
  const response=await fetch(url,{method:'POST',headers:{Authorization:this.authHeader(),Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({decision,idempotency_key:idempotencyKey,note:note||''}),cache:'no-store'});
  const payload=await response.json().catch(()=>({ok:false,code:'WORDPRESS_INVALID_RESPONSE'}));
  if(response.status===401||response.status===403)throw new Error('WORDPRESS_UNAUTHORIZED');
  if(!response.ok){const code=payload&&typeof payload.code==='string'?payload.code:'WORDPRESS_API_'+response.status;const error=new Error(code);(error as any).status=response.status;throw error;}
  return payload;
 }
}
