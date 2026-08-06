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
import { matchCapabilityEntries } from '../src/tools/search-capabilities'
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
  // Informational only -- see the pass/fail bucketing note in main() for
  // why this never gates the 90% threshold. null when the case doesn't
  // check params (including when runCase itself failed -- see the
  // per-case try/catch in main()).
  paramsCorrect: boolean | null
  // Second-turn fields. Only populated for two-turn cases (evalCase.
  // thenExpectedTool set) -- undefined for ordinary single-turn cases.
  // null (as opposed to undefined) specifically means "turn 2 was never
  // attempted because turn 1 already failed" -- see runCase.
  secondTurnTool?: string | null
  secondTurnParams?: Record<string, unknown> | null
  secondTurnCorrect?: boolean | null
}

// Deep-equal comparison for expectedParams checks. `===` can never match
// arrays/objects by value (draft_post/schedule_post's `platforms:
// z.array(z.string())`, call_capability's arbitrary `params`), and the
// zodObjectToJsonSchema conversion above coarsely types every field as
// "string" regardless of its real Zod type, so Claude may legitimately
// return a numeric field (e.g. get_analytics's `period`) as the string
// "30" against an expected numeric 30. Coerce primitives to string before
// comparing so that mismatch doesn't register as wrong; fall back to
// JSON.stringify for objects/arrays -- good enough for this dev-only,
// informational-only check, not a general deep-equal.
function paramsDeepEqual(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true
  if (typeof actual === 'object' && actual !== null && typeof expected === 'object' && expected !== null) {
    return JSON.stringify(actual) === JSON.stringify(expected)
  }
  return String(actual) === String(expected)
}

// Shared by both turns -- same model, same tool set, same tool_choice. See
// the inline comments at the first call site for why each setting is there.
const TOOL_CHOICE_ANY_NO_PARALLEL = { type: 'any', disable_parallel_tool_use: true } as const

async function runCase(client: Anthropic, tools: Anthropic.Tool[], evalCase: EvalCase): Promise<EvalResult> {
  const response = await client.messages.create({
    // Matches the model string used throughout the main LYRA app (see
    // lyra/lib/anthropic.ts and lyra/services/ai/*) -- kept in sync
    // deliberately rather than picking a different model for eval-only
    // traffic.
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools,
    // type: 'any' forces a tool call -- we're testing selection, not
    // whether it chooses to respond in prose. disable_parallel_tool_use
    // guards against non-deterministic scoring: parallel tool use is on
    // by default, so without this Claude could return multiple tool_use
    // blocks and the script would silently score whichever came first.
    tool_choice: TOOL_CHOICE_ANY_NO_PARALLEL,
    messages: [{ role: 'user', content: evalCase.prompt }],
  })

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
  const selectedTool = toolUse?.name ?? null
  const selectedParams = (toolUse?.input as Record<string, unknown>) ?? null

  const toolCorrect = selectedTool === evalCase.expectedTool
  let paramsCorrect: boolean | null = null
  if (toolCorrect && evalCase.expectedParams) {
    paramsCorrect = Object.entries(evalCase.expectedParams).every(([key, value]) => paramsDeepEqual(selectedParams?.[key], value))
  }

  const turn1Result: EvalResult = { case: evalCase, selectedTool, selectedParams, toolCorrect, paramsCorrect }

  if (!evalCase.thenExpectedTool) {
    return turn1Result
  }

  // Two-turn case (search_capabilities -> call_capability). Turn 2 only
  // makes sense to attempt if turn 1 actually got the documented protocol's
  // first hop right and left us a tool_use block to build turn 2's history
  // from -- if turn 1 was already wrong (or, in principle, tool_choice:
  // 'any' somehow returned no tool_use at all), there's no correct turn-1
  // call to follow up on, so turn 2 is recorded as not-attempted rather than
  // run against a nonsensical premise.
  if (!toolCorrect || !toolUse) {
    return { ...turn1Result, secondTurnTool: null, secondTurnParams: null, secondTurnCorrect: null }
  }

  // Simulate search_capabilities's real result using the already-fixed,
  // pure matchCapabilityEntries -- no live backend/workspace/plan-tier check
  // needed for a selection eval. available: true for every match is an
  // acceptable simplification here: there's no real workspace/plan to check
  // against in this simulation, and plan-tier gating doesn't change which
  // tool the model should pick next.
  const query = typeof selectedParams?.query === 'string' ? selectedParams.query : ''
  const simulatedResults = matchCapabilityEntries(query).map(([name, cap]) => ({
    name,
    description: cap.description,
    available: true,
  }))

  const secondResponse = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools,
    tool_choice: TOOL_CHOICE_ANY_NO_PARALLEL,
    messages: [
      { role: 'user', content: evalCase.prompt },
      { role: 'assistant', content: response.content },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(simulatedResults),
          },
        ],
      },
    ],
  })

  const secondToolUse = secondResponse.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
  const secondTurnTool = secondToolUse?.name ?? null
  const secondTurnParams = (secondToolUse?.input as Record<string, unknown>) ?? null
  const secondTurnCorrect = secondTurnTool === evalCase.thenExpectedTool

  return { ...turn1Result, secondTurnTool, secondTurnParams, secondTurnCorrect }
}

