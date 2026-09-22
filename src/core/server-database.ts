import type { RecommendationSql } from './recommendation-store-postgres';
import { readServerDatabaseConfig } from './server-config';
export function createSupabaseSql():RecommendationSql|null{
 const config=readServerDatabaseConfig(); if(!config)return null;
 return {async query(){throw new Error('DIRECT_SQL_ADAPTER_NOT_CONFIGURED');}};
}
export function approvalPersistenceReady():boolean{return false;}
