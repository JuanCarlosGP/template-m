const { extractGherkinData } = require('./lib/extractGherkinData')

if (require.main === module) {
  extractGherkinData()
    .then(({ analytics }) => {
      if (analytics.pasosSinDefinicion > 0) process.exit(1)
    })
    .catch(error => {
      console.error('❌ Error extrayendo datos:', error)
      process.exit(1)
    })
}
