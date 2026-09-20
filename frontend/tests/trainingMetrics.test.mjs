import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/trainingMetrics.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
})
const metrics = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

const set = (patch = {}) => ({ is_completed: true, set_type: 'working', reps: 10, weight: 100, rpe: 8, ...patch })
assert.equal(metrics.loadedVolume(set(), 'weight_reps'), 1000)
assert.equal(metrics.loadedVolume(set(), 'bodyweight_reps'), 0)
assert.equal(metrics.loadedVolume(set({ weight: 25, reps: 8 }), 'weighted_bodyweight'), 0)
assert.equal(metrics.loadedVolume(set({ set_type: 'warmup' }), 'weight_reps'), 0)
assert.equal(metrics.estimatedOneRepMax(set({ reps: 16 }), 'weight_reps'), null)
assert.equal(metrics.progressionSuggestion([[set()], [set()]], '8-10', 8, 5, 'weight_reps', 1), 'Increase load by 5 lb.')
assert.equal(metrics.progressionSuggestion([[set({ assistance_weight: 30, weight: null })], [set({ assistance_weight: 30, weight: null })]], '8-10', 8, 5, 'assisted_bodyweight', 1), 'Decrease assistance by 5 lb.')
assert.equal(metrics.progressionSuggestion([[set()], [set()]], '8-10', null, 5, 'weight_reps', 1), null)
assert.equal(metrics.progressionSuggestion([[set({ weight: null })], [set({ weight: null })]], '8-10', 8, 5, 'weight_reps', 1), null)
assert.equal(metrics.progressionSuggestion([[set({ assistance_weight: 3, weight: null })], [set({ assistance_weight: 3, weight: null })]], '8-10', 8, 5, 'assisted_bodyweight', 1), 'Repeat target with clean reps.')
assert.equal(metrics.progressionSuggestion([[set({ rpe: 10 })], [set({ rpe: 10 })]], '8-10', 8, 5, 'weight_reps', 1), 'Repeat target and reduce effort before progressing.')
assert.deepEqual(metrics.calculatePlatesPerSide(12, 0, [4, 3, 3]), { plates: [3, 3], loadedWeight: 12 })
assert.deepEqual(metrics.calculatePlatesPerSide(35, 45, [5]), { plates: [], loadedWeight: 45 })
assert.deepEqual(metrics.warmupSets(100), [{ weight: 45, reps: 8 }, { weight: 60, reps: 5 }, { weight: 80, reps: 3 }])
console.log('trainingMetrics tests passed')
