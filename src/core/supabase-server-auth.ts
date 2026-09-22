import { createClient } from '@supabase/supabase-js';
import { readServerDatabaseConfig } from './server-config';
import type { UserRole } from './types';
export interface ServerActor {id:string;role:UserRole;}
const roles=new Set<UserRole>(['owner','admin','operator','analyst','viewer']);
export async function authenticateSupabaseRequest(request:Request):Promise<ServerActor|null>{
 const config=readServerDatabaseConfig(); if(!config)return null;
 const header=request.headers.get('authorization'); if(!header?.startsWith('Bearer '))return null;
 const token=header.slice(7).trim(); if(!token)return null;
 const admin=createClient(config.url,config.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await admin.auth.getUser(token); if(error||!data.user)return null;
 const {data:profile,error:profileError}=await admin.from('profiles').select('role').eq('id',data.user.id).single();
 if(profileError||!profile||!roles.has(profile.role as UserRole))return null;
 return {id:data.user.id,role:profile.role as UserRole};
}
