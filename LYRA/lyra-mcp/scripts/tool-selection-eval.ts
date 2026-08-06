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
  // Unlike top-level paramsCorrect, this DOES gate secondTurnCorrect (and
  // therefore isCaseCorrect) when evalCase.thenExpectedParams is set -- see
  // the computation in runCase for why that's safe to do here but not for
  // turn 1's arbitrary params.
  secondTurnCorrect?: boolean | null
  // Set (non-null) only when turn 2 was attempted but its own API call
  // threw (e.g. rate limit, network blip) -- distinct from secondTurnTool
  // being null because turn 1 already failed. Lets the failure printer say
  // "the second call errored" instead of misattributing it to turn 1.
  secondTurnError?: string | null
  // True when the case needed the list_workspaces prefix hop (see
  // runCase) before the real turn-1 evaluation could happen. Purely
  // diagnostic -- it never gates isCaseCorrect -- but worth surfacing since
  // it's the whole reason this hop exists: distinguishing "reasonable
  // exploratory list_workspaces call, then correctly proceeded" from
  // "genuinely picked the wrong tool" in the progress/failure output.
  usedWorkspaceHop: boolean
  // Mirrors secondTurnError, same bug class: set (non-null) only when the
  // hop was attempted but its own API call threw (rate limit, network
  // blip). Without this, a failed hop call has no way to distinguish itself
  // from "the model just picked the wrong tool," and the failure printer
  // would misreport a two-turn case as "turn 2 not attempted -- turn 1
  // already picked the wrong tool" when actually neither turn ever ran.
  hopError?: string | null
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

// Simulates the real list_workspaces tool's result shape -- see
// src/tools/list-workspaces.ts (which shapes the raw /api/workspaces
// response down to exactly these fields) and its test fixture, which this
// mirrors. Two entries, not one: two prompts in eval-cases.ts explicitly
// name "the LYRA workspace" (get_brand_profile's brand-voice prompt and
// get_workspace_overview's "what needs my attention" prompt), so a fixture
// containing only "Into The Wild Marketing" would hand the model back a
// workspace list that contradicts what the user just said -- an
// inconsistency that can produce flaky, non-deterministic scoring on those
// two cases, unrelated to actual model quality. Two named entries doesn't
// reintroduce the ambiguity problem this hop exists to fix: the two prompts
// that need a second workspace name it explicitly (nothing to disambiguate),
// and for every other prompt (which names no workspace at all) workspace_id
// isn't graded, so it doesn't matter which of the two the model picks --
// tool_choice: 'any' forces it to pick one regardless.
const SIMULATED_WORKSPACES = [
  { id: 'ws-eval-demo', name: 'Into The Wild Marketing', industry: 'Professional Services', plan: 'AGENCY', role: 'AGENCY_ADMIN', platforms: ['FACEBOOK', 'INSTAGRAM'] },
  { id: 'ws-eval-demo-2', name: 'LYRA', industry: 'Technology', plan: 'PRO', role: 'AGENCY_ADMIN', platforms: [] },
]

// Shared by every API call this script makes (initial call, the optional
// list_workspaces hop, and turn 2) -- pulls the model/max_tokens/tools/
// tool_choice boilerplate that used to be duplicated at each call site into
// one place now that there are three call sites instead of two.
function callModel(client: Anthropic, tools: Anthropic.Tool[], messages: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
  return client.messages.create({
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
    messages,
  })
}

