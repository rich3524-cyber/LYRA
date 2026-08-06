// LYRA/lyra-mcp/scripts/tool-selection-eval.ts
//
// Dev tooling only. Run manually via `npm run eval`. Never imported by
// src/ and never part of the deployed gateway -- @anthropic-ai/sdk lives
// in devDependencies for exactly that reason.
//
// Measures whether the real Claude API correctly selects the right
// registered tool given a natural-language prompt, across all core tools
// in TOOL_REGISTRY. Depends on ../scripts/eval-cases.ts, which does not
// exist yet -- it's added in the next task.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { TOOL_REGISTRY } from '../src/mcp-server'
import { CAPABILITY_REGISTRY } from '../src/capabilities/registry'
import { EVAL_CASES, type EvalCase } from './eval-cases'

// zodObjectToJsonSchema does the minimum conversion this script needs --
// Anthropic's tool-use API wants a JSON Schema `input_schema`, and every
// registry entry's schema here is a flat z.object() of primitives/optionals,
// not a schema needing full JSON Schema feature coverage (unions, refs,
// etc.). If a future registry entry needs something this can't represent,
// extend this function rather than reaching for a heavier conversion
// library for what's still a flat-object case.
function zodObjectToJsonSchema(schema: z.ZodTypeAny): { type: 'object'; properties: Record<string, unknown>; required: string[] } {
  const shape = (schema as z.ZodObject<Record<string, z.ZodTypeAny>>).shape ?? {}
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    // zod v4 deprecates ZodType#isOptional() in favor of safe-parsing
    // undefined (same pattern used in capabilities/registry.test.ts).
    const isOptional = field.safeParse(undefined).success
    properties[key] = { type: 'string' } // coarse -- good enough for tool-selection purposes, not full-fidelity validation
    if (!isOptional) required.push(key)
  }
  return { type: 'object', properties, required }
}

function buildToolDefinitions(): Anthropic.Tool[] {
  const coreTools = Object.entries(TOOL_REGISTRY).map(([name, tool]) => ({
    name,
    description: tool.description,
    input_schema: zodObjectToJsonSchema(tool.inputSchema),
  }))
  return coreTools
}

interface EvalResult {
  case: EvalCase
  selectedTool: string | null
  selectedParams: Record<string, unknown> | null
  toolCorrect: boolean
  paramsCorrect: boolean | null // null when the case doesn't check params
}

async function runCase(client: Anthropic, tools: Anthropic.Tool[], evalCase: EvalCase): Promise<EvalResult> {
  const response = await client.messages.create({
    // Matches the model string used throughout the main LYRA app (see
    // lyra/lib/anthropic.ts and lyra/services/ai/*) -- kept in sync
    // deliberately rather than picking a different model for eval-only
    // traffic.
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools,
    tool_choice: { type: 'any' }, // force a tool call -- we're testing selection, not whether it chooses to respond in prose
    messages: [{ role: 'user', content: evalCase.prompt }],
  })

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
  const selectedTool = toolUse?.name ?? null
  const selectedParams = (toolUse?.input as Record<string, unknown>) ?? null

  const toolCorrect = selectedTool === evalCase.expectedTool
  let paramsCorrect: boolean | null = null
  if (toolCorrect && evalCase.expectedParams) {
    paramsCorrect = Object.entries(evalCase.expectedParams).every(([key, value]) => selectedParams?.[key] === value)
  }

  return { case: evalCase, selectedTool, selectedParams, toolCorrect, paramsCorrect }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is required to run the eval.')
    process.exit(1)
  }

  console.log(`Registry: ${Object.keys(TOOL_REGISTRY).length} core tools, ${Object.keys(CAPABILITY_REGISTRY).length} capabilities.`)
  console.log(`Running ${EVAL_CASES.length} eval cases against the real Claude API...\n`)

  const client = new Anthropic({ apiKey })
  const tools = buildToolDefinitions()

  const results: EvalResult[] = []
  for (const evalCase of EVAL_CASES) {
    results.push(await runCase(client, tools, evalCase))
  }

  const correct = results.filter((r) => r.toolCorrect && r.paramsCorrect !== false).length
  const partial = results.filter((r) => r.toolCorrect && r.paramsCorrect === false).length
  const wrong = results.length - correct - partial

  console.log(`\n${correct}/${results.length} correct (${((correct / results.length) * 100).toFixed(1)}%)`)
  if (partial > 0) console.log(`${partial} right-tool-wrong-params (counted as failures against the 90% bar)`)
  if (wrong > 0) console.log(`${wrong} wrong tool entirely`)

  const failures = results.filter((r) => !r.toolCorrect || r.paramsCorrect === false)
  if (failures.length > 0) {
    console.log('\nFailures:')
    for (const f of failures) {
      console.log(`  "${f.case.prompt}"`)
      console.log(`    expected: ${f.case.expectedTool}${f.case.expectedParams ? ` ${JSON.stringify(f.case.expectedParams)}` : ''}`)
      console.log(`    got:      ${f.selectedTool}${f.selectedParams ? ` ${JSON.stringify(f.selectedParams)}` : ''}`)
    }
  }

  const passRate = (correct / results.length) * 100
  console.log(`\n${passRate >= 90 ? '✅ PASS' : '❌ FAIL'} -- ${passRate.toFixed(1)}% (threshold: 90%)`)
  process.exit(passRate >= 90 ? 0 : 1)
}

main().catch((err) => {
  console.error('Eval run failed:', err)
  process.exit(1)
})
