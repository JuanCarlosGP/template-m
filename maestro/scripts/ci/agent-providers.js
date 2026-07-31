'use strict'

/**
 * Optional CI agent providers for failure triage.
 * The template stays vendor-neutral: set AGENT_PROVIDER to pick an implementation.
 * Only "cursor" is wired today (via @cursor/sdk) for experimentation in GitHub Actions.
 */

/**
 * @typedef {{
 *   prompt: (
 *     text: string,
 *     opts: {
 *       apiKey: string,
 *       cwd: string,
 *       mcpServers?: Record<string, unknown>,
 *       mode?: string,
 *     },
 *   ) => Promise<{ status: string, result?: string }>
 * }} AgentProvider
 */

/**
 * @param {string} name
 * @returns {AgentProvider}
 */
function loadAgentProvider(name) {
  const id = String(name || 'cursor').toLowerCase().trim()

  if (id === 'cursor') {
    let Agent
    let AgentError
    try {
      ;({ Agent, CursorAgentError: AgentError } = require('@cursor/sdk'))
    } catch {
      const err = new Error(
        'AGENT_PROVIDER=cursor requires @cursor/sdk on the runner (e.g. npm install --no-save @cursor/sdk)',
      )
      err.code = 'AGENT_SDK_MISSING'
      throw err
    }
    return {
      id: 'cursor',
      async prompt(text, { apiKey, cwd, mcpServers, mode }) {
        try {
          /** @type {Record<string, unknown>} */
          const options = {
            apiKey,
            model: { id: 'composer-2.5' },
            // agent mode can write reports/ci-triage.md; prompt forbids other edits
            mode: mode === 'plan' ? 'plan' : 'agent',
            local: { cwd },
          }
          if (mcpServers && Object.keys(mcpServers).length) {
            options.mcpServers = mcpServers
          }
          const result = await Agent.prompt(text, options)
          return { status: result.status, result: result.result }
        } catch (e) {
          if (AgentError && e instanceof AgentError) {
            const err = new Error(e.message || 'Agent provider error')
            err.code = 'AGENT_PROVIDER_ERROR'
            err.isRetryable = e.isRetryable
            throw err
          }
          throw e
        }
      },
    }
  }

  const err = new Error(
    `Unknown AGENT_PROVIDER="${id}". Supported today: cursor (optional). Add another adapter under maestro/scripts/ci/agent-providers.js`,
  )
  err.code = 'AGENT_PROVIDER_UNKNOWN'
  throw err
}

module.exports = {
  loadAgentProvider,
}