// A case's overall pass/fail: a two-turn case needs both hops right, a
// single-turn case just needs its one tool call right. Shared by the
// progress tick and the summary bucketing in main() so both report the same
// notion of "correct."
function isCaseCorrect(result: EvalResult): boolean {
  return result.case.thenExpectedTool ? result.toolCorrect && result.secondTurnCorrect === true : result.toolCorrect
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
  for (const [i, evalCase] of EVAL_CASES.entries()) {
    let result: EvalResult
    try {
      result = await runCase(client, tools, evalCase)
    } catch (err) {
      // A single persistent failure (rate limit, network blip) mid-run
      // must not discard every case that already succeeded, after
      // minutes of real paid API calls -- record it as a wrong-tool
      // failure and keep going so the summary still prints at the end.
      console.error(`  ERROR on "${evalCase.prompt}": ${err instanceof Error ? err.message : String(err)}`)
      result = { case: evalCase, selectedTool: null, selectedParams: null, toolCorrect: false, paramsCorrect: null }
    }
    results.push(result)
    process.stdout.write(`[${i + 1}/${EVAL_CASES.length}] ${isCaseCorrect(result) ? 'ok' : 'FAIL'}  ${evalCase.prompt.slice(0, 60)}\n`)
  }

  // Pass/fail is gated on tool selection only. zodObjectToJsonSchema types
  // every field as "string" regardless of its real Zod type -- fine for
  // selection (driven by tool name/description/required-fields, not
  // property types), but it means an expectedParams check against a
  // non-string field is measured against a schema shape the real deployed
  // gateway never serves (production passes the real Zod schemas to
  // registerTool). So paramsCorrect is informational only: reported in
  // the summary and failure output, never counted against the 90% bar.
  // For two-turn cases, "correct" additionally requires turn 2's tool to be
  // right (see isCaseCorrect) -- turn 1 alone getting search_capabilities
  // right isn't the thing being measured, the full documented protocol is.
  const correct = results.filter(isCaseCorrect).length
  const partial = results.filter((r) => r.toolCorrect && r.paramsCorrect === false).length
  const wrong = results.length - correct

  console.log(`\n${correct}/${results.length} correct (${((correct / results.length) * 100).toFixed(1)}%)`)
  if (partial > 0) console.log(`${partial} right-tool-wrong-params (informational only, not counted against the 90% bar)`)
  if (wrong > 0) console.log(`${wrong} wrong tool entirely (includes two-turn cases where turn 1 succeeded but turn 2 didn't)`)

  const failures = results.filter((r) => !isCaseCorrect(r) || r.paramsCorrect === false)
  if (failures.length > 0) {
    console.log('\nFailures:')
    for (const f of failures) {
      console.log(`  "${f.case.prompt}"`)
      if (f.case.thenExpectedTool) {
        // Two-turn case: make explicit which hop failed, since "turn 1
        // never got there" and "turn 1 was fine but turn 2 picked the wrong
        // thing" are different bugs to chase down.
        console.log(`    turn 1 expected: ${f.case.expectedTool}`)
        console.log(`    turn 1 got:      ${f.selectedTool}${f.selectedParams ? ` ${JSON.stringify(f.selectedParams)}` : ''}`)
        if (!f.toolCorrect) {
          console.log('    turn 2 not attempted -- turn 1 already picked the wrong tool')
        } else {
          console.log(`    turn 2 expected: ${f.case.thenExpectedTool}${f.case.thenExpectedParams ? ` ${JSON.stringify(f.case.thenExpectedParams)}` : ''}`)
          console.log(`    turn 2 got:      ${f.secondTurnTool ?? '(no tool_use returned)'}${f.secondTurnParams ? ` ${JSON.stringify(f.secondTurnParams)}` : ''}`)
        }
      } else {
        console.log(`    expected: ${f.case.expectedTool}${f.case.expectedParams ? ` ${JSON.stringify(f.case.expectedParams)}` : ''}`)
        console.log(`    got:      ${f.selectedTool}${f.selectedParams ? ` ${JSON.stringify(f.selectedParams)}` : ''}`)
      }
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
