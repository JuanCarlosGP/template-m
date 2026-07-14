const { resolveStepSafe, resolveAllMatches, getAllDefinitions } = require('../../../step-definitions')
const { hasOutlinePlaceholder } = require('./parseFeatureFile')

function enrichStatements(statements) {
  const usedPatterns = new Set()

  const enriched = statements.map(statement => {
    const outlinePlaceholder = statement.outlinePlaceholder ?? hasOutlinePlaceholder(statement.sentencia)
    const match = outlinePlaceholder ? null : resolveStepSafe(statement.sentencia)

    if (match) usedPatterns.add(match.pattern)

    return {
      ...statement,
      outlinePlaceholder,
      pattern: match?.pattern ?? null,
      flow: match?.flow ?? null,
      params: match?.paramNames ?? [],
      description: match?.description ?? null,
      definitionFile: match?.definitionFile ?? null,
      executesFlow: match?.executesFlow ?? false,
      maestroFlowPath: match?.maestroFlowPath ?? null,
    }
  })

  const definiciones = getAllDefinitions().map(def => ({
    ...def,
    usadoEnFeatures: usedPatterns.has(def.pattern),
  }))

  const pasosSinDefinicion = enriched.filter(s => !s.pattern && !s.outlinePlaceholder).length
  const pasosOutlinePlaceholder = enriched.filter(s => s.outlinePlaceholder).length
  const definicionesSinUso = definiciones.filter(d => !d.usadoEnFeatures).length

  return { enriched, definiciones, pasosSinDefinicion, pasosOutlinePlaceholder, definicionesSinUso }
}

function logWarnings(enriched, definiciones) {
  const outlineSteps = enriched.filter(s => s.outlinePlaceholder)
  if (outlineSteps.length > 0) {
    console.warn(
      `⚠️  ${outlineSteps.length} paso(s) con placeholders Scenario Outline (<...>) omitidos del matching:`,
    )
    outlineSteps.forEach(s =>
      console.warn(`   - [${s.tipo}] ${s.sentencia} (${s.archivo}:${s.linea})`),
    )
  }

  const unmatched = enriched.filter(s => !s.pattern && !s.outlinePlaceholder)
  if (unmatched.length > 0) {
    console.warn(`⚠️  ${unmatched.length} paso(s) sin definición en step-definitions:`)
    unmatched.forEach(s => console.warn(`   - [${s.tipo}] ${s.sentencia} (${s.archivo}:${s.linea})`))
  }

  const unused = definiciones.filter(d => !d.usadoEnFeatures)
  if (unused.length > 0) {
    console.warn(`⚠️  ${unused.length} definición(es) JSON no usada(s) en features:`)
    unused.forEach(d => console.warn(`   - ${d.pattern} (${d.definitionFile})`))
  }

  const warnedSteps = new Set()
  for (const s of enriched) {
    if (!s.pattern || warnedSteps.has(s.sentencia)) continue

    const allMatches = resolveAllMatches(s.sentencia)
    if (allMatches.length <= 1) continue

    warnedSteps.add(s.sentencia)
    console.warn(
      `⚠️  Colisión de definiciones: "${s.sentencia}" matchea ${allMatches.length} patterns (el runner usa el más específico):`,
    )
    console.warn(`   - [${s.tipo}] ${s.archivo}:${s.linea}`)
    allMatches.forEach((m, i) => {
      const marker = i === 0 ? '→' : ' '
      const suffix = i === 0 ? '  ← usado por el runner' : ''
      console.warn(`   ${marker} "${m.pattern}" (${m.definitionFile})${suffix}`)
    })
  }
}

module.exports = { enrichStatements, logWarnings }
