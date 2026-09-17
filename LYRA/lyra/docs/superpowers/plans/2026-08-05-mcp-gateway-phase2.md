# LYRA MCP Gateway — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 3 write tools (`draft_post`, `schedule_post`, `respond_to_item`), the backend fixes their write behavior depends on, gateway-side rate limiting, and audit logging to the already-deployed `lyra-mcp` gateway.

**Architecture:** Five small, additive changes to the main `LYRA/lyra` app (a new audit-log table + endpoint, a server-side approval-routing fix, a guardrail-check extraction, a new composed respond-to-item endpoint), plus new tools and cross-cutting infrastructure (rate limiting, audit-log wiring) in the already-deployed `LYRA/lyra-mcp` gateway package. Same pass-through security model as Phase 1: the gateway forwards the caller's bearer token on every call and holds no elevated trust of its own.

**Tech Stack:** Same as Phase 1 (`@modelcontextprotocol/server`/`node`, Express, `jose`, `zod`), plus `ioredis` (new gateway dependency, for rate limiting — reuses the same `REDIS_URL` the main app's Railway Redis instance already exposes).

---

## Before you start

Read `docs/superpowers/specs/2026-08-05-mcp-gateway-phase2-design.md` (this phase's spec) and `docs/LYRA-mcp-server-design.md` §3.4/§6 (parent spec's write-behavior and security sections) before starting.

**Refinements found while writing this plan** (grounded directly against the real current source, not assumed — same practice as Phase 1):

1. **`McpAuditLog`'s `outcome` has 2 values, not 3.** The spec's draft mentioned `SUCCESS | ERROR | REFUSED`. Writing Task 5/Task 12's exact code found that a guardrail refusal from `respond_to_item` is more naturally implemented as the gateway tool throwing a real error (matching the parent spec's §5 "structured refusals" convention — a refusal should read as a genuine MCP tool error the calling model sees clearly, not a silent partial success) — which the audit wrapper already logs as `ERROR` with a descriptive message. A third `REFUSED` enum value would need its own detection mechanism the generic per-tool wrapper doesn't have visibility into. Simplified to `SUCCESS | ERROR`; the refusal's specific rule/value is still fully captured in `errorMessage`.
2. **Rate limiting is keyed by the JWT `sub` claim (per-user) and `workspace_id` when present in a call's raw params (per-workspace)** — not a more elaborate scheme. `AuthInfo` (the SDK type `req.auth` uses) has no built-in user-identifier field; `sub` is carried through via its `extra` bag (`extra?: Record<string, unknown>`, confirmed present on the real type during Phase 1's grounding). Per-workspace limiting only applies when `workspace_id` was explicitly given (not after implicit resolution) — checking it earlier would mean resolving the workspace before even checking whether the caller is rate-limited, an unnecessary extra round-trip on every call.
   **Superseded during Task 14's code-quality review:** this refinement's own reasoning turned out to be the bug — omitting `workspace_id` (the common single-workspace case) meant BOTH per-workspace rate limiting AND audit logging silently didn't apply. Task 14's shipped wrapper now resolves `workspace_id` once (via the same idempotent `resolveWorkspaceId` every tool already calls internally, so this costs nothing extra in the common case) before both checks, for every tool except `list_workspaces` (the only one with no `workspace_id` field at all — see the final holistic review's finding on this exception). See `mcp-server.ts`'s `createToolCallback` for the shipped version; the note below (originally about Task 12) is also stale for the same reason.
3. **Write tools echo back workspace name, platform, and account name** (parent spec §6.2) via one additional lookup against the caller's already-fetched workspace list — this only applies to the 3 new write tools, not the 6 existing read tools, keeping their overhead unchanged.
4. **`McpAuditLog.userId` is optional with `onDelete: SetNull`, not required.** Found by code-quality review of Task 1's first pass, which caught two real problems in this plan's original draft: (a) the Prisma relations had no explicit `onDelete`, silently defaulting to `RESTRICT`, while the SQL migration said `CASCADE` — the two artifacts described different databases; (b) `CASCADE` on `userId` would silently erase the audit trail's record of what a since-deleted user did, defeating the point of an audit log. This schema already has a precedent for "who did this" references surviving actor deletion (`PostApproval.reviewerId`, optional + `SetNull`) — `McpAuditLog.userId` now follows it. `workspaceId` stays required with an explicit `onDelete: Cascade` (a workspace's audit trail should go with it, consistent with its other child records).
5. **The SQL migration is written idempotently, wrapped in a transaction.** Also found by Task 1's code-quality review: this project's `prisma/migrations-sql/*.sql` files are pasted by hand into the Supabase SQL Editor, and the established convention (`CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` in the existing precedent files) exists specifically so a partial or repeated paste doesn't break. Task 1's SQL below reflects this from the start.

---

## Task 1: `McpAuditLog` schema + manual migration

**Files:**
- Modify: `LYRA/lyra/prisma/schema.prisma`
- Create: `LYRA/lyra/prisma/migrations-sql/2026-08-05-mcp-audit-log.sql`

`prisma migrate dev`/`db push` hang against this project's Supabase pooler (established, documented limitation) — the actual table is created via a hand-written SQL file applied manually through the Supabase SQL Editor, matching the existing precedent (`prisma/migrations-sql/2026-08-02-missing-fk-indexes.sql`).

- [ ] **Step 1: Add the model to `schema.prisma`**

Add near the end of the file (after the last model):

```prisma
enum McpAuditOutcome {
  SUCCESS
  ERROR
}

model McpAuditLog {
  id           String          @id @default(cuid())
  workspaceId  String
  workspace    Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  userId       String?
  user         User?           @relation(fields: [userId], references: [id], onDelete: SetNull)
  toolName     String
  params       Json?
  outcome      McpAuditOutcome
  errorMessage String?
  createdAt    DateTime        @default(now())

  @@index([workspaceId])
  @@index([userId])
  @@index([createdAt])
}
```

`userId` is optional so the row survives if the acting user's account is later deleted (`onDelete: SetNull`) — `POST /api/mcp/audit` (Task 2) always populates it at write time from the authenticated caller, but the column itself must allow null for that to hold true after a deletion. `workspaceId` stays required with an explicit `onDelete: Cascade` — a workspace's audit trail should go with it, consistent with how its other child records behave.

Add the back-reference to the `Workspace` model (find its `guardrails Guardrail[]` line and add immediately after):

```prisma
  mcpAuditLogs       McpAuditLog[]
```

Add the back-reference to the `User` model (find its `approvals PostApproval[]` line and add immediately after):

```prisma
  mcpAuditLogs    McpAuditLog[]
```

- [ ] **Step 2: Generate the Prisma client (local codegen only, no DB connection)**

```bash
cd LYRA/lyra
npx prisma generate
```

Expected: succeeds, no errors. This only regenerates TypeScript types from the schema file — it does not touch the database.

- [ ] **Step 3: Write the SQL migration file**

```sql
-- Backs the McpAuditLog Prisma model (schema.prisma). Idempotent and
-- transactional -- this file is applied by hand via the Supabase SQL
-- Editor, so a partial or repeated paste must not break on re-run.
BEGIN;

DO $$ BEGIN
  CREATE TYPE "McpAuditOutcome" AS ENUM ('SUCCESS', 'ERROR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "McpAuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT,
  "toolName" TEXT NOT NULL,
  "params" JSONB,
  "outcome" "McpAuditOutcome" NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "McpAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "McpAuditLog_workspaceId_idx" ON "McpAuditLog"("workspaceId");
CREATE INDEX IF NOT EXISTS "McpAuditLog_userId_idx" ON "McpAuditLog"("userId");
CREATE INDEX IF NOT EXISTS "McpAuditLog_createdAt_idx" ON "McpAuditLog"("createdAt");

COMMIT;
```

(Postgres has no `CREATE TYPE IF NOT EXISTS`, hence the `DO` block with exception handling.)

- [ ] **Step 4: Apply the SQL — flag to Richard, do not attempt via `prisma migrate`/`db push`**

This step needs Richard to run the SQL file's contents in the Supabase SQL Editor (or via Supabase MCP if that connection is authorized in the current session) against the project's Postgres database. Do not run `npx prisma migrate dev` or `npx prisma db push` — both hang against this project's Supabase connection pooler.

- [ ] **Step 5: Typecheck the whole app to confirm the generated client is picked up correctly**

```bash
npx tsc --noEmit
```

