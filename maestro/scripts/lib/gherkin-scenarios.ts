
/**
 * Scenarios in a Gherkin feature, with Background steps already prepended.
 * A feature Background applies to every scenario. A Background inside a Rule
 * applies only to that Rule's scenarios, after the feature Background.
 * @param {{ children?: Array } | null | undefined} feature
 * @returns {{ name: string, steps: Array }[]}
 */
function scenariosInFeature(feature) {
  const scenarios = []
  const walk = (children, inherited) => {
    let local = []
    for (const child of children || []) {
      if (child.background) {
        local = child.background.steps || []
      } else if (child.scenario) {
        scenarios.push({
          name: child.scenario.name,
          steps: [...inherited, ...local, ...(child.scenario.steps || [])],
        })
      } else if (child.rule) {
        walk(child.rule.children, [...inherited, ...local])
      }
    }
  }
  walk(feature && feature.children, [])
  return scenarios
}

export {scenariosInFeature }
