'use client';
import {useEffect,useMemo,useState} from 'react';
import {ScopedWebsitePager,WebsitePageAccessError,readScopedWebsiteResponse,type WebsitePageState} from '../core/scoped-website-pages';

export function useScopedWebsitePager(active:boolean,subject:string){
 const [state,setState]=useState<WebsitePageState>({scope:null,organization:null,nextCursor:null,busy:false,error:null,fatal:false});
 const pager=useMemo(()=>new ScopedWebsitePager(async(cursor,signal)=>{
   const response=await fetch('/api/organization-websites'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{credentials:'include',cache:'no-store',signal});
   if(response.status===401){window.dispatchEvent(new Event('growthos-session-expired'));throw new WebsitePageAccessError(401);}
   if(response.status===403)throw new WebsitePageAccessError(403);
   if(!response.ok)throw Error(`${subject} unavailable. Try again.`);
   return readScopedWebsiteResponse(response);
 },setState),[subject]);
 useEffect(()=>{if(active)void pager.loadInitial();else pager.invalidate();return()=>pager.dispose();},[active,pager]);
 return {state,pager};
}