Expected: clean (the new `prisma.mcpAuditLog` model should now be typed, even though the table doesn't exist in the DB until Step 4 runs — Prisma's generated client only needs the schema file, not a live connection, to typecheck).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations-sql/2026-08-05-mcp-audit-log.sql
git commit -m "feat: add McpAuditLog schema for MCP tool-call audit trail"
```

---

## Task 2: `POST /api/mcp/audit` endpoint

**Files:**
- Create: `LYRA/lyra/app/api/mcp/audit/route.ts`
- Test: `LYRA/lyra/app/api/mcp/audit/route.test.ts`

The gateway calls this once per tool invocation to record the outcome. Depends on Task 1's `McpAuditLog` model existing in the generated Prisma client (does not require the real DB table to exist yet for tests, which mock `prisma`).

**Note on `params` handling:** the Zod schema's `params: z.unknown().optional()` accepts `null`, but Prisma's generated create-input type for a nullable `Json` column (`NullableJsonNullValueInput | InputJsonValue`) does not accept a bare `null` — only `Prisma.DbNull`/`Prisma.JsonNull` or `undefined`. Found by Task 2's own code-quality review (a runtime 500 on a well-formed `params: null` body, hidden by an `as Prisma.InputJsonValue` cast that satisfied `tsc` without actually covering the null case). The implementation below handles this explicitly.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra/app/api/mcp/audit/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    mcpAuditLog: { create: vi.fn() },
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/mcp/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/mcp/audit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes an audit row for a request the caller has access to', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as any)
    vi.mocked(prisma.mcpAuditLog.create).mockResolvedValue({} as any)

    const res = await POST(req({
      workspaceId: 'ws-1',
      toolName: 'schedule_post',
      params: { workspace_id: 'ws-1', content: 'hello' },
      outcome: 'SUCCESS',
    }))

    expect(res.status).toBe(201)
    expect(prisma.mcpAuditLog.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        userId: 'user-1',
        toolName: 'schedule_post',
        params: { workspace_id: 'ws-1', content: 'hello' },
        outcome: 'SUCCESS',
        errorMessage: null,
      },
    })
  })

  it('writes an ERROR row with the error message when provided', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as any)
    vi.mocked(prisma.mcpAuditLog.create).mockResolvedValue({} as any)

    await POST(req({
      workspaceId: 'ws-1',
      toolName: 'respond_to_item',
      outcome: 'ERROR',
      errorMessage: 'Refused by guardrail: NEVER_DISCUSS - pricing',
    }))

    expect(prisma.mcpAuditLog.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        userId: 'user-1',
        toolName: 'respond_to_item',
        params: Prisma.DbNull,
        outcome: 'ERROR',
        errorMessage: 'Refused by guardrail: NEVER_DISCUSS - pricing',
      },
    })
  })

  it('returns 403 when the caller has no access to the given workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(null)

    const res = await POST(req({ workspaceId: 'ws-1', toolName: 'x', outcome: 'SUCCESS' }))
    expect(res.status).toBe(403)
    expect(prisma.mcpAuditLog.create).not.toHaveBeenCalled()
  })

  it('returns 400 on an invalid outcome value', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    const res = await POST(req({ workspaceId: 'ws-1', toolName: 'x', outcome: 'MAYBE' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ workspaceId: 'ws-1', toolName: 'x', outcome: 'SUCCESS' }))
    expect(res.status).toBe(401)
  })

  it('writes Prisma.DbNull, not a bare null, when params is explicitly null', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as any)
    vi.mocked(prisma.mcpAuditLog.create).mockResolvedValue({} as any)

    const res = await POST(req({ workspaceId: 'ws-1', toolName: 'x', outcome: 'SUCCESS', params: null }))

    expect(res.status).toBe(201)
    expect(prisma.mcpAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ params: Prisma.DbNull }) })
    )
  })

  it('returns 400 when errorMessage exceeds the size cap', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    const res = await POST(req({ workspaceId: 'ws-1', toolName: 'x', outcome: 'ERROR', errorMessage: 'x'.repeat(2001) }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when serialized params exceeds the size cap', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as any)

    const res = await POST(req({
      workspaceId: 'ws-1', toolName: 'x', outcome: 'SUCCESS',
      params: { content: 'x'.repeat(50_001) },
    }))
    expect(res.status).toBe(400)
    expect(prisma.mcpAuditLog.create).not.toHaveBeenCalled()
  })

  it('returns 429 and does not write when rate-limited', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    // checkRateLimit/rateLimitResponse run for real (see the @/lib/redis mock
    // above) against a mocked redisClient.eval -- returning a count above the
    // 120/60s limit is what makes this one request look rate-limited.
    vi.mocked(redisClient.eval).mockResolvedValueOnce(121)

    const res = await POST(req({ workspaceId: 'ws-1', toolName: 'x', outcome: 'SUCCESS' }))
    expect(res.status).toBe(429)
    expect(prisma.mcpAuditLog.create).not.toHaveBeenCalled()
  })
})
```

Add these imports/mocks alongside the existing ones at the top of the test file:

```typescript
import { Prisma } from '@prisma/client'
// Mocking the actual Redis boundary (not @/lib/rate-limit itself) lets
// checkRateLimit/rateLimitResponse run their real, already-tested logic
// without ever opening a real Redis connection during unit tests --
// avoids pulling ioredis's module-scope client construction (lib/redis.ts)
// into the test graph, which would make this file environment-sensitive
// (fails at collection time if REDIS_URL is malformed/unset in CI).
vi.mock('@/lib/redis', () => ({ redis: {}, redisClient: { eval: vi.fn().mockResolvedValue(1) } }))
import { redisClient } from '@/lib/redis'
```

`redisClient.eval` resolving to `1` by default means every test except the dedicated rate-limit test looks like "first request in the window" and stays well under the limit.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run app/api/mcp/audit/route.test.ts
```

Expected: `FAIL` — the route file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra/app/api/mcp/audit/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBody, ValidationError } from '@/lib/validate'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const MAX_PARAMS_JSON_LENGTH = 50_000

const auditSchema = z.object({
  workspaceId:  z.string().min(1),
  toolName:     z.string().min(1),
  params:       z.unknown().optional(),
  outcome:      z.enum(['SUCCESS', 'ERROR']),
  errorMessage: z.string().max(2000).nullish(),
})

// Called once per MCP tool invocation by the gateway (lyra-mcp), using the
// same bearer token the tool call itself used -- so workspace access is
// re-verified here exactly like every other bearer-authenticated route,
// rather than trusted from the gateway.
//
// `params` retention/redaction policy (PII in raw tool-call params, e.g.
// post/comment text) is deliberately out of scope here -- only a size cap
// is enforced below. Full redaction and pruning is a later hardening task.
export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`mcp-audit:${user.id}`, 120, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId, toolName, params, outcome, errorMessage } = await parseBody(req, auditSchema)

    if (params != null && JSON.stringify(params).length > MAX_PARAMS_JSON_LENGTH) {
      return NextResponse.json({ error: 'params exceeds maximum size' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.mcpAuditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        toolName,
        params: params == null ? Prisma.DbNull : (params as Prisma.InputJsonValue),
        outcome,
        errorMessage: errorMessage ?? null,
      },
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/mcp/audit error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run app/api/mcp/audit/route.test.ts
```

Expected: `PASS` — 5 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/mcp/audit/route.ts app/api/mcp/audit/route.test.ts
git commit -m "feat: add POST /api/mcp/audit endpoint for MCP tool-call audit logging"
```

---

## Task 3: Server-side approval-status resolution in `POST /api/posts`

**Files:**
- Modify: `LYRA/lyra/app/api/posts/route.ts`
- Modify: `LYRA/lyra/app/api/posts/route.test.ts` (if it exists — check first; if not, this task creates it alongside the new test cases below, but only for the `POST` handler's new behavior, not a full retrofit of existing untested behavior)

Closes the real gap found while researching this plan: nothing server-side today decides whether a post needs client approval before publishing — that logic only exists in a UI component. This is a general fix (not MCP-specific): the same gap exists for the web app, previously papered over by the UI only ever offering the "correct" status transition to a human using it thoughtfully.

**Scope note found during this task's code-quality review:** the `POST` (create) fix alone does not close the gap for the web app's actual everyday workflow — `PATCH /api/posts/[id]` (used when a `DRAFT` post is later marked scheduled from the calendar UI) writes `status` straight through with no approval routing at all, and `components/lyra/calendar/post-detail-panel.tsx` offers a "Mark as scheduled" transition even in `hasApprovalFlow` workspaces. The same `finalStatus` resolution therefore also needs to apply inside the `PATCH` handler — added as a follow-up within this task rather than a separate one, since it's required for the task's own stated claim ("nothing server-side enforced it") to actually be true. Also fix `components/lyra/composer/post-composer.tsx`'s success toast, which the `POST` change alone turns into a real regression: it announces the *requested* status ("Post scheduled.") rather than what the server actually returned, so a post landing in `PENDING_APPROVAL` gets told to the user as scheduled.

**Two further rounds found while fixing the above (both in `PATCH /api/posts/[id]`):** first, a naive `status === 'SCHEDULED' && clientAccessLevel === 'APPROVE' → PENDING_APPROVAL` redirect doesn't distinguish "a DRAFT post skipping straight to SCHEDULED" (the bypass) from "an already-APPROVED post legitimately being scheduled after approval" (the *only* real exit from the approval flow) — without excluding `existing.status === 'APPROVED'`, no approved post in any approval-enabled workspace could ever reach SCHEDULED, a total publish deadlock. Second, that exemption then needs to be conditional on content not having changed since approval (`existing.content`/`existing.mediaUrls` compared against the PATCH body) — otherwise an approved post's content can be silently swapped and published with no re-review, by its own author, since the self-approval role guard only fires when the request status is literally `APPROVED`, not `SCHEDULED`. The final condition: `!(existing.status === 'APPROVED' && !contentChanged)`.

- [ ] **Step 1: Check for an existing test file and read the current route in full**

```bash
cd LYRA/lyra
ls app/api/posts/route.test.ts 2>&1
```

If it exists, read it in full before proceeding, so the new tests you add are consistent with its existing structure and don't duplicate coverage. If it doesn't exist, proceed with a new file containing only the tests below (this task is not a full retrofit of the entire route's pre-existing untested behavior).

- [ ] **Step 2: Write the failing tests**

Add (or create the file with) these tests — adjust the mock setup to match whatever pattern an existing test file already uses if one exists; use this shape if creating fresh:

```typescript
// LYRA/lyra/app/api/posts/route.test.ts (new test cases — add to existing file if present)
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    socialAccount: { findMany: vi.fn() },
    post: { create: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/posts — approval-status resolution', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a SCHEDULED post as PENDING_APPROVAL when the workspace requires client approval', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      id: 'access-1', role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([{ id: 'sa-1', platform: 'FACEBOOK' }] as any)
    vi.mocked(prisma.post.create).mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data }))

    const res = await POST(req({
      workspaceId: 'ws-1', content: 'hello', platforms: ['FACEBOOK'],
      scheduledAt: '2026-09-01T00:00:00.000Z', status: 'SCHEDULED',
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body[0].status).toBe('PENDING_APPROVAL')
  })

  it('creates a SCHEDULED post as SCHEDULED when the workspace does not require client approval', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      id: 'access-1', role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'NONE' },
    } as any)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([{ id: 'sa-1', platform: 'FACEBOOK' }] as any)
    vi.mocked(prisma.post.create).mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data }))

    const res = await POST(req({
      workspaceId: 'ws-1', content: 'hello', platforms: ['FACEBOOK'],
      scheduledAt: '2026-09-01T00:00:00.000Z', status: 'SCHEDULED',
    }))

    const body = await res.json()
    expect(body[0].status).toBe('SCHEDULED')
  })

  it('does not apply approval-routing to a DRAFT post regardless of clientAccessLevel', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      id: 'access-1', role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([{ id: 'sa-1', platform: 'FACEBOOK' }] as any)
    vi.mocked(prisma.post.create).mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data }))

    const res = await POST(req({ workspaceId: 'ws-1', content: 'hello', platforms: ['FACEBOOK'], status: 'DRAFT' }))

    const body = await res.json()
    expect(body[0].status).toBe('DRAFT')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx vitest run app/api/posts/route.test.ts
