import { extractGherkinData } from './lib/extractGherkinData.js'
import { pathToFileURL } from 'node:url'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  extractGherkinData()
    .then(({ analytics }) => {
      if (analytics.pasosSinDefinicion > 0) process.exit(1)
    })
    .catch(error => {
      console.error('❌ Error extrayendo datos:', error)
      process.exit(1)
    })
}
