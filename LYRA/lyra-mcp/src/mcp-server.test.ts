import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/server'

vi.mock('./rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('./audit-log', () => ({ logAuditEvent: vi.fn() }))
vi.mock('./resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { TOOL_REGISTRY, createToolCallback, createLyraMcpServer, type ToolDefinition } from './mcp-server'
import { checkRateLimit } from './rate-limit'
import { logAuditEvent } from './audit-log'
import { resolveWorkspaceId } from './resolve-workspace-id'
import { PROMPT_REGISTRY } from './prompts'

describe('TOOL_REGISTRY', () => {
  it('registers exactly the 15 core tools', () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      'call_capability',
      'complete_media_upload',
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
      'search_capabilities',
      'start_media_upload',
      'upload_media_chunk',
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

describe('createLyraMcpServer prompt registration', () => {
  // McpServer doesn't expose a public way to introspect registered prompts
  // after the fact (no live server instance is constructed anywhere else in
  // this test file either -- the tool tests exercise TOOL_REGISTRY and
  // createToolCallback directly, never a real McpServer). Spying on
  // registerPrompt is the equivalent data-level check for prompts.
  it('registers exactly the 4 prompts from PROMPT_REGISTRY, each with its description', () => {
    const spy = vi.spyOn(McpServer.prototype, 'registerPrompt')
    try {
      createLyraMcpServer()
      const registeredNames = spy.mock.calls.map((call) => call[0]).sort()
      expect(registeredNames).toEqual(Object.keys(PROMPT_REGISTRY).sort())
      for (const call of spy.mock.calls) {
        const [name, config] = call
        expect(config).toMatchObject({ description: PROMPT_REGISTRY[name as string].description })
      }
    } finally {
      spy.mockRestore()
    }
  })

  it('each registered prompt callback returns its message as a single user text message', async () => {
    const spy = vi.spyOn(McpServer.prototype, 'registerPrompt')
    try {
      createLyraMcpServer()
      // Guards against this test passing vacuously (zero assertions run) if
      // registerPrompt ever stops being a spied-on prototype method.
      expect(spy.mock.calls).toHaveLength(Object.keys(PROMPT_REGISTRY).length)
      for (const call of spy.mock.calls) {
        const [name, , cb] = call
        const result = await (cb as (ctx: unknown) => Promise<unknown>)(undefined)
        expect(result).toEqual({
          messages: [{ role: 'user', content: { type: 'text', text: PROMPT_REGISTRY[name as string].message } }],
        })
      }
    } finally {
      spy.mockRestore()
    }
  })
})

describe('createToolCallback', () => {
  function fakeTool(): ToolDefinition {
    return {
      description: 'fake tool for wrapper tests',
      inputSchema: z.object({ workspace_id: z.string().optional() }),
      handler: vi.fn(),
    }
  }

  function ctxFor(sub: string | undefined, token = 'tok-123') {
    return { http: { authInfo: { token, extra: sub ? { sub } : {} } } }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 59 })
    // Mirrors the real resolveWorkspaceId's identity-when-given behavior --
    // echoes back an explicit id, otherwise stands in for "implicit
    // resolution succeeded" with a fixed id.
    vi.mocked(resolveWorkspaceId).mockImplementation(async (id) => id ?? 'ws-implicit')
    vi.mocked(logAuditEvent).mockResolvedValue(undefined)
  })

  it('throws when there is no bearer token in context, and never calls the handler', async () => {
    const tool = fakeTool()
    const cb = createToolCallback('some_tool', tool)
    await expect(cb({}, { http: undefined })).rejects.toThrow('No authenticated bearer token')
    expect(tool.handler).not.toHaveBeenCalled()
  })

  it('throws when there is no sub claim in context, and never calls the handler', async () => {
    const tool = fakeTool()
    const cb = createToolCallback('some_tool', tool)
    await expect(cb({}, { http: { authInfo: { token: 'tok-123', extra: {} } } })).rejects.toThrow(
      'No authenticated user identity'
    )
    expect(tool.handler).not.toHaveBeenCalled()
  })

  it('denies on a user-level rate limit and never calls the handler', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0 })
    const tool = fakeTool()
    const cb = createToolCallback('some_tool', tool)
    await expect(cb({}, ctxFor('user-1'))).rejects.toThrow('Rate limit exceeded for this user')
    expect(tool.handler).not.toHaveBeenCalled()
  })

  it('denies on a workspace-level rate limit and never calls the handler', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ allowed: true, remaining: 59 }) // user check passes
      .mockResolvedValueOnce({ allowed: false, remaining: 0 }) // workspace check fails
    const tool = fakeTool()
    const cb = createToolCallback('some_tool', tool)
    await expect(cb({ workspace_id: 'ws-1' }, ctxFor('user-1'))).rejects.toThrow('Rate limit exceeded for this workspace')
    expect(tool.handler).not.toHaveBeenCalled()
  })

  it('calls checkRateLimit with the exact user and workspace keys and limits', async () => {
    const tool = fakeTool()
    vi.mocked(tool.handler).mockResolvedValue({ ok: true })
    const cb = createToolCallback('some_tool', tool)
    await cb({ workspace_id: 'ws-1' }, ctxFor('user-1'))
    expect(checkRateLimit).toHaveBeenCalledWith('user:user-1', 60, 60)
    expect(checkRateLimit).toHaveBeenCalledWith('workspace:ws-1', 120, 60)
  })

  it('logs a SUCCESS audit event with the correct workspaceId/toolName/params when workspace_id was present in raw params', async () => {
    const tool = fakeTool()
    vi.mocked(tool.handler).mockResolvedValue({ ok: true })
    const cb = createToolCallback('schedule_post', tool)
    await cb({ workspace_id: 'ws-1', content: 'hi' }, ctxFor('user-1'))
    expect(logAuditEvent).toHaveBeenCalledWith('tok-123', {
      workspaceId: 'ws-1',
      toolName: 'schedule_post',
      params: { workspace_id: 'ws-1', content: 'hi' },
      outcome: 'SUCCESS',
    })
  })

  it('logs an ERROR audit event with the error message when the handler throws, and still rethrows the original error', async () => {
    const tool = fakeTool()
    const err = new Error('handler exploded')
    vi.mocked(tool.handler).mockRejectedValue(err)
    const cb = createToolCallback('schedule_post', tool)
    await expect(cb({ workspace_id: 'ws-1' }, ctxFor('user-1'))).rejects.toThrow('handler exploded')
    expect(logAuditEvent).toHaveBeenCalledWith('tok-123', {
      workspaceId: 'ws-1',
      toolName: 'schedule_post',
      params: { workspace_id: 'ws-1' },
      outcome: 'ERROR',
      errorMessage: 'handler exploded',
    })
  })

  it('resolves workspace_id implicitly when omitted from raw params, and still applies workspace-level rate limiting and audit logging for the resolved id', async () => {
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-resolved')
    const tool = fakeTool()
    vi.mocked(tool.handler).mockResolvedValue({ ok: true })
    const cb = createToolCallback('schedule_post', tool)
    await cb({ content: 'hi' }, ctxFor('user-1'))

    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'tok-123')
    expect(checkRateLimit).toHaveBeenCalledWith('workspace:ws-resolved', 120, 60)
    expect(tool.handler).toHaveBeenCalledWith({ content: 'hi', workspace_id: 'ws-resolved' }, 'tok-123')
    expect(logAuditEvent).toHaveBeenCalledWith('tok-123', {
      workspaceId: 'ws-resolved',
      toolName: 'schedule_post',
      params: { content: 'hi', workspace_id: 'ws-resolved' },
      outcome: 'SUCCESS',
    })
  })

  it('does not resolve, rate-limit, or audit at the workspace level for list_workspaces (no workspace concept)', async () => {
    const tool: ToolDefinition = { description: 'x', inputSchema: z.object({}), handler: vi.fn().mockResolvedValue({}) }
    const cb = createToolCallback('list_workspaces', tool)
    await cb({}, ctxFor('user-1'))

    expect(resolveWorkspaceId).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(checkRateLimit).toHaveBeenCalledTimes(1)
    expect(checkRateLimit).toHaveBeenCalledWith('user:user-1', 60, 60)
  })

  it.each(['upload_media_chunk', 'complete_media_upload'])(
    'does not resolve, rate-limit, or audit at the workspace level for %s (workspace context is carried by the upload session, not a workspace_id param -- resolveWorkspaceId would otherwise fire a wasted HTTP call on every chunk)',
    async (toolName) => {
      // Mirrors what really reaches createToolCallback: neither tool's
      // inputSchema declares workspace_id, so the MCP SDK's zod validation
      // strips it from params before the callback ever sees it -- even if a
      // caller sent one.
      const tool: ToolDefinition = { description: 'x', inputSchema: z.object({ uploadId: z.string() }), handler: vi.fn().mockResolvedValue({}) }
      const cb = createToolCallback(toolName, tool)
      await cb({ uploadId: 'up-1' }, ctxFor('user-1'))

      expect(resolveWorkspaceId).not.toHaveBeenCalled()
      expect(logAuditEvent).not.toHaveBeenCalled()
      expect(checkRateLimit).toHaveBeenCalledTimes(1)
      expect(checkRateLimit).toHaveBeenCalledWith('user:user-1', 60, 60)
    }
  )

  it('does not block the call when workspace resolution fails (e.g. ambiguous multi-workspace caller) -- lets the handler fail with its own real error', async () => {
    vi.mocked(resolveWorkspaceId).mockRejectedValue(new Error('workspace_id is required: multiple workspaces'))
    const tool = fakeTool()
    vi.mocked(tool.handler).mockRejectedValue(new Error('workspace_id is required: multiple workspaces'))
    const cb = createToolCallback('schedule_post', tool)

    await expect(cb({ content: 'hi' }, ctxFor('user-1'))).rejects.toThrow('workspace_id is required')
    // No workspace-level rate limit or audit -- workspace_id never resolved.
    expect(checkRateLimit).toHaveBeenCalledTimes(1) // user-level only
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('degrades to a generic bounded error (not the raw error) when checkRateLimit rejects at the infrastructure layer', async () => {
    vi.mocked(checkRateLimit).mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'))
    const tool = fakeTool()
    const cb = createToolCallback('some_tool', tool)
    await expect(cb({}, ctxFor('user-1'))).rejects.toThrow('Rate limiting is temporarily unavailable -- please try again shortly')
    expect(tool.handler).not.toHaveBeenCalled()
  })

  it('degrades to a generic bounded error within the timeout window when checkRateLimit hangs indefinitely', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(checkRateLimit).mockImplementation(() => new Promise(() => {})) // never settles
      const tool = fakeTool()
      const cb = createToolCallback('some_tool', tool)

      const promise = cb({}, ctxFor('user-1'))
      const assertion = expect(promise).rejects.toThrow(
        'Rate limiting is temporarily unavailable -- please try again shortly'
      )
      await vi.advanceTimersByTimeAsync(3000)
      await assertion
      expect(tool.handler).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