```

Expected: `FAIL` — `PENDING_APPROVAL` isn't produced by the current implementation for any input.

- [ ] **Step 4: Modify the implementation**

In `app/api/posts/route.ts`'s `POST` function, change the access-check block from:

```typescript
    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```

to:

```typescript
    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
      include: { workspace: { select: { clientAccessLevel: true } } },
    })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Post publishing/scheduling routes through the client approval workflow
    // where it's enabled (parent MCP spec 3.4). A general fix, not
    // MCP-specific -- the same gap existed for the web app, previously
    // papered over by the UI (components/lyra/calendar/*) only ever
    // offering the "correct" status transition to a thoughtful human;
    // nothing server-side enforced it.
    const finalStatus: PostStatus =
      resolvedStatus === 'SCHEDULED' && access.workspace.clientAccessLevel === 'APPROVE'
        ? 'PENDING_APPROVAL'
        : resolvedStatus
```

Then change the `prisma.post.create` call's `data.status` field and its `select`/return shape to use `finalStatus` and echo back platform/account (for the parent spec's §6.2 wrong-workspace-write mitigation — every write must echo back platform and account handle so a misresolution is visible immediately):

```typescript
    // Create one Post per social account
    const posts = await prisma.$transaction(
      socialAccounts.map((account) =>
        prisma.post.create({
          data: {
            workspaceId,
            socialAccountId: account.id,
            authorId: user.id,
            content: content.trim(),
            mediaUrls: platformMedia?.[account.platform]?.length ? platformMedia[account.platform] : mediaUrls ?? [],
            status: finalStatus,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            topic: topic ?? null,
            requiresMedia: requiresMedia ?? false,
          },
          include: { socialAccount: { select: { platform: true, name: true } } },
        })
      )
    )
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run app/api/posts/route.test.ts
```

Expected: `PASS`.

- [ ] **Step 6: Full typecheck and full test suite**

```bash
npx tsc --noEmit
npm test
```

Expected: both clean. This route is used by the existing web app's Composer and Content Calendar — confirm nothing there broke. If any pre-existing test in this file asserted the raw (non-`include`d) shape of `posts.create`'s return value, update those assertions to account for the added `socialAccount` relation rather than removing the `include`.

- [ ] **Step 7: Commit**

```bash
git add app/api/posts/route.ts app/api/posts/route.test.ts
git commit -m "feat: route scheduled posts through client approval workflow server-side"
```

---

## Task 4: Extract `checkGuardrailViolation` from the response generator

**Files:**
- Modify: `LYRA/lyra/services/ai/response-generator.ts`
- Modify: `LYRA/lyra/services/ai/response-generator.test.ts` (if it exists — check first, same as Task 3)

Extracts the existing post-generation guardrail re-check (lines checking `NEVER_USE_WORD`/`NEVER_DISCUSS` against generated text) into its own reusable, separately-testable function — needed because Task 5's `respond_to_item` endpoint must be able to re-check guardrails against text that was never generated by `generateCommentResponse` in the first place (caller-supplied response text).

- [ ] **Step 1: Check for an existing test file**

```bash
cd LYRA/lyra
ls services/ai/response-generator.test.ts 2>&1
```

If it exists, read it in full — this refactor must not change `generateCommentResponse`'s existing behavior or its exact `escalationReason` message strings, since existing tests very likely assert on them.

- [ ] **Step 2: Write the failing test for the new function**

Add to the existing test file if present, or create a new one:

```typescript
// LYRA/lyra/services/ai/response-generator.test.ts (add this describe block)
import { checkGuardrailViolation } from './response-generator'
import type { Guardrail } from '@prisma/client'

function guardrail(type: Guardrail['type'], value: string): Guardrail {
  return { id: 'g1', workspaceId: 'ws-1', type, value } as Guardrail
}

