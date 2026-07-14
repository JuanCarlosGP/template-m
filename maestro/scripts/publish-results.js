'use strict'

const https = require('https')
const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAuthHeader() {
  const pat = process.env.AZURE_DEVOPS_PAT
  if (!pat) throw new Error('AZURE_DEVOPS_PAT environment variable is not set')
  return 'Basic ' + Buffer.from(':' + pat).toString('base64')
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
          return
        }
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve(data)
        }
      })
    })
    req.on('error', reject)
    if (body) {
      req.end(body)
    } else {
      req.end()
    }
  })
}

function apiRequest(method, urlPath, payload) {
  const org = process.env.AZURE_DEVOPS_ORG
  const project = process.env.AZURE_DEVOPS_PROJECT

  if (!org) throw new Error('AZURE_DEVOPS_ORG environment variable is not set')
  if (!project) throw new Error('AZURE_DEVOPS_PROJECT environment variable is not set')

  const body = payload ? JSON.stringify(payload) : undefined
  const options = {
    hostname: 'dev.azure.com',
    path: `/${org}/${project}/_apis${urlPath}`,
    method,
    agent: false, // disable keep-alive to avoid stale connections after long test runs
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }
  if (body) {
    options.headers['Content-Length'] = Buffer.byteLength(body)
  }

  return request(options, body)
}

// ---------------------------------------------------------------------------
// Fetch all test cases in a suite
// ---------------------------------------------------------------------------

function extractScenarioName(stepsXml) {
  if (!stepsXml) return null
  const decoded = stepsXml.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/<[^>]+>/g, ' ')
  const match = decoded.match(/Scenario:\s*(.+?)(?:\n|$)/i)
  return match ? match[1].trim() : null
}

async function fetchSuiteTestCases(planId, suiteId) {
  const res = await apiRequest(
    'GET',
    `/testplan/Plans/${planId}/Suites/${suiteId}/TestCase?api-version=7.1-preview.3`
  )
  return (res.value || []).map(tc => {
    const stepsField = (tc.workItem.workItemFields || []).find(f => f['Microsoft.VSTS.TCM.Steps'])
    const scenarioName = extractScenarioName(stepsField?.['Microsoft.VSTS.TCM.Steps'])
    if (!scenarioName) {
      console.warn(`  [WARN] Could not extract scenario name from test case "${tc.workItem.name}" — using work item title as fallback`)
    }
    return {
      id: tc.workItem.id,
      name: scenarioName || tc.workItem.name,
    }
  })
}

// ---------------------------------------------------------------------------
// Step 1 — Resolve testPointId
// ---------------------------------------------------------------------------

async function resolveTestPointId(planId, suiteId, caseId) {
  const res = await apiRequest(
    'GET',
    `/test/plans/${planId}/suites/${suiteId}/points?testCaseId=${caseId}&api-version=7.1`
  )
  const points = res.value || []
  if (points.length === 0) {
    throw new Error(`No test points found for testCaseId=${caseId} in suite=${suiteId}`)
  }
  return points[0].id
}

// ---------------------------------------------------------------------------
// Step 2 — Create Test Run
// ---------------------------------------------------------------------------

async function createTestRun(planId, testPointId) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  const res = await apiRequest('POST', '/test/runs?api-version=7.1', {
    name: `E2E Run — ${timestamp}`,
    plan: { id: Number(planId) },
    pointIds: [testPointId],
    isAutomated: true,
  })
  return res.id
}

// ---------------------------------------------------------------------------
// Step 3 — Update result
// ---------------------------------------------------------------------------

async function getTestResultId(runId) {
  // Azure Test Plans automatically creates a result entry when the run is created.
  // We must fetch its assigned id before patching — the id is not predictable.
  const res = await apiRequest('GET', `/test/runs/${runId}/results?api-version=7.1`)
  const results = res.value || []
  if (results.length === 0) throw new Error(`No results found for runId=${runId}`)
  return results[0].id
}

