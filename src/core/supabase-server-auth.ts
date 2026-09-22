import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { readServerAuthConfig, readServerDatabaseConfig } from './server-config';
import type { UserRole } from './types';
export interface ServerActor {id:string;role:UserRole;}
const roles=new Set<UserRole>(['owner','admin','operator','analyst','viewer']);
function requestCookies(request:Request){
 const raw=request.headers.get('cookie')||'';
 return raw.split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const i=part.indexOf('=');return i<0?{name:part,value:''}:{name:part.slice(0,i),value:part.slice(i+1)};});
}
export async function authenticateSupabaseRequest(request:Request):Promise<ServerActor|null>{
 const db=readServerDatabaseConfig(); if(!db)return null;
 const header=request.headers.get('authorization');
 const bearer=header?.startsWith('Bearer ')?header.slice(7).trim():'';
 let userId:string|undefined;
 if(bearer){
  const admin=createClient(db.url,db.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.auth.getUser(bearer); if(error||!data.user)return null;
  userId=data.user.id;
 }else{
  const auth=readServerAuthConfig(); if(!auth)return null;
  const cookies=requestCookies(request);
  const server=createServerClient(auth.url,auth.anonKey,{cookies:{getAll(){return cookies;},setAll(){}}});
  const {data,error}=await server.auth.getUser(); if(error||!data.user)return null;
  userId=data.user.id;
 }
 const admin=createClient(db.url,db.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile,error:profileError}=await admin.from('profiles').select('role').eq('id',userId).single();
 if(profileError||!profile||!roles.has(profile.role as UserRole))return null;
 return {id:userId,role:profile.role as UserRole};
}