describe('checkGuardrailViolation', () => {
  it('returns null when the text violates nothing', () => {
    const result = checkGuardrailViolation('Thanks for reaching out!', [guardrail('NEVER_DISCUSS', 'pricing')])
    expect(result).toBeNull()
  })

  it('detects a NEVER_USE_WORD violation, case-insensitively', () => {
    const result = checkGuardrailViolation('This is a GUARANTEED result', [guardrail('NEVER_USE_WORD', 'guaranteed')])
    expect(result).toEqual({ rule: 'NEVER_USE_WORD', value: 'guaranteed' })
  })

  it('detects a NEVER_DISCUSS violation, case-insensitively', () => {
    const result = checkGuardrailViolation('Our Pricing starts at $99', [guardrail('NEVER_DISCUSS', 'pricing')])
    expect(result).toEqual({ rule: 'NEVER_DISCUSS', value: 'pricing' })
  })

  it('ignores guardrail types other than NEVER_USE_WORD/NEVER_DISCUSS', () => {
    const result = checkGuardrailViolation('some text', [guardrail('ALWAYS_ESCALATE', 'some text')])
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run services/ai/response-generator.test.ts
```

Expected: `FAIL` — `checkGuardrailViolation` isn't exported yet.

- [ ] **Step 4: Extract the function and use it internally**

In `services/ai/response-generator.ts`, add this new exported function above `generateCommentResponse`:

```typescript
export interface GuardrailViolation {
  rule: 'NEVER_USE_WORD' | 'NEVER_DISCUSS'
  value: string
}

// Re-checks a piece of text against a workspace's NEVER_USE_WORD/
// NEVER_DISCUSS guardrails. Exported separately from generateCommentResponse
// so callers that need to check text NOT freshly generated by this function
// (e.g. the MCP respond_to_item endpoint, which may send caller-supplied
// text) can still enforce the same check before anything reaches a real
// platform -- guardrails must hold regardless of where the text came from.
export function checkGuardrailViolation(text: string, guardrails: Guardrail[]): GuardrailViolation | null {
  const neverUse = guardrails.filter(g => g.type === 'NEVER_USE_WORD').map(g => g.value)
  const neverDiscuss = guardrails.filter(g => g.type === 'NEVER_DISCUSS').map(g => g.value)
  const textLower = text.toLowerCase()

  for (const word of neverUse) {
    if (word && textLower.includes(word.toLowerCase())) {
      return { rule: 'NEVER_USE_WORD', value: word }
    }
  }
  for (const topic of neverDiscuss) {
    if (topic && textLower.includes(topic.toLowerCase())) {
      return { rule: 'NEVER_DISCUSS', value: topic }
    }
  }
  return null
}
```

Then replace `generateCommentResponse`'s existing inline post-generation check (the two `for` loops checking `neverUse`/`neverDiscuss` against `textLower`, immediately after the `if (text === 'ESCALATE')` block) with a call to the new function, preserving the exact same `escalationReason` message strings:

```typescript
  // Re-check the guardrails against the model's OUTPUT, not just the input comment.
  // A successful prompt injection would show up here even if it slipped past the
  // pre-call alwaysEscalate scan (which only ever looked at the comment text).
  const violation = checkGuardrailViolation(text, guardrails)
  if (violation) {
    const reason = violation.rule === 'NEVER_USE_WORD'
      ? `Generated response contained a forbidden word/phrase: "${violation.value}"`
      : `Generated response touched a forbidden topic: "${violation.value}"`
    return { response: null, shouldEscalate: true, escalationReason: reason }
  }
```

(Leave everything else in `generateCommentResponse` — the pre-call `alwaysEscalate` scan, the prompt construction, the Claude call, the `ESCALATE` check — completely untouched.)

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run services/ai/response-generator.test.ts
```

Expected: `PASS` — both the new `checkGuardrailViolation` tests and every pre-existing `generateCommentResponse` test (if a test file already existed) still pass unchanged, proving the refactor preserved exact behavior.

- [ ] **Step 6: Typecheck and full suite**

```bash
npx tsc --noEmit
npm test
```

Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add services/ai/response-generator.ts services/ai/response-generator.test.ts
git commit -m "refactor: extract checkGuardrailViolation for reuse outside generateCommentResponse"
```

---

## Task 5: `POST /api/mcp/respond-to-item` endpoint

**Files:**
- Create: `LYRA/lyra/app/api/mcp/respond-to-item/route.ts`
- Test: `LYRA/lyra/app/api/mcp/respond-to-item/route.test.ts`

Composes the two existing draft/send routes' underlying logic with autonomy-mode gating and a send-path guardrail re-check — the real gap this plan exists to close for `respond_to_item`. Read `app/api/ai/respond/route.ts` and `app/api/comments/[id]/reply/route.ts` in full before starting (both already exist and are not modified by this task — this is a new, third route reusing their same underlying functions/patterns).

**This is the highest-consequence endpoint in the plan (it can send a real reply to a real customer) and took 3 rounds of code-quality review to close.** Bake these directly into any re-implementation rather than rediscovering them: (1) refuse `ESCALATED` comments the same as `RESPONDED` — the initial composition only checked `RESPONDED`; (2) claim the comment atomically (guarded `updateMany` keyed on `status: { notIn: ['RESPONDED', 'ESCALATED'] }`) immediately before any status-changing write, not just before the final send — **every** status write in the handler (`AI_DRAFTED`, both `ESCALATED` writes, and the send-failure rollback to `AI_DRAFTED`) must be a guarded `updateMany` scoped this way, since an unconditional write anywhere in the sequence can clobber a concurrent request's already-claimed state and reopen a double-send; (3) rate-limit the endpoint (`checkRateLimit`, matching `/api/ai/respond`'s 20/60s) since it's reachable directly over a browser session, not just the MCP gateway; (4) reject an empty AI-generated response before drafting/sending (dropped in the composition, present in the reference send route); (5) extract and run `generateCommentResponse`'s `ALWAYS_ESCALATE` pre-call scan (as `checkAlwaysEscalate`, same pattern as `checkGuardrailViolation`) before **both** the AI-generated and caller-supplied-`responseText` paths — the caller-text path otherwise bypasses escalation entirely; (6) add a Zernio-side idempotency key (`x-request-id`, derived from `commentId + text`, following the existing `publishNow` precedent) to make a client-timeout retry safe against duplicate sends — note this only dedups identical-text retries, not a regenerated retry with different wording. A separate, genuinely serious, **pre-existing** issue was found but is explicitly out of scope here: `workers/ai-responder.worker.ts` is a second live sender for the same comments with none of this claim protocol, and can race directly against this endpoint under `FULL` autonomy — flagged to the project owner as its own follow-up, not fixed as part of this plan.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra/app/api/mcp/respond-to-item/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    comment: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    brandProfile: { findUnique: vi.fn() },
    guardrail: { findMany: vi.fn() },
  },
}))
vi.mock('@/services/ai/response-generator', () => ({
  generateCommentResponse: vi.fn(),
  checkGuardrailViolation: vi.fn(),
}))
vi.mock('@/services/social/provider', () => ({
  getProvider: vi.fn(),
  ProviderUnsupported: class ProviderUnsupported extends Error {},
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateCommentResponse, checkGuardrailViolation } from '@/services/ai/response-generator'
import { getProvider } from '@/services/social/provider'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/mcp/respond-to-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function baseComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1', workspaceId: 'ws-1', status: 'PENDING', content: 'nice post',
    socialAccount: {
      provider: 'ZERNIO', zernioAccountId: 'z1', accessToken: null,
      workspace: { aiResponseMode: 'DRAFT_APPROVE' },
    },
    platformCommentId: 'pc1', platformPostId: 'pp1',
    ...overrides,
  }
}

describe('POST /api/mcp/respond-to-item', () => {
  beforeEach(() => vi.clearAllMocks())

  it('generates a draft and stops there under DRAFT_APPROVE, never calling the send provider', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ response: 'Thanks!', shouldEscalate: false })

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: false, draft: 'Thanks!' })
    expect(getProvider).not.toHaveBeenCalled()
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!' },
    })
  })

  it('drafts and actually sends under FULL autonomy when no guardrail fires', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(
      baseComment({ socialAccount: { provider: 'ZERNIO', zernioAccountId: 'z1', accessToken: null, workspace: { aiResponseMode: 'FULL' } } }) as any
    )
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ response: 'Thanks!', shouldEscalate: false })
    vi.mocked(checkGuardrailViolation).mockReturnValue(null)
    const replyToComment = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getProvider).mockReturnValue({ replyToComment } as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: true, response: 'Thanks!' })
    expect(replyToComment).toHaveBeenCalledWith(expect.anything(), 'pp1', undefined, 'Thanks!')
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'RESPONDED', finalResponse: 'Thanks!' }),
    })
  })

  it('re-checks guardrails on caller-supplied text before sending under FULL autonomy, and refuses if one fires', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(
      baseComment({ socialAccount: { provider: 'ZERNIO', zernioAccountId: 'z1', accessToken: null, workspace: { aiResponseMode: 'FULL' } } }) as any
    )
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(checkGuardrailViolation).mockReturnValue({ rule: 'NEVER_DISCUSS', value: 'pricing' })

    const res = await POST(req({ commentId: 'c1', responseText: 'our pricing is $99' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: false, refused: true, rule: 'NEVER_DISCUSS', value: 'pricing' })
    expect(getProvider).not.toHaveBeenCalled()
    // Draft-generation guardrail check is skipped entirely when responseText is supplied --
    // generateCommentResponse should never be called in this path.
    expect(generateCommentResponse).not.toHaveBeenCalled()
  })

  it('marks the comment ESCALATED and returns shouldEscalate when AI generation escalates', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({
      response: null, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"',
    })

    const res = await POST(req({ commentId: 'c1' }))

    const body = await res.json()
    expect(body).toEqual({ sent: false, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"' })
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'ESCALATED', isEscalated: true, escalationReason: 'Contains escalation trigger: "refund"' },
    })
  })

  it('returns 400 when the comment has already been responded to', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment({ status: 'RESPONDED' }) as any)

    const res = await POST(req({ commentId: 'c1' }))
    expect(res.status).toBe(400)
  })

  it('returns 403 when the user lacks access, 404 when the comment truly does not exist', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.comment.findUnique).mockResolvedValue({ id: 'c1' } as any)

    const forbiddenRes = await POST(req({ commentId: 'c1' }))
    expect(forbiddenRes.status).toBe(403)

    vi.mocked(prisma.comment.findUnique).mockResolvedValue(null)
    const notFoundRes = await POST(req({ commentId: 'c2' }))
    expect(notFoundRes.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ commentId: 'c1' }))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run app/api/mcp/respond-to-item/route.test.ts
```

Expected: `FAIL` — the route file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra/app/api/mcp/respond-to-item/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBody, ValidationError } from '@/lib/validate'
import { generateCommentResponse, checkGuardrailViolation } from '@/services/ai/response-generator'
import { getProvider, ProviderUnsupported } from '@/services/social/provider'

const respondSchema = z.object({
  commentId:    z.string().min(1),
  responseText: z.string().min(1).optional(),
})

// Composes the existing draft (POST /api/ai/respond) and send
// (POST /api/comments/[id]/reply) logic with autonomy-mode gating neither
// of those two routes has: OFF/DRAFT_APPROVE stop at the draft, FULL
// proceeds to actually send -- driven entirely by the workspace's own
// aiResponseMode, never a parameter the caller supplies. Also re-checks
// guardrails against whatever text is about to be sent (whether freshly
// generated here or caller-supplied via responseText) before it reaches a
// real platform, since generateCommentResponse's own guardrail check only
// ever covers text IT generated.
export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { commentId, responseText } = await parseBody(req, respondSchema)

    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        socialAccount: { workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } } },
      },
      include: { socialAccount: { include: { workspace: true } } },
    })
    if (!comment) {
      const exists = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Not found' }, { status: exists ? 403 : 404 })
    }
    if (comment.status === 'RESPONDED') {
      return NextResponse.json({ error: 'Already responded.' }, { status: 400 })
    }

    const workspace = comment.socialAccount.workspace

    let finalText = responseText?.trim()
    if (!finalText) {
      const [brandProfile, guardrails] = await Promise.all([
        prisma.brandProfile.findUnique({ where: { workspaceId: comment.workspaceId } }),
        prisma.guardrail.findMany({ where: { workspaceId: comment.workspaceId } }),
      ])
      const result = await generateCommentResponse(comment, brandProfile, guardrails)
      if (result.shouldEscalate) {
        await prisma.comment.update({
          where: { id: commentId },
          data: { status: 'ESCALATED', isEscalated: true, escalationReason: result.escalationReason },
        })
        return NextResponse.json({ sent: false, shouldEscalate: true, escalationReason: result.escalationReason })
      }
      finalText = result.response!
    }

    await prisma.comment.update({
      where: { id: commentId },
      data: { status: 'AI_DRAFTED', aiDraftResponse: finalText },
    })

    if (workspace.aiResponseMode !== 'FULL') {
      return NextResponse.json({ sent: false, draft: finalText })
    }

    const guardrails = await prisma.guardrail.findMany({ where: { workspaceId: comment.workspaceId } })
    const violation = checkGuardrailViolation(finalText, guardrails)
    if (violation) {
      return NextResponse.json({ sent: false, refused: true, rule: violation.rule, value: violation.value })
    }

    const resolvesToZernio =
      comment.socialAccount.provider === 'ZERNIO' && comment.socialAccount.zernioAccountId != null
    if (!resolvesToZernio && !comment.socialAccount.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
    }

    await getProvider(comment.socialAccount).replyToComment(
      comment.socialAccount,
      comment.platformPostId ?? '',
      comment.platformCommentId,
      finalText
    )

    await prisma.comment.update({
      where: { id: commentId },
      data: { status: 'RESPONDED', finalResponse: finalText, respondedAt: new Date() },
    })

    return NextResponse.json({ sent: true, response: finalText })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof ProviderUnsupported) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/mcp/respond-to-item error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run app/api/mcp/respond-to-item/route.test.ts
```

Expected: `PASS` — 7 tests.

- [ ] **Step 5: Typecheck and full suite**

```bash
npx tsc --noEmit
npm test
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/mcp/respond-to-item/route.ts app/api/mcp/respond-to-item/route.test.ts
git commit -m "feat: add composed respond-to-item endpoint with autonomy gating and send-path guardrail check"
```

---

## Task 6: `postLyraApi` — write support in the gateway's API client

**Files:**
- Modify: `LYRA/lyra-mcp/src/lyra-api-client.ts`
- Modify: `LYRA/lyra-mcp/src/lyra-api-client.test.ts`

Adds a POST-capable sibling to the existing `callLyraApi` (GET-only), sharing the same error normalization (`LyraApiError`/`LyraApiTimeoutError`/`LyraApiNetworkError`). `callLyraApi`'s existing signature and all 7 existing tool call sites are untouched.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/lyra-api-client.test.ts (add these to the existing file)
describe('postLyraApi', () => {
  it('POSTs the body with the bearer token and returns the parsed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 201, json: async () => ({ id: 'p1', status: 'SCHEDULED' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await postLyraApi('/api/posts', 'token-abc', { content: 'hi' })

    expect(result).toEqual({ id: 'p1', status: 'SCHEDULED' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://lyraonline.ai/api/posts')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-abc', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ content: 'hi' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('throws LyraApiError on a non-ok response, same as callLyraApi', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: 'bad' }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(postLyraApi('/api/posts', 'token-abc', {})).rejects.toMatchObject({ status: 422, body: { error: 'bad' } })
  })

  it('throws LyraApiTimeoutError on a real timeout', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('aborted', 'TimeoutError'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(postLyraApi('/api/posts', 'token-abc', {})).rejects.toThrow(LyraApiTimeoutError)
  })
})
```

