import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBody, ValidationError } from '@/lib/validate'

const auditSchema = z.object({
  workspaceId:  z.string().min(1),
  toolName:     z.string().min(1),
  params:       z.unknown().optional(),
  outcome:      z.enum(['SUCCESS', 'ERROR']),
  errorMessage: z.string().nullish(),
})

// Called once per MCP tool invocation by the gateway (lyra-mcp), using the
// same bearer token the tool call itself used -- so workspace access is
// re-verified here exactly like every other bearer-authenticated route,
// rather than trusted from the gateway.
export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, toolName, params, outcome, errorMessage } = await parseBody(req, auditSchema)

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
        params: params as Prisma.InputJsonValue | undefined,
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
