import { prisma } from '@/lib/prisma'
import { zernioClient } from './zernio-client'

// Shared helpers for every Zernio OAuth connect flow -- both the social-account
// flow (app/api/social/connect + app/api/zernio/connect/callback) and the
// notification-channel flow (app/api/notification-channels/*). The retry and
// ownership-verification behaviour below was established live against real
// connections; two divergent copies of it would be a real bug waiting to happen.

/**
 * Returns the workspace's Zernio profile id, creating it on first use.
 *
 * One Zernio profile per LYRA workspace (Profiles group accounts the same way
 * a Workspace does).
 *
 * The updateMany-guarded write handles concurrent first connects: if another
 * request persisted a profile id first, this one adopts theirs rather than
 * overwriting with the profile it just created (which is then orphaned on
 * Zernio's side, but harmless -- profiles are free, accounts are what bill).
 */
export async function ensureZernioProfile(workspaceId: string, workspaceName: string): Promise<string> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where:  { id: workspaceId },
    select: { zernioProfileId: true },
  })
  if (workspace.zernioProfileId) return workspace.zernioProfileId

  const { profile } = await zernioClient.createProfile(workspaceName)
  const { count } = await prisma.workspace.updateMany({
    where: { id: workspaceId, zernioProfileId: null },
    data:  { zernioProfileId: profile._id },
  })
  if (count > 0) return profile._id

  const current = await prisma.workspace.findUniqueOrThrow({
    where:  { id: workspaceId },
    select: { zernioProfileId: true },
  })
  return current.zernioProfileId!
}

export interface ZernioAccountRecord {
  _id?: string
  accountId?: string
  profileId: string | { _id: string; [key: string]: unknown }
  platform: string
  [key: string]: unknown
}

/**
 * GET /v1/accounts is flaky -- confirmed live 2026-07-09 by calling it four times in a
 * row immediately after a real successful connection: empty, populated, empty, empty.
 * A single call right after the OAuth redirect can easily miss an account that
 * genuinely exists, which would wrongly kill a successful connection. Retry several
 * times with backoff before concluding the account really isn't there. Facebook in
 * particular took longer than LinkedIn to show up even with the original 4-attempt/3s
 * window (extra page-selection/Graph API round trip on Zernio's backend), so this
 * spans ~9s worst case.
 *
 * Zernio's redirect doesn't always include `accountId` -- confirmed live 2026-07-09:
 * LinkedIn's redirect included it, Facebook's did not (only `connected`, `profileId`,
 * `username`), despite docs implying it's always present when no selection is needed.
 * When accountId is missing, fall back to matching by (verified workspace profileId +
 * platform) instead -- still safe, since workspace.zernioProfileId is looked up
 * server-side, never trusted from the query string.
 */
export async function findZernioAccount(opts: {
  zernioAccountId?: string
  profileId?: string
  platform?: string
}): Promise<ZernioAccountRecord | undefined> {
  const delaysMs = [0, 500, 1000, 1500, 2000, 2000, 2000]
  for (const delay of delaysMs) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    const { accounts } = await zernioClient.listAccounts()
    if (opts.zernioAccountId) {
      const match = accounts.find(
        (account) => account._id === opts.zernioAccountId || account.accountId === opts.zernioAccountId
      )
      if (match) return match
    } else if (opts.profileId && opts.platform) {
      const candidates = accounts.filter((account) => {
        const pid = typeof account.profileId === 'string' ? account.profileId : account.profileId?._id
        return pid === opts.profileId && account.platform === opts.platform
      })
      if (candidates.length > 0) {
        // Most recently updated wins if the same platform is connected more than once
        // under this profile (shouldn't normally happen, but pick deterministically).
        candidates.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
        return candidates[0]
      }
    }
  }
  return undefined
}

/** Zernio returns profileId as a populated object ({ _id, name }), not a bare string. */
export function unwrapProfileId(account: ZernioAccountRecord | undefined): string | undefined {
  if (!account) return undefined
  return typeof account.profileId === 'string' ? account.profileId : account.profileId?._id
}
