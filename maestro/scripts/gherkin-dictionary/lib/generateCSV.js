function escapeCsvField(value) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function generateCSV(statements) {
  const headers = [
    'tipo',
    'sentencia',
    'funcionalidad',
    'feature',
    'scenario',
    'archivo',
    'linea',
    'tags',
    'flow',
    'pattern',
    'executesFlow',
  ]
  const rows = [headers.map(escapeCsvField).join(',')]

  statements.forEach(statement => {
    const row = [
      statement.tipo,
      statement.sentencia,
      statement.funcionalidad,
      statement.feature,
      statement.scenario,
      statement.archivo,
      statement.linea,
      statement.tags.join(' '),
      statement.flow ?? '',
      statement.pattern ?? '',
      statement.executesFlow ? 'true' : 'false',
    ]
    rows.push(row.map(escapeCsvField).join(','))
  })

  return rows.join('\n')
}

module.exports = { generateCSV }
