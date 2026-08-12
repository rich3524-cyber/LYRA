import { Platform } from '@prisma/client'
import { checkMediaCompatibility } from '@/services/social/media-compatibility'
import { safeFetch } from '@/lib/safe-fetch'
import type { RawImportRow } from '@/lib/xlsx-parser'

// Pure per-row validation for the bulk importer. No database and no request
// context -- the only I/O is the SSRF-hardened media HEAD check, which is
// mockable -- so every rule here is unit testable directly.

export interface ConnectedAccount {
  id: string
  platform: Platform
}

export type ImportRowStatus = 'ready' | 'warning' | 'error'

export interface ValidatedImportRow {
  rowNumber: number
  status: ImportRowStatus
  reason?: string
  post?: {
    socialAccountId: string
    platform: Platform
    content: string
    scheduledAt: string // ISO
    mediaUrl: string | null
  }
}

const PLATFORM_VALUES = new Set<string>(Object.values(Platform))

/**
 * Combines "YYYY-MM-DD" + "HH:MM" and interprets the result in the workspace's
 * own timezone, matching how the Calendar and Composer already treat scheduling
 * times.
 *
 * Starts from `Date.UTC` rather than `new Date("2026-07-15T09:00")`. That bare
 * string form is parsed in the *server's* local zone, which would make the same
 * spreadsheet import to a different instant on a Sydney laptop than on a UTC
 * build server. Starting from UTC and then measuring the target zone's offset
 * makes the result depend only on the workspace timezone.
 */
export function parseScheduledAt(date: string, time: string, timeZone: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dateMatch || !timeMatch) return null

  const [, y, mo, d] = dateMatch.map(Number)
  const [, h, mi] = timeMatch.map(Number)
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null

  const utcGuess = Date.UTC(y, mo - 1, d, h, mi)
  // Date.UTC rolls impossible dates over (Feb 30 -> Mar 2), which would
  // silently schedule a post on a day the user never wrote. Reject instead.
  const rolled = new Date(utcGuess)
  if (rolled.getUTCMonth() !== mo - 1 || rolled.getUTCDate() !== d) return null

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year:      'numeric',
    month:     '2-digit',
    day:       '2-digit',
    hour:      '2-digit',
    minute:    '2-digit',
    second:    '2-digit',
  })
  const parts = dtf.formatToParts(new Date(utcGuess)).reduce(
    (acc, p) => ({ ...acc, [p.type]: p.value }),
    {} as Record<string, string>
  )
  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  const offsetMs = wallClockAsUtc - utcGuess
  return new Date(utcGuess - offsetMs)
}

export async function validateImportRow(
  row: RawImportRow,
  connectedAccounts: ConnectedAccount[],
  timeZone: string,
  now: Date = new Date()
): Promise<ValidatedImportRow> {
  if (!row.date || !row.time || !row.platform || !row.caption) {
    return {
      rowNumber: row.rowNumber,
      status:    'error',
      reason:    'Missing a required field (Date, Time, Platform, or Caption).',
    }
  }

  // Uppercased before matching: the dropdown emits canonical values, but a
  // user who types over a locked cell (or opens the file in software that
  // ignores the validation) shouldn't be blocked purely by letter case.
  const normalizedPlatform = row.platform.toUpperCase()
  if (!PLATFORM_VALUES.has(normalizedPlatform)) {
    return {
      rowNumber: row.rowNumber,
      status:    'error',
      reason:    `"${row.platform}" is not a recognised platform.`,
    }
  }
  const platform = normalizedPlatform as Platform

  // First match wins. v1 has no way to disambiguate two accounts on the same
  // platform -- the template's dropdown lists platform names, not account
  // names -- so the caller passes accounts in a stable order (see the parse
  // route's orderBy) to keep this predictable rather than arbitrary. Choosing
  // between two Facebook Pages in an import is a real follow-up.
  const account = connectedAccounts.find((a) => a.platform === platform)
  if (!account) {
    return {
      rowNumber: row.rowNumber,
      status:    'error',
      reason:    `This workspace has no connected ${platform} account.`,
    }
  }

  const scheduledAt = parseScheduledAt(row.date, row.time, timeZone)
  if (!scheduledAt) {
    return {
      rowNumber: row.rowNumber,
      status:    'error',
      reason:    'Date/Time could not be parsed. Use YYYY-MM-DD and 24-hour HH:MM.',
    }
  }

  // A past-dated row is blocked, not imported. The publish cron picks up any
  // SCHEDULED post whose time has passed, so importing last month's plan would
  // fire every one of those posts the moment the user clicks Import. The spec
  // calls for a "future-or-present" scheduledAt; this is what enforces it.
  if (scheduledAt.getTime() < now.getTime()) {
    return {
      rowNumber: row.rowNumber,
      status:    'error',
      reason:    'This date and time is in the past. It would publish immediately on import.',
    }
  }

  let mediaUrl: string | null = row.mediaUrl || null
  let warning: string | undefined

  if (mediaUrl) {
    // Same compatibility rules the Composer and POST /api/posts already apply,
    // e.g. a GIF targeting Instagram. Unlike a broken link, this is not fixed
    // by importing without media -- the user picked the wrong file -- so it
    // blocks the row.
    const issues = checkMediaCompatibility([mediaUrl], [platform])
    if (issues.length > 0) {
      return {
        rowNumber: row.rowNumber,
        status:    'error',
        reason:    `${platform} does not accept this media format.`,
      }
    }

    try {
      const res = await safeFetch(mediaUrl, { method: 'HEAD' })
      const contentType = res.headers.get('content-type') ?? ''
      if (!res.ok || !(contentType.startsWith('image/') || contentType.startsWith('video/'))) {
        warning  = 'Media URL is unreachable or not an image/video. Post will import without media.'
        mediaUrl = null
      }
    } catch {
      // Includes SSRF rejections from safeFetch (private/reserved addresses).
      warning  = 'Media URL is unreachable. Post will import without media.'
      mediaUrl = null
    }
  }

  return {
    rowNumber: row.rowNumber,
    status:    warning ? 'warning' : 'ready',
    reason:    warning,
    post:      {
      socialAccountId: account.id,
      platform,
      content:         row.caption,
      scheduledAt:     scheduledAt.toISOString(),
      mediaUrl,
    },
  }
}

export async function validateImportRows(
  rows: RawImportRow[],
  connectedAccounts: ConnectedAccount[],
  timeZone: string
): Promise<ValidatedImportRow[]> {
  // One `now` for the whole batch, so a slow media check can't make two rows
  // with the same timestamp disagree about whether they're in the past.
  const now = new Date()
  return Promise.all(rows.map((row) => validateImportRow(row, connectedAccounts, timeZone, now)))
}
