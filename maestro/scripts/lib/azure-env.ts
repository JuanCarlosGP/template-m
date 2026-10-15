
/**
 * Resolves Azure Test Plan IDs from CLI args, canonical env vars, or legacy aliases.
 * Priority: opts.planId > AZURE_TEST_PLAN_ID > PLAN_ID
 */
function resolveAzurePlanId(opts = {} as any) {
  return opts.planId || process.env.AZURE_TEST_PLAN_ID || process.env.PLAN_ID
}

/**
 * Resolves Azure Test Suite IDs from CLI args, canonical env vars, or legacy aliases.
 * Priority: opts.suiteId > AZURE_TEST_SUITE_ID > SUITE_ID
 */
function resolveAzureSuiteId(opts = {} as any) {
  return opts.suiteId || process.env.AZURE_TEST_SUITE_ID || process.env.SUITE_ID
}

export {resolveAzurePlanId, resolveAzureSuiteId }
