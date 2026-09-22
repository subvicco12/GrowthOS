import { createClient } from '@supabase/supabase-js';
import { readServerDatabaseConfig } from './server-config';
import type { UserRole } from './types';
export interface ServerActor {id:string;role:UserRole;}
const roles=new Set<UserRole>(['owner','admin','operator','analyst','viewer']);
export async function authenticateSupabaseRequest(request:Request):Promise<ServerActor|null>{
 const config=readServerDatabaseConfig(); if(!config)return null;
 const header=request.headers.get('authorization');
 const bearer=header?.startsWith('Bearer ')?header.slice(7).trim():'';
 const cookie=request.headers.get('cookie')||'';
 const cookieToken=/sb-access-token=([^;]+)/.exec(cookie)?.[1];
 let token=bearer;
 if(!token&&cookieToken){ try{token=decodeURIComponent(cookieToken);}catch{return null;} }
 if(!token)return null;
 const admin=createClient(config.url,config.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await admin.auth.getUser(token); if(error||!data.user)return null;
 const {data:profile,error:profileError}=await admin.from('profiles').select('role').eq('id',data.user.id).single();
 if(profileError||!profile||!roles.has(profile.role as UserRole))return null;
 return {id:data.user.id,role:profile.role as UserRole};
}
