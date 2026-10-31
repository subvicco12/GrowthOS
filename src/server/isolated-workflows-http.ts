import { z } from 'zod';
import { workflowScope, createAnalysisInput, analysisAction, ownershipAction } from '../core/isolated-workflows';
import { assertIsolatedWorkflowRuntime } from './isolated-workflow-runtime';
import { rejectUntrustedOrigin, readBoundedJson } from './request-security';
import type { MySQLIsolatedWorkflows } from './mysql-isolated-workflows';

const connectorAction = workflowScope.extend({ action: z.enum(['prepare_connector','revoke_connector']) }).strict();
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const codes: Record<string, number> = { ISOLATED_SCHEMA_REQUIRED: 501, AUTHENTICATION_REQUIRED: 401, ORGANIZATION_REQUIRED: 403,
    ORGANIZATION_FORBIDDEN: 403, ORGANIZATION_SCOPE_CHANGED: 403, INSUFFICIENT_ROLE: 403, WEBSITE_NOT_FOUND: 404, JOB_NOT_FOUND: 404,
    INVALID_OBSERVATION_TIME: 400, EVIDENCE_SCOPE_MISMATCH: 400, IDEMPOTENCY_CONFLICT: 409,
    WEBSITE_STOPPED: 409, OWNERSHIP_CHALLENGE_INVALID: 409, OWNERSHIP_RATE_LIMIT: 429, ANALYSIS_QUOTA_EXCEEDED: 429,
    APPROVAL_REQUIRED: 409, JOB_NOT_DUE: 409, JOB_STATE_CONFLICT: 409, CONNECTOR_PREREQUISITE_REQUIRED: 409,
    WORKFLOW_BUSY: 409, WORKFLOW_OUTCOME_UNKNOWN: 503 };
  return json({ ok: false, code: codes[code] ? code : 'SERVICE_UNAVAILABLE' }, codes[code] || 503);
}
type Context = { userId: string; organization: { id: string; role: string } };
export function createIsolatedWorkflowHandlers(context: (request: Request) => Promise<Context>, store: () => MySQLIsolatedWorkflows,
  assertRuntime: () => void = assertIsolatedWorkflowRuntime) {
  return {
    async GET(request: Request) {
      try {
        assertRuntime(); const auth = await context(request), url = new URL(request.url);
        if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) return json({ ok: false, code: 'INVALID_SCOPE' }, 400);
        const scope = workflowScope.safeParse(Object.fromEntries(url.searchParams));
        if (!scope.success) return json({ ok: false, code: 'INVALID_SCOPE' }, 400);
        if (scope.data.organizationId !== auth.organization.id) throw Error('ORGANIZATION_SCOPE_CHANGED');
        return json({ ok: true, ...await store().view({ ...scope.data, actorId: auth.userId }) });
      } catch (error) { return failure(error); }
    },
    async POST(request: Request) {
      const originError = rejectUntrustedOrigin(request); if (originError) return originError;
      try {
        assertRuntime(); const auth = await context(request);
        if (!['owner','admin','editor'].includes(auth.organization.role)) throw Error('INSUFFICIENT_ROLE');
        const body = await readBoundedJson(request, 65536); if (body.error) return body.error;
        const parsed = createAnalysisInput.safeParse(body.value);
        if (!parsed.success) return json({ ok: false, code: 'INVALID_ANALYSIS' }, 400);
        if (parsed.data.organizationId !== auth.organization.id) throw Error('ORGANIZATION_SCOPE_CHANGED');
        const result = await store().createAnalysis({ ...parsed.data, actorId: auth.userId }, parsed.data);
        return json({ ok: true, organizationId: auth.organization.id, websiteId: parsed.data.websiteId, ...result, externalAction: false }, result.duplicate ? 200 : 201);
      } catch (error) { return failure(error); }
    },
    async PATCH(request: Request) {
      const originError = rejectUntrustedOrigin(request); if (originError) return originError;
      try {
        assertRuntime(); const auth = await context(request);
        if (!['owner','admin'].includes(auth.organization.role)) throw Error('INSUFFICIENT_ROLE');
        const body = await readBoundedJson(request); if (body.error) return body.error;
        const parsed = z.union([analysisAction, ownershipAction, connectorAction]).safeParse(body.value);
        if (!parsed.success) return json({ ok: false, code: 'INVALID_ACTION' }, 400);
        const action = parsed.data;
        if (action.organizationId !== auth.organization.id) throw Error('ORGANIZATION_SCOPE_CHANGED');
        const scope = { organizationId: auth.organization.id, websiteId: action.websiteId, actorId: auth.userId }, adapter = store();
        let result: unknown;
        if (action.action === 'issue') result = await adapter.issueOwnership(scope);
        else if (action.action === 'verify') result = await adapter.verifyOwnership(scope, action.challengeId, action.token);
        else if (action.action === 'prepare_connector' || action.action === 'revoke_connector') result = await adapter.connectorDraft(scope, action.action === 'revoke_connector');
        else result = await adapter.action(scope, analysisAction.parse(action));
        return json({ ok: true, organizationId: scope.organizationId, websiteId: scope.websiteId, result });
      } catch (error) { return failure(error); }
    }
  };
}
