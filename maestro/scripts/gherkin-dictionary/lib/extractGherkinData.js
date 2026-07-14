const fs = require('fs')
const path = require('path')

const { parseFeatureFile } = require('./parseFeatureFile')
const { generateCSV } = require('./generateCSV')
const { enrichStatements, logWarnings } = require('./enrichStatements')

const dictionaryRoot = path.join(__dirname, '..')
const repoRoot = path.join(dictionaryRoot, '..', '..', '..')

function collectFeatureFiles(dir) {
  if (!fs.existsSync(dir)) return []

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectFeatureFiles(fullPath)
    if (entry.isFile() && entry.name.endsWith('.feature')) return [fullPath]
    return []
  })
}

async function extractGherkinData() {
  console.log('🔍 Extrayendo sentencias Gherkin...')

  const featuresDir = path.join(repoRoot, 'maestro', 'features')
  const featureFiles = collectFeatureFiles(featuresDir).sort()

  console.log(`📁 Encontrados ${featureFiles.length} archivos .feature`)

  const rawStatements = []
  for (const file of featureFiles) {
    rawStatements.push(...parseFeatureFile(file, repoRoot))
  }

  console.log(`📝 Extraídas ${rawStatements.length} sentencias`)

  const {
    enriched,
    definiciones,
    pasosSinDefinicion,
    pasosOutlinePlaceholder,
    definicionesSinUso,
  } = enrichStatements(rawStatements)
  logWarnings(enriched, definiciones)

  const analytics = {
    totalArchivos: featureFiles.length,
    totalSentencias: enriched.length,
    totalDefiniciones: definiciones.length,
    pasosSinDefinicion,
    pasosOutlinePlaceholder,
    definicionesSinUso,
    sentenciasPorTipo: {
      Given: enriched.filter(s => s.tipo === 'Given').length,
      When: enriched.filter(s => s.tipo === 'When').length,
      Then: enriched.filter(s => s.tipo === 'Then').length,
      And: enriched.filter(s => s.tipo === 'And').length,
      But: enriched.filter(s => s.tipo === 'But').length,
    },
  }

  const data = {
    generatedAt: new Date().toISOString(),
    analytics,
    sentencias: enriched,
    definiciones,
  }

  const outputDir = path.join(dictionaryRoot, 'reports')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const outputFile = path.join(outputDir, 'gherkin-extraction.json')
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2))

  const csvFile = path.join(outputDir, 'gherkin-extraction.csv')
  fs.writeFileSync(csvFile, generateCSV(enriched), 'utf8')

  console.log('✅ Datos extraídos guardados en:')
  console.log(`   - JSON: ${outputFile}`)
  console.log(`   - CSV:  ${csvFile}`)
  console.log('📊 Estadísticas:')
  console.log(`   - Archivos: ${analytics.totalArchivos}`)
  console.log(`   - Sentencias: ${analytics.totalSentencias}`)
  console.log(`   - Definiciones: ${analytics.totalDefiniciones}`)
  console.log(`   - Given: ${analytics.sentenciasPorTipo.Given}`)
  console.log(`   - When: ${analytics.sentenciasPorTipo.When}`)
  console.log(`   - Then: ${analytics.sentenciasPorTipo.Then}`)
  console.log(`   - And: ${analytics.sentenciasPorTipo.And}`)
  console.log(`   - But: ${analytics.sentenciasPorTipo.But}`)
  console.log(`   - Pasos sin definición: ${analytics.pasosSinDefinicion}`)
  console.log(`   - Pasos Scenario Outline (<...>): ${analytics.pasosOutlinePlaceholder}`)
  console.log(`   - Definiciones sin uso: ${analytics.definicionesSinUso}`)

  return { json: outputFile, csv: csvFile, analytics }
}

module.exports = { extractGherkinData }
