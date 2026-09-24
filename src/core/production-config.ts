import { readWordPressGrowthOSConfig } from './wordpress-growthos-client';

export interface ProductionConfigCheck { ok:boolean; code:'READY'|'NEEDS_CONNECTION'|'WRONG_WORDPRESS_HOST'|'INVALID_CONFIGURATION'; }

export function validateProductionWordPressConfig(env:Record<string,string|undefined>=process.env):ProductionConfigCheck{
 try{
  const config=readWordPressGrowthOSConfig(env);
  if(!config)return {ok:false,code:'NEEDS_CONNECTION'};
  if(config.baseUrl!=='https://growthos.converentis.com')return {ok:false,code:'WRONG_WORDPRESS_HOST'};
  return {ok:true,code:'READY'};
 }catch{return {ok:false,code:'INVALID_CONFIGURATION'};}
}
