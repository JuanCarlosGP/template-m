
/**
 * Composite is the default (one YAML per scenario).
 * A local run sends every scenario YAML to a single Maestro process.
 * Opt out with --per-flow or MAESTRO_PER_FLOW=1|true|yes.
 * @param {{ perFlow?: boolean, env?: NodeJS.ProcessEnv }} [options]
 */
function useCompositeFlows({ perFlow, env } = {} as any) {
  if (perFlow) return false
  return !/^(1|true|yes)$/i.test((env && env.MAESTRO_PER_FLOW) || '')
}

export {useCompositeFlows }
