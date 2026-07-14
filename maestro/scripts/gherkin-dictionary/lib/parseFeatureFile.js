const fs = require('fs')
const path = require('path')

function hasOutlinePlaceholder(text) {
  return /<[^>]+>/.test(text)
}

function parseTags(trimmedLine) {
  return trimmedLine.split(/\s+/).filter(tag => tag.startsWith('@'))
}

function mergeTags(...tagLists) {
  const merged = []
  for (const list of tagLists) {
    for (const tag of list) {
      if (!merged.includes(tag)) merged.push(tag)
    }
  }
  return merged
}

function pushStatement(statements, {
  type,
  sentence,
  filePath,
  repoRoot,
  lineNumber,
  scenario,
  tags,
}) {
  const fileName = path.basename(filePath, '.feature')
  const funcionalidad = fileName.charAt(0).toUpperCase() + fileName.slice(1)

  statements.push({
    tipo: type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(),
    sentencia: sentence,
    funcionalidad,
    feature: fileName,
    scenario,
    archivo: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
    linea: lineNumber,
    tags: [...tags],
    outlinePlaceholder: hasOutlinePlaceholder(sentence),
  })
}

function parseFeatureFile(filePath, repoRoot = process.cwd()) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const statements = []

  let featureTags = []
  let pendingScenarioTags = []
  let seenFeature = false
  let inBackground = false
  let currentScenario = ''
  let activeScenarioTags = []

  lines.forEach((line, index) => {
    const trimmedLine = line.trim()
    const lineNumber = index + 1

    if (!trimmedLine || trimmedLine.startsWith('#')) return

    if (trimmedLine.startsWith('@')) {
      const tags = parseTags(trimmedLine)
      if (!seenFeature) featureTags.push(...tags)
      else if (inBackground) activeScenarioTags = mergeTags(activeScenarioTags, tags)
      else pendingScenarioTags.push(...tags)
      return
    }

    if (/^Feature:/i.test(trimmedLine)) {
      seenFeature = true
      inBackground = false
      currentScenario = ''
      pendingScenarioTags = []
      return
    }

    if (/^Background:/i.test(trimmedLine)) {
      inBackground = true
      currentScenario = 'Background'
      activeScenarioTags = mergeTags(featureTags, pendingScenarioTags)
      pendingScenarioTags = []
      return
    }

    const scenarioMatch = trimmedLine.match(/^(?:Scenario|Scenario Outline):\s*(.+)$/i)
    if (scenarioMatch) {
      inBackground = false
      currentScenario = scenarioMatch[1]
      activeScenarioTags = mergeTags(featureTags, pendingScenarioTags)
      pendingScenarioTags = []
      return
    }

    const statementMatch = trimmedLine.match(/^(Given|When|Then|And|But)\s+(.+)$/i)
    if (!statementMatch || !currentScenario) return

    const [, type, sentence] = statementMatch
    pushStatement(statements, {
      type,
      sentence,
      filePath,
      repoRoot,
      lineNumber,
      scenario: currentScenario,
      tags: activeScenarioTags,
    })
  })

  return statements
}

module.exports = { parseFeatureFile, hasOutlinePlaceholder }