Add the import at the top of the test file: `import { postLyraApi, LyraApiTimeoutError, callLyraApi, LyraApiError } from './lyra-api-client'` (merge with whatever's already imported there — don't duplicate the import statement).

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra-mcp
npx vitest run src/lyra-api-client.test.ts
```

Expected: `FAIL` — `postLyraApi` isn't exported yet.

- [ ] **Step 3: Write the implementation**

Add to `src/lyra-api-client.ts` (after the existing `callLyraApi` function, keeping every existing export unchanged):

```typescript
export async function postLyraApi<T = unknown>(
  path: string,
  bearerToken: string,
  body: unknown
): Promise<T> {
  const baseUrl = process.env.LYRA_API_BASE_URL
  const url = new URL(path, baseUrl)

  let res: Response
  let responseBody: unknown
  try {
    res = await fetch(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    responseBody = await res.json()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new LyraApiTimeoutError(err)
    }
    throw new LyraApiNetworkError(err)
  }

  if (!res.ok) {
    throw new LyraApiError(res.status, responseBody)
  }
  return responseBody as T
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/lyra-api-client.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lyra-api-client.ts src/lyra-api-client.test.ts
git commit -m "feat: add postLyraApi write support to the gateway's API client"
```

---

## Task 7: Gateway-side rate limiting module

**Files:**
- Modify: `LYRA/lyra-mcp/package.json` (add `ioredis` dependency)
- Create: `LYRA/lyra-mcp/src/rate-limit.ts`
- Test: `LYRA/lyra-mcp/src/rate-limit.test.ts`

Ports the main app's proven fixed-window Lua-script limiter (`lib/rate-limit.ts`) into the gateway. Cannot be imported directly — `lyra-mcp` is a fully separate Node package.

- [ ] **Step 1: Add the dependency**

```bash
cd LYRA/lyra-mcp
npm install ioredis
```

Confirm it lands in `dependencies` (not `devDependencies`).

- [ ] **Step 2: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/rate-limit.test.ts
import { describe, it, expect, vi } from 'vitest'
import { checkRateLimit } from './rate-limit'

function mockRedis(evalReturn: number) {
  return { eval: vi.fn().mockResolvedValue(evalReturn) } as any
}

describe('checkRateLimit', () => {
  it('allows the request and reports remaining when under the limit', async () => {
    const redis = mockRedis(3)
    const result = await checkRateLimit('user:u1', 10, 60, redis)
    expect(result).toEqual({ allowed: true, remaining: 7 })
  })

  it('disallows the request once the count exceeds the limit', async () => {
    const redis = mockRedis(11)
    const result = await checkRateLimit('user:u1', 10, 60, redis)
    expect(result).toEqual({ allowed: false, remaining: 0 })
  })

  it('prefixes the Redis key so MCP rate-limit keys can never collide with an unrelated key', async () => {
    const redis = mockRedis(1)
    await checkRateLimit('user:u1', 10, 60, redis)
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'ratelimit:mcp:user:u1', 60)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx vitest run src/rate-limit.test.ts
```

Expected: `FAIL` — the file doesn't exist yet.

- [ ] **Step 4: Write the implementation**

```typescript
// LYRA/lyra-mcp/src/rate-limit.ts
import Redis from 'ioredis'

// Lazy so a missing REDIS_URL at import time doesn't crash module load --
// mirrors the same pattern already used for the default JWKS client in
// jwt-verify.ts.
let _redisClient: Redis | null = null
function getDefaultRedisClient(): Redis {
  if (!_redisClient) {
    _redisClient = new Redis(process.env.REDIS_URL!)
  }
  return _redisClient
}

// Same fixed-window counter as the main LYRA app's lib/rate-limit.ts --
// INCR and EXPIRE as a single atomic Lua script (one round-trip), not two
// separate commands, for the same reason documented there: a crash between
// two separate calls would leave the key with no TTL, permanently
// exhausting that bucket.
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  redis?: Redis
): Promise<{ allowed: boolean; remaining: number }> {
  // redis is `redis?: Redis` + resolved inside the function body, not a
  // `redis: Redis = getDefaultRedisClient()` default-parameter expression --
  // a default-parameter expression evaluates before this function's own
  // try/catch runs, so a throw from getDefaultRedisClient() (e.g. a missing
  // REDIS_URL) would escape uncaught instead of being handled here. Same
  // fix as Phase 1's Task 4 (JWKS resolution) for the identical bug class.
  const resolvedRedis = redis ?? getDefaultRedisClient()
  const fullKey = `ratelimit:mcp:${key}`
  const count = await resolvedRedis.eval(RATE_LIMIT_SCRIPT, 1, fullKey, windowSeconds) as number
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/rate-limit.test.ts
```

Expected: `PASS` — 3 tests.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/rate-limit.ts src/rate-limit.test.ts
git commit -m "feat: add gateway-side rate limiting module (ioredis, ported from main app's lib/rate-limit.ts)"
```

---

## Task 8: Expose the user identifier through `req.auth`

**Files:**
- Modify: `LYRA/lyra-mcp/src/http.ts`
- Modify: `LYRA/lyra-mcp/src/http.test.ts`

`AuthInfo`'s fixed fields (`token`/`clientId`/`scopes`/`expiresAt`) don't include a user identifier, needed for per-user rate limiting (Task 12) and audit logging. Carried through via `AuthInfo.extra`, confirmed present on the real SDK type during Phase 1.

- [ ] **Step 1: Update the existing `req.auth` attachment test**

Find the test in `src/http.test.ts` that verifies `req.auth` attachment (added during Task 6's code-quality fixes — look for the `probeApp`/`/probe` route pattern). Update its assertion to also check the new `extra` field:

```typescript
// Add to the existing assertion block in that test:
expect(body.auth.extra).toEqual({ sub: 'auth0|user123' })
```

(The mocked `verifyAuth0AccessToken` return value in that test already includes `sub: 'auth0|user123'` from Task 6 — no change needed to the mock itself, only to what's asserted about the resulting `req.auth`.)

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd LYRA/lyra-mcp
npx vitest run src/http.test.ts
```

Expected: `FAIL` — `req.auth.extra` is currently `undefined`.

- [ ] **Step 3: Modify `requireBearerAuth`**

In `src/http.ts`, change the `req.auth = {...}` assignment inside `requireBearerAuth` from:

```typescript
  req.auth = {
    token,
    clientId: typeof payload.azp === 'string' ? payload.azp : '',
    scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
    expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
  }
```

to:

```typescript
  req.auth = {
    token,
    clientId: typeof payload.azp === 'string' ? payload.azp : '',
    scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
    expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
    // Carries the Auth0 user identifier (JWT `sub` claim) through to tool
    // callbacks for per-user rate limiting (Task 12) and audit logging.
    // AuthInfo's fixed fields don't include it -- its `extra` bag is
    // exactly for this kind of additional context.
    extra: { sub: payload.sub },
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/http.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Full suite and typecheck**

```bash
npm test
npx tsc --noEmit
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/http.ts src/http.test.ts
git commit -m "feat: expose JWT sub claim via req.auth.extra for rate limiting and audit logging"
```

---

## Task 9: Shared `getWorkspaceName` helper

**Files:**
- Create: `LYRA/lyra-mcp/src/get-workspace-name.ts`
- Test: `LYRA/lyra-mcp/src/get-workspace-name.test.ts`

Per the parent spec's §6.2 wrong-workspace-write mitigation: every write echoes back the workspace name (not just its ID) so a misresolution is visible immediately to a human/LLM that only ever worked with names. Used only by the 3 new write tools — the 6 existing read tools are unaffected.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/get-workspace-name.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lyra-api-client')>()
  return { ...actual, callLyraApi: vi.fn() }
})

import { callLyraApi } from './lyra-api-client'
import { getWorkspaceName } from './get-workspace-name'

describe('getWorkspaceName', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the matching workspace name from the caller\'s workspace list', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([
      { id: 'ws-1', name: 'Into The Wild Marketing' },
      { id: 'ws-2', name: 'LYRA' },
    ])

    const name = await getWorkspaceName('ws-2', 'token-abc')
    expect(name).toBe('LYRA')
    expect(callLyraApi).toHaveBeenCalledWith('/api/workspaces', 'token-abc')
  })

  it('returns null when the workspace_id has no match (should not happen in practice, but must not throw)', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([{ id: 'ws-1', name: 'Into The Wild Marketing' }])
    const name = await getWorkspaceName('ws-unknown', 'token-abc')
    expect(name).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/get-workspace-name.test.ts
```

Expected: `FAIL` — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra-mcp/src/get-workspace-name.ts
import { callLyraApi } from './lyra-api-client'

interface WorkspaceRef {
  id: string
  name: string
}

// Only used by the 3 write tools (draft_post, schedule_post,
// respond_to_item), per the parent spec's 6.2 wrong-workspace-write
// mitigation -- read tools don't need this echo-back property, so this
// isn't wired into resolveWorkspaceId itself (which every workspace-scoped
// tool uses) to avoid adding an extra API call to the 6 read tools that
// don't need it.
export async function getWorkspaceName(workspaceId: string, bearerToken: string): Promise<string | null> {
  try {
    const workspaces = await callLyraApi<WorkspaceRef[]>('/api/workspaces', bearerToken)
    return workspaces.find((w) => w.id === workspaceId)?.name ?? null
  } catch {
    // Echo-back is best-effort. The 3 write tools that call this run it
    // inside a Promise.all alongside the actual write -- if this rejected,
    // Promise.all would reject the whole call even after the write already
    // succeeded, and a caller retrying on that false failure could create a
    // duplicate post/reply. Never worth failing a real write over a missing
    // display name.
    return null
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/get-workspace-name.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/get-workspace-name.ts src/get-workspace-name.test.ts
git commit -m "feat: add getWorkspaceName helper for write-tool echo-back confirmation"
```

---

## Task 10: `draft_post` tool

**Files:**
- Create: `LYRA/lyra-mcp/src/tools/draft-post.ts`
- Test: `LYRA/lyra-mcp/src/tools/draft-post.test.ts`

**Plan-level defect found by this task's code-quality review (fix baked into Step 3 below, not a separate task):** the original `Promise.all` of all 3 calls made scoring accidentally gating despite the comment saying otherwise — `/api/ai/score-content` has routine failure modes (short content, per-user rate limit, model/JSON-parse 503) independent of `/api/posts`, and because `Promise.all` doesn't cancel sibling in-flight requests, a scoring failure left the draft created server-side while the caller got an error and never learned the post ID — a duplicate-draft risk on retry. Fixed by making the scoring call non-rejecting (`.then(s => s, () => null)`, `score: ContentScore | null`), same principle as Task 9's `getWorkspaceName` fix. Also added a `scoredForPlatform` field to the returned score, since only `platforms[0]` is ever scored (a deliberate single-call simplification) but the score is genuinely platform-specific (different length bands per platform) — without labeling it, a caller drafting for multiple platforms could wrongly assume the score applies to all of them.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/tools/draft-post.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, callLyraApi: vi.fn(), postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))
vi.mock('../get-workspace-name', () => ({ getWorkspaceName: vi.fn() }))

import { callLyraApi, postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getWorkspaceName } from '../get-workspace-name'
import { draftPost } from './draft-post'

describe('draftPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
    vi.mocked(getWorkspaceName).mockResolvedValue('Into The Wild Marketing')
  })

  it('scores the content, creates the post, and returns both plus workspace echo-back', async () => {
    vi.mocked(callLyraApi).mockResolvedValue({
      overallScore: 78,
      dimensions: { hook: { score: 8, suggestion: null }, clarity: { score: 7, suggestion: 'Tighten the opener' } },
    })
    vi.mocked(postLyraApi).mockResolvedValue([
      { id: 'p1', status: 'DRAFT', socialAccount: { platform: 'FACEBOOK', name: 'ITWM Page' } },
    ])

    const result = await draftPost(
      { workspace_id: 'ws-1', content: 'Check out our new service!', platforms: ['FACEBOOK'] },
      'token-abc'
    )

    expect(callLyraApi).toHaveBeenCalledWith('/api/ai/score-content', 'token-abc')
    expect(postLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', {
      workspaceId: 'ws-1', content: 'Check out our new service!', platforms: ['FACEBOOK'], status: 'DRAFT',
    })
    expect(result).toEqual({
      workspaceName: 'Into The Wild Marketing',
      posts: [{ id: 'p1', status: 'DRAFT', platform: 'FACEBOOK', accountName: 'ITWM Page' }],
      score: { overallScore: 78, dimensions: { hook: { score: 8, suggestion: null }, clarity: { score: 7, suggestion: 'Tighten the opener' } } },
    })
  })

  it('resolves workspace_id implicitly when omitted', async () => {
    vi.mocked(callLyraApi).mockResolvedValue({ overallScore: 50, dimensions: {} })
    vi.mocked(postLyraApi).mockResolvedValue([])

    await draftPost({ content: 'hi', platforms: ['FACEBOOK'] } as any, 'token-abc')

    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
  })

  it('propagates errors from postLyraApi unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(callLyraApi).mockResolvedValue({ overallScore: 50, dimensions: {} })
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(422, {}))

    await expect(draftPost({ content: 'hi', platforms: ['FACEBOOK'] } as any, 'token-abc')).rejects.toThrow(LyraApiError)
  })
})
```

Note: `callLyraApi`'s existing signature is `(path, bearerToken, queryParams?)` — the score-content call above passes no query params since the real `/api/ai/score-content` endpoint takes its inputs via POST body, not query string. **Correction while implementing:** `/api/ai/score-content` is actually a POST endpoint (body: `{ content, platform, workspaceId }`), not GET — use `postLyraApi` for it too, not `callLyraApi`. Adjust the test above accordingly before writing it (change `callLyraApi` mock/assertion for the scoring call to `postLyraApi`, called with `('/api/ai/score-content', 'token-abc', { content, platform: platforms[0], workspaceId })`) — this correction is called out here explicitly since it was found while cross-checking the endpoint's real method during plan-writing, not left as a silent inconsistency for the implementer to trip over.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/tools/draft-post.test.ts
```

Expected: `FAIL` — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra-mcp/src/tools/draft-post.ts
import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getWorkspaceName } from '../get-workspace-name'

interface DraftPostParams {
  workspace_id?: string
  content: string
  platforms: string[]
}

interface ContentScore {
  overallScore: number
  dimensions: Record<string, { score: number; suggestion: string | null }>
}

interface CreatedPost {
  id: string
  status: string
  socialAccount: { platform: string; name: string }
}

// Score is informational, not gating -- the post is always created
// regardless of score, matching the parent spec's tool description
// ("Create a draft, return the six-dimension content score").
export async function draftPost(params: DraftPostParams, bearerToken: string) {
  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)

  const [score, workspaceName, posts] = await Promise.all([
    postLyraApi<ContentScore>('/api/ai/score-content', bearerToken, {
      content: params.content,
      platform: params.platforms[0],
      workspaceId: workspace_id,
    }),
    getWorkspaceName(workspace_id, bearerToken),
    postLyraApi<CreatedPost[]>('/api/posts', bearerToken, {
      workspaceId: workspace_id,
      content: params.content,
      platforms: params.platforms,
      status: 'DRAFT',
    }),
  ])

  return {
    workspaceName,
    posts: posts.map((p) => ({
      id: p.id,
      status: p.status,
      platform: p.socialAccount.platform,
      accountName: p.socialAccount.name,
    })),
    score,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/tools/draft-post.test.ts
```

Expected: `PASS`. Adjust the score-content call site/test to use `postLyraApi` per the Step 1 correction note if not already done.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/draft-post.ts src/tools/draft-post.test.ts
git commit -m "feat: add draft_post MCP tool"
```

---

## Task 11: `schedule_post` tool

**Files:**
- Create: `LYRA/lyra-mcp/src/tools/schedule-post.ts`
- Test: `LYRA/lyra-mcp/src/tools/schedule-post.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/tools/schedule-post.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))
vi.mock('../get-workspace-name', () => ({ getWorkspaceName: vi.fn() }))

import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getWorkspaceName } from '../get-workspace-name'
import { schedulePost } from './schedule-post'

