export interface SecurityGateEvidence {connectorAuthentication:boolean;rbac:boolean;crossSiteIsolation:boolean;auditRedaction:boolean;recoveryRollback:boolean;httpsProduction:boolean;fileEditingDisabled:boolean;}
export interface SecurityGateCertification {passed:boolean;failures:(keyof SecurityGateEvidence)[];}
export function certifySecurityGate(evidence:SecurityGateEvidence):SecurityGateCertification {
 const failures=(Object.keys(evidence) as (keyof SecurityGateEvidence)[]).filter(key=>evidence[key]!==true);
 return {passed:failures.length===0,failures};
}
