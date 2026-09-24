import type { ConnectorCommand } from './connector';
import { assertPermission, assertSameSite, type AuthorizationContext, type Permission } from './authorization';
import { decideFeatureAccess, type FeatureDecisionInput } from './feature-gates';
import { canExecute, type ExecutionRecord } from './execution-recovery';

export interface ConnectedExecutionInput {
  authenticatedSiteId:string;
  authorization:AuthorizationContext;
  command:ConnectorCommand;
  allowedCommands:readonly string[];
  permission:Permission;
  feature:FeatureDecisionInput;
  execution:ExecutionRecord;
}
export interface ConnectedExecutionDecision {allowed:true;commandId:string;idempotencyKey:string;}

export function authorizeConnectedExecution(input:ConnectedExecutionInput):ConnectedExecutionDecision {
  if(!input.authenticatedSiteId) throw new Error('CONNECTOR_AUTH_REQUIRED');
  assertSameSite(input.authorization,input.authenticatedSiteId);
  assertSameSite(input.authorization,input.execution.siteId);
  assertPermission(input.authorization,input.permission);
  if(!input.command.commandId.trim()||!input.command.idempotencyKey.trim()) throw new Error('COMMAND_IDEMPOTENCY_REQUIRED');
  if(!input.allowedCommands.includes(input.command.type)) throw new Error('COMMAND_NOT_ALLOWED');
  const feature=decideFeatureAccess(input.feature);
  if(!feature.allowed) throw new Error(feature.reason||'FEATURE_ACCESS_DENIED');
  if(!canExecute(input.execution)) throw new Error('EXECUTION_NOT_RECOVERABLE');
  return {allowed:true,commandId:input.command.commandId,idempotencyKey:input.command.idempotencyKey};
}