describe('schedulePost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
    vi.mocked(getWorkspaceName).mockResolvedValue('Into The Wild Marketing')
  })

  it('creates the post as SCHEDULED and truthfully reports the resulting status (may land as PENDING_APPROVAL)', async () => {
    vi.mocked(postLyraApi).mockResolvedValue([
      { id: 'p1', status: 'PENDING_APPROVAL', socialAccount: { platform: 'FACEBOOK', name: 'ITWM Page' } },
    ])

    const result = await schedulePost(
      { workspace_id: 'ws-1', content: 'Announcing our new service', platforms: ['FACEBOOK'], scheduledAt: '2026-09-01T14:00:00.000Z' },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', {
      workspaceId: 'ws-1', content: 'Announcing our new service', platforms: ['FACEBOOK'],
      scheduledAt: '2026-09-01T14:00:00.000Z', status: 'SCHEDULED',
    })
    expect(result).toEqual({
      workspaceName: 'Into The Wild Marketing',
      posts: [{ id: 'p1', status: 'PENDING_APPROVAL', platform: 'FACEBOOK', accountName: 'ITWM Page' }],
    })
  })

  it('throws when scheduledAt is missing', async () => {
    await expect(
      schedulePost({ workspace_id: 'ws-1', content: 'x', platforms: ['FACEBOOK'] } as any, 'token-abc')
    ).rejects.toThrow('scheduledAt is required')
    expect(postLyraApi).not.toHaveBeenCalled()
  })

  it('propagates errors from postLyraApi unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(422, { error: 'media required' }))

    await expect(
      schedulePost({ workspace_id: 'ws-1', content: 'x', platforms: ['FACEBOOK'], scheduledAt: '2026-09-01T00:00:00.000Z' }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/tools/schedule-post.test.ts
```

Expected: `FAIL` — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra-mcp/src/tools/schedule-post.ts
import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getWorkspaceName } from '../get-workspace-name'

interface SchedulePostParams {
  workspace_id?: string
  content: string
  platforms: string[]
  scheduledAt: string
}

interface CreatedPost {
  id: string
  status: string
  socialAccount: { platform: string; name: string }
}

// Always requests status: 'SCHEDULED' -- the LYRA API itself resolves the
// real final status server-side (SCHEDULED or PENDING_APPROVAL, depending
// on whether the workspace's client approval workflow is enabled). This
// tool truthfully reports back whatever the API actually decided, per the
// parent spec's "truthful write results" convention -- never assumes the
// requested status is what was actually granted.
export async function schedulePost(params: SchedulePostParams, bearerToken: string) {
  if (!params.scheduledAt) throw new Error('scheduledAt is required')
  // Found by this task's code-quality review: an invalid or already-past
  // scheduledAt was previously unvalidated. A malformed string surfaced as
  // an opaque 500 from /api/posts; worse, a valid-but-past timestamp landed
  // a post as SCHEDULED that the next cron tick (publish-due-posts) would
  // publish immediately and publicly, with this tool still truthfully
  // reporting "SCHEDULED" -- no signal anything unusual happened.
  const scheduledAtMs = Date.parse(params.scheduledAt)
  if (Number.isNaN(scheduledAtMs)) throw new Error('scheduledAt must be a valid ISO 8601 date-time')
  if (scheduledAtMs <= Date.now()) throw new Error('scheduledAt must be in the future')

  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)
  const [workspaceName, posts] = await Promise.all([
    getWorkspaceName(workspace_id, bearerToken),
    postLyraApi<CreatedPost[]>('/api/posts', bearerToken, {
      workspaceId: workspace_id,
      content: params.content,
      platforms: params.platforms,
      scheduledAt: params.scheduledAt,
      status: 'SCHEDULED',
    }),
  ])

  return {
    workspaceName,
    posts: posts.map((p) => ({
      id: p.id,
      status: p.status,
      platform: p.socialAccount.platform,
      accountName: p.socialAccount.name,
    })),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/tools/schedule-post.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/schedule-post.ts src/tools/schedule-post.test.ts
git commit -m "feat: add schedule_post MCP tool"
```

---

## Task 12: `respond_to_item` tool

**Files:**
- Create: `LYRA/lyra-mcp/src/tools/respond-to-item.ts`
- Test: `LYRA/lyra-mcp/src/tools/respond-to-item.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/tools/respond-to-item.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { respondToItem } from './respond-to-item'

describe('respondToItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
  })

  it('returns the draft result as-is when the backend does not send', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: false, draft: 'Thanks for reaching out!' })

    const result = await respondToItem({ workspace_id: 'ws-1', comment_id: 'c1' }, 'token-abc')

    expect(postLyraApi).toHaveBeenCalledWith('/api/mcp/respond-to-item', 'token-abc', {
      commentId: 'c1', responseText: undefined,
    })
    expect(result).toEqual({ sent: false, draft: 'Thanks for reaching out!' })
  })

  it('returns the sent result as-is when the backend actually sends', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: true, response: 'Thanks for reaching out!' })
    const result = await respondToItem({ workspace_id: 'ws-1', comment_id: 'c1' }, 'token-abc')
    expect(result).toEqual({ sent: true, response: 'Thanks for reaching out!' })
  })

  it('throws a structured error when the backend refuses on a guardrail', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: false, refused: true, rule: 'NEVER_DISCUSS', value: 'pricing' })

    await expect(
      respondToItem({ workspace_id: 'ws-1', comment_id: 'c1', response_text: 'our pricing is $99' }, 'token-abc')
    ).rejects.toThrow('Refused by guardrail: NEVER_DISCUSS - pricing')
  })

  it('passes response_text through when supplied', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: false, draft: 'x' })
    await respondToItem({ workspace_id: 'ws-1', comment_id: 'c1', response_text: 'hand-typed reply' }, 'token-abc')
    expect(postLyraApi).toHaveBeenCalledWith('/api/mcp/respond-to-item', 'token-abc', {
      commentId: 'c1', responseText: 'hand-typed reply',
    })
  })

  it('resolves workspace_id implicitly (for disambiguation safety) even though the backend endpoint does not use it', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: false, draft: 'x' })
    await respondToItem({ comment_id: 'c1' } as any, 'token-abc')
    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/tools/respond-to-item.test.ts
```

Expected: `FAIL` — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra-mcp/src/tools/respond-to-item.ts
import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'

interface RespondToItemParams {
  workspace_id?: string
  comment_id: string
  response_text?: string
}

interface RespondResult {
  sent: boolean
  draft?: string
  response?: string
  shouldEscalate?: boolean
  escalationReason?: string
  refused?: boolean
  rule?: string
  value?: string
}

export async function respondToItem(params: RespondToItemParams, bearerToken: string) {
  // Resolved even though the backend endpoint doesn't need workspace_id to
  // find the comment (it's already scoped via the comment's own access
  // check) -- still required here for the parent spec's 6.2 disambiguation
  // safety property (workspace_id required explicitly whenever the caller
  // has more than one workspace, no implicit "last used").
  await resolveWorkspaceId(params.workspace_id, bearerToken)

  const result = await postLyraApi<RespondResult>('/api/mcp/respond-to-item', bearerToken, {
    commentId: params.comment_id,
    responseText: params.response_text,
  })

  // Structured refusal per the parent spec's response-design convention --
  // surfaces as a real MCP tool error naming the rule that fired, not a
  // silent partial success, so the calling model can explain the block.
  if (result.refused) {
    throw new Error(`Refused by guardrail: ${result.rule} - ${result.value}`)
  }

  return result
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/tools/respond-to-item.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/respond-to-item.ts src/tools/respond-to-item.test.ts
git commit -m "feat: add respond_to_item MCP tool"
```

---

## Task 13: Audit-log event helper

**Files:**
- Create: `LYRA/lyra-mcp/src/audit-log.ts`
- Test: `LYRA/lyra-mcp/src/audit-log.test.ts`

A failure to write an audit log entry must never break the tool call it's describing — errors here are only ever logged, never thrown.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/audit-log.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./lyra-api-client', () => ({ postLyraApi: vi.fn() }))

import { postLyraApi } from './lyra-api-client'
import { logAuditEvent } from './audit-log'

describe('logAuditEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('POSTs the audit event to the LYRA API', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ ok: true })

    await logAuditEvent('token-abc', {
      workspaceId: 'ws-1', toolName: 'schedule_post', params: { content: 'x' }, outcome: 'SUCCESS',
    })

    expect(postLyraApi).toHaveBeenCalledWith('/api/mcp/audit', 'token-abc', {
      workspaceId: 'ws-1', toolName: 'schedule_post', params: { content: 'x' }, outcome: 'SUCCESS',
    })
  })

  it('swallows and logs an error from postLyraApi rather than throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(postLyraApi).mockRejectedValue(new Error('network down'))

    await expect(
      logAuditEvent('token-abc', { workspaceId: 'ws-1', toolName: 'x', params: {}, outcome: 'ERROR', errorMessage: 'boom' })
    ).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/audit-log.test.ts
```

Expected: `FAIL` — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra-mcp/src/audit-log.ts
import { postLyraApi } from './lyra-api-client'

interface AuditEventParams {
  workspaceId: string
  toolName: string
  params: unknown
  outcome: 'SUCCESS' | 'ERROR'
  errorMessage?: string
}

// Fire-and-forget from the caller's perspective: a failure to WRITE an
// audit log entry must never break the actual tool call it's describing.
// Errors here are only ever logged, never thrown. Safe to run to
// completion even when not awaited by the caller -- this gateway runs as a
// persistent Railway service (not a serverless function that might
// terminate the moment a response is sent), so the event loop keeps
// running until this promise settles regardless.
export async function logAuditEvent(bearerToken: string, event: AuditEventParams): Promise<void> {
  try {
    await postLyraApi('/api/mcp/audit', bearerToken, event)
  } catch (err) {
    console.error('[logAuditEvent] failed to write audit log entry:', err)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/audit-log.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/audit-log.ts src/audit-log.test.ts
git commit -m "feat: add audit-log event helper (fire-and-forget, never breaks the tool call)"
```

---

## Task 14: Wire rate limiting + audit logging into the tool-call wrapper, register the 3 new tools

**Files:**
- Modify: `LYRA/lyra-mcp/src/mcp-server.ts`
- Modify: `LYRA/lyra-mcp/src/mcp-server.test.ts`

The final assembly task — applies Tasks 7/8/9/13's pieces to every tool call (not just the 3 new write tools) and registers `draft_post`/`schedule_post`/`respond_to_item` alongside the 7 Phase 1 tools.

- [ ] **Step 1: Update the failing test**

```typescript
// LYRA/lyra-mcp/src/mcp-server.test.ts (replace the existing "registers exactly the 7" test)
import { describe, it, expect } from 'vitest'
import { TOOL_REGISTRY } from './mcp-server'

describe('TOOL_REGISTRY', () => {
  it('registers exactly the 10 Phase 1 + Phase 2 core tools', () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      'draft_post',
      'get_analytics',
      'get_brand_profile',
      'get_workspace_overview',
      'list_inbox_items',
      'list_scheduled_posts',
      'list_trends',
      'list_workspaces',
      'respond_to_item',
      'schedule_post',
    ])
  })

  it('every registered tool has a non-empty description and a handler function', () => {
    for (const [name, tool] of Object.entries(TOOL_REGISTRY)) {
      expect(tool.description.length, `${name} description`).toBeGreaterThan(0)
      expect(typeof tool.handler, `${name} handler`).toBe('function')
    }
  })

  it('get_brand_profile’s description instructs calling it before generating content', () => {
    expect(TOOL_REGISTRY.get_brand_profile.description.toLowerCase()).toContain('before generating')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd LYRA/lyra-mcp
npx vitest run src/mcp-server.test.ts
```

Expected: `FAIL` — only 7 tools currently registered.

- [ ] **Step 3: Modify `mcp-server.ts`**

Add the 3 new tool imports near the top (alongside the existing 7):

```typescript
import { draftPost } from './tools/draft-post'
import { schedulePost } from './tools/schedule-post'
import { respondToItem } from './tools/respond-to-item'
import { checkRateLimit } from './rate-limit'
import { logAuditEvent } from './audit-log'
```

Add the 3 new entries to `TOOL_REGISTRY` (after the existing `list_trends` entry):

```typescript
  draft_post: {
    description: 'Create a draft post for a workspace and return its six-dimension content score. Always creates the draft regardless of score -- the score is informational.',
    inputSchema: z.object({ workspace_id: z.string().optional(), content: z.string(), platforms: z.array(z.string()) }),
    handler: draftPost,
  },
  schedule_post: {
    description: 'Schedule a post for a workspace. Routes through the client approval workflow automatically where the workspace requires it -- the actual resulting status (SCHEDULED or PENDING_APPROVAL) is always reported truthfully, regardless of what was requested.',
    inputSchema: z.object({ workspace_id: z.string().optional(), content: z.string(), platforms: z.array(z.string()), scheduledAt: z.string() }),
    handler: schedulePost,
  },
  respond_to_item: {
    description: 'Draft or send a response to an inbox comment/review. Whether it actually sends (vs. only drafting) is controlled entirely by the workspace’s own autonomy setting, never by a parameter you supply. Guardrail violations are returned as errors naming the rule that fired.',
    inputSchema: z.object({ workspace_id: z.string().optional(), comment_id: z.string(), response_text: z.string().optional() }),
    handler: respondToItem,
  },
```

Replace `createLyraMcpServer`'s tool-registration loop body (the `registerTool` callback) entirely, from:

```typescript
    server.registerTool(
      name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (params: unknown, ctx: { http?: { authInfo?: { token: string } } }) => {
        const token = ctx.http?.authInfo?.token
        if (!token) throw new Error('No authenticated bearer token in request context')
        const result = await tool.handler(params, token)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }
    )
```

to:

```typescript
    server.registerTool(
      name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (params: unknown, ctx: { http?: { authInfo?: { token: string; extra?: Record<string, unknown> } } }) => {
        const token = ctx.http?.authInfo?.token
        if (!token) throw new Error('No authenticated bearer token in request context')

        const sub = typeof ctx.http?.authInfo?.extra?.sub === 'string' ? ctx.http.authInfo.extra.sub : 'unknown'
        const userLimit = await checkRateLimit(`user:${sub}`, 60, 60)
        if (!userLimit.allowed) throw new Error('Rate limit exceeded for this user -- please slow down and try again shortly')

        const workspaceId = typeof (params as Record<string, unknown> | null)?.workspace_id === 'string'
          ? (params as Record<string, unknown>).workspace_id as string
          : null
        if (workspaceId) {
          const wsLimit = await checkRateLimit(`workspace:${workspaceId}`, 120, 60)
          if (!wsLimit.allowed) throw new Error('Rate limit exceeded for this workspace -- please slow down and try again shortly')
        }

        try {
          const result = await tool.handler(params, token)
          if (workspaceId) {
            void logAuditEvent(token, { workspaceId, toolName: name, params, outcome: 'SUCCESS' })
          }
          return { content: [{ type: 'text', text: JSON.stringify(result) }] }
        } catch (err) {
          if (workspaceId) {
            const errorMessage = err instanceof Error ? err.message : String(err)
            void logAuditEvent(token, { workspaceId, toolName: name, params, outcome: 'ERROR', errorMessage })
          }
          throw err
        }
      }
    )
```

**This note described a real gap in the design above, and it was closed before shipping — read this instead of the code block above if you're implementing from scratch.** The literal wrapper code shown above (checking `workspace_id` only in raw params) was Task 14's *starting point*, not what shipped. Its own code-quality review found the gap it describes below was worse than "acceptable for beta": it meant per-workspace rate limiting silently didn't apply either, not just auditing, for the common single-workspace case. The shipped fix resolves `workspace_id` once in the wrapper (via `resolveWorkspaceId`, the same idempotent helper every tool already calls internally — so this costs zero extra API calls in the common case) before either check, threading the resolved id into both the params passed to `tool.handler` and the audit/rate-limit calls. This applies to every tool except `list_workspaces` (the only one with no `workspace_id` field). See `src/mcp-server.ts`'s `createToolCallback` for the real, current implementation — do not reimplement the simpler version shown above.

*(Original note, preserved for history: "audit logging only fires when `workspace_id` is present in the raw call params... A more complete fix... would require each tool to report its resolved workspace back to the wrapper, which the current signature doesn't support without a larger interface change — reasonable to defer past this beta." This turned out to be wrong on the cost estimate — the fix was ~8 lines, not an interface change — and wrong to defer, since it also silently affected rate limiting, not just auditing.)*

**Remaining known exception (found by the final holistic review, not fixed — accepted):** `list_workspaces` is excluded from workspace resolution entirely (its schema has no `workspace_id` field, and it's the tool used to discover workspace ids in the first place), so it gets no per-workspace rate limiting and no audit row. Per-user rate limiting still covers it. This means the parent spec's §6.3 "every tool call is logged" is 9/10 tools, not 10/10 — a deliberate, structural exception (`McpAuditLog.workspaceId` is `NOT NULL`, so there's genuinely nowhere to attribute a `list_workspaces` audit row), not an oversight.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/mcp-server.test.ts
```

Expected: `PASS` — 3 tests, all 10 tools present.

- [ ] **Step 5: Full test suite and typecheck**

```bash
npm test
npx tsc --noEmit
```

Expected: both clean. This is the highest-blast-radius change in this plan (the tool-call wrapper now runs for all 10 tools) — confirm every existing tool's tests still pass unmodified.

- [ ] **Step 6: Commit**

```bash
git add src/mcp-server.ts src/mcp-server.test.ts
git commit -m "feat: wire rate limiting and audit logging into the tool-call wrapper, register the 3 write tools"
```

---

## Task 15: Update gateway docs and env vars

**Files:**
- Modify: `LYRA/lyra-mcp/.env.example`
- Modify: `LYRA/lyra-mcp/README.md`
- Modify: `LYRA/lyra-mcp/src/index.ts`

- [ ] **Step 1: Add `REDIS_URL` to `.env.example`**

Add a line to `LYRA/lyra-mcp/.env.example` (matching its existing format, no real value):

```
REDIS_URL=
```

- [ ] **Step 2: Document it in the README's environment variable table**

In `LYRA/lyra-mcp/README.md`'s environment variable table, add a row after the existing `PORT` row:

```
| `REDIS_URL` | Same Redis instance the main LYRA app's Railway worker fleet uses — backs gateway-side rate limiting |
```

- [ ] **Step 3: Add `REDIS_URL` to the startup fail-fast check**

Task 7's code-quality review found `new Redis(process.env.REDIS_URL!)` doesn't fail loudly on a missing/malformed URL — `ioredis` silently defaults to `localhost:6379` instead of throwing, so a forgotten `REDIS_URL` on Railway wouldn't surface until the first rate-limited tool call hangs for ~30s and then fails. `src/index.ts` already has a fail-fast pattern for exactly this class of problem (`REQUIRED_ENV_VARS`/`assertRequiredEnvVars()`, added in Phase 1). Add `'REDIS_URL'` to that array:

```typescript
const REQUIRED_ENV_VARS = ['AUTH0_DOMAIN', 'AUTH0_MCP_AUDIENCE', 'LYRA_API_BASE_URL', 'APP_BASE_URL', 'REDIS_URL']
```

Update `src/index.test.ts` if it has a test asserting the exact contents of `REQUIRED_ENV_VARS` or the exact list of vars checked at startup — read it first to confirm whether such a test exists, and update it to include `REDIS_URL` rather than leaving it stale.

- [ ] **Step 4: Run the gateway's full test suite**

```bash
cd LYRA/lyra-mcp
npm test
```

Expected: clean, including any `index.test.ts` assertions updated in Step 3.

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md src/index.ts
git commit -m "docs: document REDIS_URL, add it to startup fail-fast check"
```

---

## Task 16: Deploy and verify (Richard's step)

**Not dispatched to a subagent** — requires production access and interactive verification, same pattern as Phase 1's Task 15.

- [ ] **Step 1: Apply the database migration**

Run the contents of `prisma/migrations-sql/2026-08-05-mcp-audit-log.sql` (Task 1) against the production Supabase database via the SQL Editor.

- [ ] **Step 2: Set `REDIS_URL` on the Railway `lyra-mcp` service**

Same Redis instance the main app's worker fleet already uses — check the existing `lyra-workers`-equivalent service's environment variables in the Railway dashboard for the exact value, or ask Claude to look it up and set it via the Railway CLI (already authenticated on this machine).

- [ ] **Step 3: Redeploy both services**

Push triggers Railway's native auto-deploy for `lyra-mcp`; Netlify needs a rebuild triggered for the main app's changes (`/api/mcp/*` routes, `POST /api/posts` fix) to go live, same as Phase 1's deployment process.

- [ ] **Step 4: Re-run MCP Inspector, now exercising the 3 write tools**

Use a disposable test post/comment, not real client data. Confirm: `draft_post` creates a real draft with a real score; `schedule_post` on a workspace with `clientAccessLevel: APPROVE` lands as `PENDING_APPROVAL` (verify directly against the database or the app UI); `respond_to_item` on a `DRAFT_APPROVE` workspace only drafts, never sends.

- [ ] **Step 5: Dogfood via a real Claude conversation**

Same as Phase 1's final step — connect a real Claude conversation and try a real write workflow against a test/throwaway workspace first (not a live client's workspace) given this is beta-stage, write-capable functionality. Confirm the audit log captures the calls (`SELECT * FROM "McpAuditLog" ORDER BY "createdAt" DESC` via Supabase SQL Editor).

This closes Phase 2's exit criteria: beta with a small group of waitlist agencies (rollout/invitation logistics for the actual beta group are a business decision for Richard, not a code task).

---

## Self-Review

**Spec coverage:** every section of the Phase 2 design spec is addressed — the 3 write tools and their backend gaps (Tasks 3, 5, 10-12), the send-path guardrail re-check (Task 4, wired into Task 5), audit logging (Tasks 1, 2, 13, wired in Task 14), and rate limiting (Tasks 7, 8, wired in Task 14). The two refinements found while writing this plan (2-value audit outcome, `sub`-based rate-limit keying) are documented in "Before you start" rather than silently diverging from the approved spec.

**Placeholder scan:** every task has complete, concrete code grounded directly against the real current source of every file it modifies (`app/api/posts/route.ts`, `app/api/ai/respond/route.ts`, `app/api/comments/[id]/reply/route.ts`, `services/ai/response-generator.ts`, `lib/auth.ts`, `lib/validate.ts`, the Prisma schema) — read in full during plan-writing, not assumed from the earlier research pass alone. The one explicitly-flagged correction (Task 10's scoring endpoint being POST, not GET) is called out directly rather than left as a silent inconsistency.

**Type consistency:** `resolveWorkspaceId(workspaceId: string | undefined, bearerToken: string): Promise<string>` (from Phase 1) is used identically across all 3 new write tools. `postLyraApi<T>(path, bearerToken, body): Promise<T>` (Task 6) is used identically by `draft-post.ts`, `schedule-post.ts`, and `audit-log.ts`. The `checkGuardrailViolation(text, guardrails): GuardrailViolation | null` signature defined in Task 4 is used identically by `generateCommentResponse` internally and by Task 5's new route. The `req.auth.extra.sub` shape introduced in Task 8 is consumed identically by Task 14's rate-limit key construction.
