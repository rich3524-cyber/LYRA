import { callLyraApi } from '../lyra-api-client'

interface WorkspaceDetail {
  id: string
  name: string
  aiResponseMode: string
  plan: string
}

interface WorkspaceOverviewWorkspace {
  id: string
  name: string
  autonomyMode: string
  plan: string
}

export async function getWorkspaceOverview(params: { workspace_id: string }, bearerToken: string) {
  if (!params.workspace_id) throw new Error('workspace_id is required')
  const { workspace_id } = params

  // Promise.allSettled (not Promise.all) -- these four calls are independent
  // data sources being gathered for one overview, and this is a "several
  // sources, one failure shouldn't sink the rest" scenario (same convention
  // as services/notifications/crisis-alert-email.ts and
  // workers/comment-monitor.worker.ts in the main app). This matters more
  // than usual here because crisisActive is safety-relevant -- a flaky,
  // unrelated call (e.g. the inbox count endpoint) must not be able to hide
  // live crisis status from someone checking this overview. Every call gets
  // an attempt regardless of another's failure; failures are surfaced below
  // via `errors` instead of silently defaulting to a value that could be
  // misread as "all clear".
  const [workspaceResult, pendingPostsResult, inboxResult, crisisResult] = await Promise.allSettled([
    callLyraApi<WorkspaceDetail>(`/api/workspaces/${workspace_id}`, bearerToken),
    // `/api/posts` applies a `take: 200` safety cap on the underlying route
    // (see app/api/posts/route.ts in the main app). pendingApprovalsCount is
    // therefore exact only up to 200 -- a workspace with more than 200 truly
    // pending posts will report exactly 200, not the real count.
    callLyraApi<unknown[]>('/api/posts', bearerToken, { workspaceId: workspace_id, status: 'PENDING_APPROVAL' }),
    callLyraApi<{ count: number }>('/api/comments/unread-count', bearerToken, { workspaceId: workspace_id }),
    callLyraApi<{ crisisActive: boolean }>('/api/crisis/status', bearerToken, { workspaceId: workspace_id }),
  ])

  const errors: string[] = []

  let workspace: WorkspaceOverviewWorkspace | null = null
  if (workspaceResult.status === 'fulfilled') {
    const w = workspaceResult.value
    workspace = { id: w.id, name: w.name, autonomyMode: w.aiResponseMode, plan: w.plan }
  } else {
    errors.push('workspace')
  }

  let pendingApprovalsCount: number | null = null
  if (pendingPostsResult.status === 'fulfilled') {
    pendingApprovalsCount = pendingPostsResult.value.length
  } else {
    errors.push('pendingApprovalsCount')
  }

  let inboxPendingCount: number | null = null
  if (inboxResult.status === 'fulfilled') {
    inboxPendingCount = inboxResult.value.count
  } else {
    errors.push('inboxPendingCount')
  }

  // crisisActive must stay `null` (unknown) when this call fails -- never
  // coerced to `false` -- so a caller can tell "confirmed no active crisis"
  // apart from "we couldn't check right now".
  let crisisActive: boolean | null = null
  if (crisisResult.status === 'fulfilled') {
    crisisActive = crisisResult.value.crisisActive
  } else {
    errors.push('crisisActive')
  }

  return {
    workspace,
    pendingApprovalsCount,
    inboxPendingCount,
    crisisActive,
    errors,
  }
}