async function updateTestResult(runId, scenarioName, status, errorMessage) {
  const outcome = status === 'passed' ? 'Passed' : 'Failed'
  const resultId = await getTestResultId(runId)

  const res = await apiRequest('PATCH', `/test/runs/${runId}/results?api-version=7.1`, [
    {
      id: resultId,
      testCaseTitle: scenarioName,
      outcome,
      state: 'Completed',
      comment: errorMessage || '',
    },
  ])
  const results = res.value || []
  if (results.length === 0) throw new Error('No results returned after PATCH')
  return results[0].id
}

// ---------------------------------------------------------------------------
// Step 4 — Upload screenshot
// ---------------------------------------------------------------------------

async function uploadScreenshot(runId, resultId, screenshotPath) {
  if (!screenshotPath || !fs.existsSync(screenshotPath)) return

  const fileBuffer = fs.readFileSync(screenshotPath)
  const base64 = fileBuffer.toString('base64')
  const fileName = path.basename(screenshotPath)

  await apiRequest(
    'POST',
    `/test/runs/${runId}/results/${resultId}/attachments?api-version=7.1`,
    {
      attachmentType: 'GeneralAttachment',
      fileName,
      stream: base64,
    }
  )
}

// ---------------------------------------------------------------------------
// Step 5 — Complete Test Run
// ---------------------------------------------------------------------------

async function completeTestRun(runId) {
  await apiRequest('PATCH', `/test/runs/${runId}?api-version=7.1`, {
    state: 'Completed',
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Publishes an array of scenario results to Azure Test Plans.
 * Each result can carry its own testCaseId (from-suite mode).
 * Falls back to AZURE_TEST_CASE_ID env var when not present.
 *
 * @param {Array<{ scenarioName: string, status: 'passed'|'failed', error: string|null, screenshotPath: string|null, testCaseId?: string|number }>} results
 * @param {{ planId?: string, suiteId?: string, caseId?: string }} [opts]
 */
const { resolveAzurePlanId, resolveAzureSuiteId } = require('./lib/azure-env')

async function publishResults(results, opts = {}) {
  const planId = resolveAzurePlanId(opts)
  const suiteId = resolveAzureSuiteId(opts)
  const defaultCaseId = opts.caseId || process.env.AZURE_TEST_CASE_ID

  if (!planId) throw new Error('Missing AZURE_TEST_PLAN_ID (or PLAN_ID)')
  if (!suiteId) throw new Error('Missing AZURE_TEST_SUITE_ID (or SUITE_ID)')

  // Group results by testCaseId
  const grouped = {}
  for (const result of results) {
    const caseId = String(result.testCaseId || defaultCaseId || '')
    if (!caseId) throw new Error(`No testCaseId for scenario "${result.scenarioName}" and AZURE_TEST_CASE_ID is not set`)
    if (!grouped[caseId]) grouped[caseId] = []
    grouped[caseId].push(result)
  }

  console.log('\nPublishing results to Azure Test Plans...')

  for (const [caseId, caseResults] of Object.entries(grouped)) {
    const testPointId = await resolveTestPointId(planId, suiteId, caseId)
    console.log(`  testPointId: ${testPointId} (testCase: ${caseId})`)

    const runId = await createTestRun(planId, testPointId)
    console.log(`  runId: ${runId}`)

    for (const result of caseResults) {
      console.log(`  Publishing scenario: "${result.scenarioName}" → ${result.status}`)
      const resultId = await updateTestResult(runId, result.scenarioName, result.status, result.error)
      if (result.screenshotPath) {
        await uploadScreenshot(runId, resultId, result.screenshotPath)
        console.log(`    Screenshot attached: ${result.screenshotPath}`)
      }
    }

    await completeTestRun(runId)
    console.log(`  Test run ${runId} completed.`)
  }
}

module.exports = { publishResults, fetchSuiteTestCases }
