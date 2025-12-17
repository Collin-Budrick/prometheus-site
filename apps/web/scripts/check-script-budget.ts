import { thirdPartyCatalog } from '../src/config/third-party'

const violations: string[] = []
const maxBudgetKb = 150

for (const entry of thirdPartyCatalog) {
  if (!entry.budgetKb) {
    violations.push(`${entry.id} is missing an explicit size budget.`)
  }

  if (entry.budgetKb > maxBudgetKb) {
    violations.push(`${entry.id} exceeds the ${maxBudgetKb}kb ceiling (declared ${entry.budgetKb}kb).`)
  }

  if (entry.category !== 'widget' && !entry.partytown) {
    violations.push(`${entry.id} should be proxied through Partytown because it is ${entry.category}.`)
  }

  const attrs = entry.attributes ?? {}
  if (!entry.partytown && entry.load !== 'interaction') {
    const isAsync = attrs.async === true || attrs.defer === true
    if (!isAsync) {
      violations.push(`${entry.id} must be async/defer when not offloaded to Partytown.`)
    }
  }

  if (entry.load === 'interaction' && !entry.fallback) {
    violations.push(`${entry.id} needs a documented fallback/delay note for interaction gating.`)
  }

  if (!['defer', 'idle', 'interaction'].includes(entry.load)) {
    violations.push(`${entry.id} must opt into a non-blocking load strategy.`)
  }
}

if (violations.length) {
  console.error('Third-party script budget check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log(`Third-party script budget check passed for ${thirdPartyCatalog.length} entries.`)