async function runCase(client: Anthropic, tools: Anthropic.Tool[], evalCase: EvalCase): Promise<EvalResult> {
  // `history` accumulates the real conversation as it happens (prompt, then
  // whichever tool_use/tool_result exchanges actually occurred) so the
  // eventual turn-2 call (if any) builds on top of whatever really
  // happened -- including an optional list_workspaces hop -- rather than
  // re-deriving a parallel, possibly-inconsistent message list.
  const history: Anthropic.MessageParam[] = [{ role: 'user', content: evalCase.prompt }]

  const firstResponse = await callModel(client, tools, history)
  const firstToolUse = firstResponse.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')

  // `response`/`toolUse` are what the rest of this function treats as "the
  // turn-1 answer" -- ordinarily that's just firstResponse/firstToolUse
  // unchanged, but the list_workspaces hop below can advance them to a
  // second call's result before any of the existing turn-1 evaluation logic
  // runs, so that logic stays untouched and doesn't need to know a hop
  // happened at all.
  let response = firstResponse
  let toolUse = firstToolUse
  let usedWorkspaceHop = false

  // Generic, ungraded "workspace resolution prefix hop." Claude very
  // reasonably calls list_workspaces first for almost any prompt that
  // doesn't already establish enough workspace context (most prompts here
  // either name no workspace, or name one by display name like "Into The
  // Wild Marketing," which can't be resolved to a workspace_id without
  // listing workspaces first) -- src/prompts.ts's own example conversations
  // explicitly instruct exactly this ("Start by calling list_workspaces if
  // you don't already know which workspace I mean"). Treating that as a
  // hard failure conflated "reasonable exploratory call, then correctly
  // proceeded" with "genuinely picked the wrong tool." The
  // `evalCase.expectedTool !== 'list_workspaces'` guard avoids
  // double-counting the one case (the very first in EVAL_CASES) where
  // list_workspaces genuinely IS the correct first answer -- that case
  // never enters this branch, so it's scored by the unchanged toolCorrect
  // check below exactly as before.
  if (firstToolUse?.name === 'list_workspaces' && evalCase.expectedTool !== 'list_workspaces') {
    usedWorkspaceHop = true
    history.push({ role: 'assistant', content: firstResponse.content })
    history.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: firstToolUse.id,
          // Matches the real gateway's actual wire shape for this tool's
          // result -- see src/mcp-server.ts's `JSON.stringify(result)`
          // where result is listWorkspaces()'s `{ workspaces: [...] }`,
          // not the bare array.
          content: JSON.stringify({ workspaces: SIMULATED_WORKSPACES }),
        },
      ],
    })

    // This call's own try/catch, same reasoning as turn 2's below: a
    // transient failure on the hop call specifically must not be
    // mislabeled as a genuine tool-selection mistake, and must not discard
    // the fact that a hop was attempted at all. hopError (mirroring
    // secondTurnError) is what lets the failure printer tell "the hop's API
    // call itself errored" apart from "the model picked the wrong tool" --
    // without it this looked identical to turn 1 having failed outright.
    try {
      response = await callModel(client, tools, history)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  ERROR on list_workspaces hop for "${evalCase.prompt}": ${message}`)
      return { case: evalCase, selectedTool: null, selectedParams: null, toolCorrect: false, paramsCorrect: null, usedWorkspaceHop: true, hopError: message }
    }
    toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')

    // Exactly one hop, always at the very start -- deliberately no loop, no
    // recursion, and no check for list_workspaces appearing again here. If
    // this post-hop response is list_workspaces again (or anything else
    // unexpected), selectedTool below simply won't match evalCase.
    // expectedTool and the case fails via the same toolCorrect path as any
    // other wrong-tool case -- exactly the "straightforward failure"
    // behavior the design calls for.
  }

  const selectedTool = toolUse?.name ?? null
  const selectedParams = (toolUse?.input as Record<string, unknown>) ?? null

  const toolCorrect = selectedTool === evalCase.expectedTool
  let paramsCorrect: boolean | null = null
  if (toolCorrect && evalCase.expectedParams) {
    paramsCorrect = Object.entries(evalCase.expectedParams).every(([key, value]) => paramsDeepEqual(selectedParams?.[key], value))
  }

  const turn1Result: EvalResult = { case: evalCase, selectedTool, selectedParams, toolCorrect, paramsCorrect, usedWorkspaceHop }

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
    return { ...turn1Result, secondTurnTool: null, secondTurnParams: null, secondTurnCorrect: null, secondTurnError: null }
  }

  history.push({ role: 'assistant', content: response.content })

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

  history.push({
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(simulatedResults),
      },
    ],
  })

  // Turn 2's own API call gets its own try/catch, deliberately narrower
  // than the outer per-case one in main(). If only this call fails (rate
  // limit, network blip), letting it propagate to main()'s catch would
  // discard turn 1's already-successful, already-paid-for result and
  // rebuild the whole case as toolCorrect: false -- which the failure
  // printer would then mislabel as "turn 1 already picked the wrong tool,"
  // even though turn 1 genuinely succeeded. Catching it here preserves
  // turn1Result and reports the second-call failure honestly instead.
  let secondResponse: Anthropic.Message
  try {
    secondResponse = await callModel(client, tools, history)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`  ERROR on turn 2 of "${evalCase.prompt}": ${message}`)
    return { ...turn1Result, secondTurnTool: null, secondTurnParams: null, secondTurnCorrect: null, secondTurnError: message }
  }

  const secondToolUse = secondResponse.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
  const secondTurnTool = secondToolUse?.name ?? null
  const secondTurnParams = (secondToolUse?.input as Record<string, unknown>) ?? null
  const secondToolCorrect = secondTurnTool === evalCase.thenExpectedTool
  // Unlike turn 1's paramsCorrect, this DOES gate secondTurnCorrect (and so
  // isCaseCorrect / the 90% bar) when thenExpectedParams is set. That's the
  // actual point of restructuring the eval this way -- eval-cases.ts's own
  // comment says these cases "assert the name key... since that's the thing
  // actually worth catching a regression on," and the capability name is a
  // plain string, not distorted by zodObjectToJsonSchema's coarse
  // "everything is type: string" conversion the way turn 1's numeric/array
  // fields can be. Checked per-key (matching paramsCorrect's own pattern
  // above) rather than whole-object equality against secondTurnParams:
  // thenExpectedParams only ever specifies `name`, and call_capability's own
  // nested `params` for capabilities that need extra input (add_competitor,
  // track_seo_page, etc.) is deliberately not compared -- same reasoning as
  // why turn 1 never gates on nested param shape.
  const secondTurnCorrect =
    secondToolCorrect &&
    (!evalCase.thenExpectedParams || Object.entries(evalCase.thenExpectedParams).every(([key, value]) => paramsDeepEqual(secondTurnParams?.[key], value)))

  return { ...turn1Result, secondTurnTool, secondTurnParams, secondTurnCorrect, secondTurnError: null }
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
  // Every case now costs up to 2 API calls, not 1 -- the list_workspaces
  // prefix hop (see runCase) can add one call even to single-turn cases --
  // and two-turn cases (search_capabilities -> call_capability) can cost up
  // to 3: hop + turn 1 + turn 2. Surfaced up front since this hits
  // Richard's real Anthropic bill, and neither the hop nor turn 2 reuse any
  // caching, so token cost is meaningfully higher than a flat per-case
  // count would suggest.
  const twoTurnCount = EVAL_CASES.filter((c) => c.thenExpectedTool).length
  const maxApiCalls = EVAL_CASES.length * 2 + twoTurnCount
  console.log(
    `Running ${EVAL_CASES.length} eval cases (${EVAL_CASES.length - twoTurnCount} single-turn, ${twoTurnCount} two-turn) against the real Claude API -- up to ${maxApiCalls} API calls (each case: 1 base call, +1 if it takes the list_workspaces hop, +1 more for two-turn cases)...\n`
  )

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
      result = { case: evalCase, selectedTool: null, selectedParams: null, toolCorrect: false, paramsCorrect: null, usedWorkspaceHop: false }
    }
    results.push(result)
    const hopNote = result.usedWorkspaceHop ? '  (via list_workspaces)' : ''
    process.stdout.write(`[${i + 1}/${EVAL_CASES.length}] ${isCaseCorrect(result) ? 'ok' : 'FAIL'}  ${evalCase.prompt.slice(0, 60)}${hopNote}\n`)
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
      // Surfaced here (not just in the progress tick) since a hop changes
      // what "turn 1" below actually means -- it's the response *after* the
      // simulated list_workspaces round-trip, not the model's first call.
      if (f.usedWorkspaceHop) {
        console.log('    (took the list_workspaces prefix hop first)')
      }
      // Checked FIRST, before either the single-turn or two-turn branches
      // below: hopError means the hop's own API call threw (rate limit,
      // network blip) before any turn-1 evaluation could even happen --
      // selectedTool/toolCorrect are just the runCase's null/false
      // placeholders in that case, not a real model answer. Printing the
      // turn-1/turn-2 branches below for this case would misreport an
      // infrastructure failure as "turn 1 already picked the wrong tool" --
      // the exact bug this mirrors from secondTurnError.
      if (f.hopError) {
        console.log(`    list_workspaces hop API call failed (not a selection failure): ${f.hopError}`)
        continue
      }
      if (f.case.thenExpectedTool) {
        // Two-turn case: make explicit which hop failed, since "turn 1
        // never got there" and "turn 1 was fine but turn 2 picked the wrong
        // thing" are different bugs to chase down.
        console.log(`    turn 1 expected: ${f.case.expectedTool}`)
        console.log(`    turn 1 got:      ${f.selectedTool}${f.selectedParams ? ` ${JSON.stringify(f.selectedParams)}` : ''}`)
        if (!f.toolCorrect) {
          console.log('    turn 2 not attempted -- turn 1 already picked the wrong tool')
        } else if (f.secondTurnError) {
          // Distinct from "turn 1 failed": turn 1 was correct, but turn 2's
          // own API call errored (rate limit, network blip) -- not a model
          // selection mistake at all.
          console.log(`    turn 2 API call failed (not a selection failure): ${f.secondTurnError}`)
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
