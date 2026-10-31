/** Proposal 017 is NEVER enabled by normal deployment or by review-only migrations 010–016. */
export function assertIsolatedWorkflowRuntime(env: Record<string, string | undefined> = process.env): void {
  if (env.GROWTHOS_SESSION02_DISPOSABLE !== 'YES' || env.GROWTHOS_TEST_DB_DISPOSABLE !== 'YES' ||
    !/^growthos_test_[a-zA-Z0-9_]+$/.test(env.GROWTHOS_DB_NAME || '') ||
    !['127.0.0.1','localhost','::1'].includes(env.GROWTHOS_DB_HOST || '')) throw Error('ISOLATED_SCHEMA_REQUIRED');
}
