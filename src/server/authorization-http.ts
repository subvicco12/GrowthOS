import { rejectUntrustedOrigin,readBoundedJson } from './request-security';
import { issuanceSessionContext, type PublicationAuthorizationIssuer } from './authorization-issuance';
/** Explicit injected service only. Unconfigured application returns unavailable, never mock success. */
export function authorizationHttpHandler(service:PublicationAuthorizationIssuer|null) {
  return async(request:Request):Promise<Response>=>{
    const denied=rejectUntrustedOrigin(request);if(denied)return denied;
    const body=await readBoundedJson(request);if(body.error)return body.error;
    const headers={'Cache-Control':'no-store'};
    try {
      const context=issuanceSessionContext(request);
      if(!service)return Response.json({ok:false,code:'AUTHORIZATION_ISSUANCE_UNAVAILABLE'},{status:503,headers});
      const result=await service.execute(context,body.value);
      return Response.json({ok:true,...result,externalAction:false},{headers});
    }catch(error){
      const message=error instanceof Error?error.message:'';
      const status=message==='SESSION_REQUIRED'?401:message==='ISSUANCE_MEMBERSHIP_DENIED'?403:message==='AUTHORIZATION_NOT_FOUND'?404:
        ['AUTHORIZATION_REQUEST_REPLAY','AUTHORIZATION_ALREADY_TERMINAL','ISSUANCE_REVIEW_CHANGED'].includes(message)?409:
        (error as {name?:string})?.name==='ZodError'?400:503;
      return Response.json({ok:false,code:status===503?'AUTHORIZATION_ISSUANCE_UNAVAILABLE':status===400?'INVALID_AUTHORIZATION_REQUEST':message},{status,headers});
    }
  };
}
