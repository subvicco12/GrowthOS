export interface ServerDatabaseConfig {url:string;serviceRoleKey:string;}
export interface ServerAuthConfig {url:string;anonKey:string;}
export function readServerDatabaseConfig(env:Record<string,string|undefined>=process.env):ServerDatabaseConfig|null{
 const url=env.SUPABASE_URL?.trim()||env.NEXT_PUBLIC_SUPABASE_URL?.trim();
 const serviceRoleKey=env.SUPABASE_SERVICE_ROLE_KEY?.trim();
 if(!url||!serviceRoleKey)return null;
 return {url,serviceRoleKey};
}
export function readServerAuthConfig(env:Record<string,string|undefined>=process.env):ServerAuthConfig|null{
 const url=env.SUPABASE_URL?.trim()||env.NEXT_PUBLIC_SUPABASE_URL?.trim();
 const anonKey=env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
 if(!url||!anonKey)return null;
 return {url,anonKey};
}
export function databaseConfigured(env:Record<string,string|undefined>=process.env):boolean{return readServerDatabaseConfig(env)!==null;}
