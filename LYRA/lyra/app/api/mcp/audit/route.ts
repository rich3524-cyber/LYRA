import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import { parseBody, ValidationError } from '@/lib/validate'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const auditSchema = z.object({
  workspaceId:  z.string().min(1),
  toolName:     z.string().min(1),
  params:       z.unknown().optional(),
  outcome:      z.enum(['SUCCESS', 'ERROR']),
  errorMessage: z.string().max(2000).nullish(),
})

// Params size cap -- the gateway forwards raw tool-call params, which for
// some tools include real user/customer content (post text, comment text)
// into this JSONB column with no retention policy. This cap and the
// errorMessage length cap above are cheap guards only; full redaction/
// retention policy for this table is deferred, not this task's scope.
const MAX_PARAMS_SIZE = 50_000

// Called once per MCP tool invocation by the gateway (lyra-mcp), using the
// same bearer token the tool call itself used -- so workspace access is
// re-verified here exactly like every other bearer-authenticated route,
// rather than trusted from the gateway.
export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`mcp-audit:${user.id}`, 120, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId, toolName, params, outcome, errorMessage } = await parseBody(req, auditSchema)

    if (params != null && JSON.stringify(params).length > MAX_PARAMS_SIZE) {
      return NextResponse.json({ error: 'params exceeds maximum size' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!access || !canWrite(access.role)) {
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
