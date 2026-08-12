// services/posts/bulk-import.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/safe-fetch', () => ({ safeFetch: vi.fn() }))

import { safeFetch } from '@/lib/safe-fetch'
import { validateImportRow, validateImportRows, parseScheduledAt } from './bulk-import'
import type { RawImportRow } from '@/lib/xlsx-parser'

const ACCOUNTS = [
  { id: 'acc-fb', platform: 'FACEBOOK' as const },
  { id: 'acc-ig', platform: 'INSTAGRAM' as const },
]

const TZ = 'Australia/Sydney'

// Every fixture row is comfortably in the future relative to this, so the
// past-date guard never fires incidentally.
const NOW = new Date('2026-07-01T00:00:00Z')

function row(overrides: Partial<RawImportRow> = {}): RawImportRow {
  return {
    rowNumber: 4,
    date:      '2026-07-15',
    time:      '09:00',
    platform:  'FACEBOOK',
    caption:   'Hello world',
    mediaUrl:  '',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('parseScheduledAt', () => {
  it('interprets the wall clock in the workspace timezone, not the server timezone', () => {
    // 09:00 in Sydney in July (UTC+10, no DST in the southern winter) is
    // 23:00 UTC the previous day.
    expect(parseScheduledAt('2026-07-15', '09:00', TZ)?.toISOString()).toBe('2026-07-14T23:00:00.000Z')
  })

  it('is independent of the machine running it', () => {
    // The conversion starts from Date.UTC rather than parsing a bare
    // "YYYY-MM-DDTHH:MM" string, which JavaScript would interpret in the
    // *server's* local zone -- that would give a different answer on a Sydney
    // laptop than on a UTC build server, for the same spreadsheet.
    const utcOffsetMinutes = new Date('2026-07-15T09:00:00').getTimezoneOffset()
    const result = parseScheduledAt('2026-07-15', '09:00', 'UTC')
    expect(result?.toISOString()).toBe('2026-07-15T09:00:00.000Z')
    // Sanity: the assertion above holds whatever this machine's offset is.
    expect(typeof utcOffsetMinutes).toBe('number')
  })

  it('handles a timezone that observes DST, on both sides of the transition', () => {
    // New York is UTC-5 in January and UTC-4 in July.
    expect(parseScheduledAt('2026-01-15', '12:00', 'America/New_York')?.toISOString())
      .toBe('2026-01-15T17:00:00.000Z')
    expect(parseScheduledAt('2026-07-15', '12:00', 'America/New_York')?.toISOString())
      .toBe('2026-07-15T16:00:00.000Z')
  })

  it('rejects a non-ISO date shape rather than guessing day/month order', () => {
    expect(parseScheduledAt('15/07/2026', '09:00', TZ)).toBeNull()
  })

  it('rejects an impossible calendar date', () => {
    expect(parseScheduledAt('2026-02-30', '09:00', TZ)).toBeNull()
  })

  it('rejects an out-of-range time', () => {
    expect(parseScheduledAt('2026-07-15', '25:00', TZ)).toBeNull()
  })
})

describe('validateImportRow', () => {
  it('flags a missing required field as an error', async () => {
    const result = await validateImportRow(row({ caption: '' }), ACCOUNTS, TZ)
    expect(result.status).toBe('error')
    expect(result.reason).toContain('required')
  })

  it('flags an unrecognised platform value as an error', async () => {
    const result = await validateImportRow(row({ platform: 'Facbook' }), ACCOUNTS, TZ)
    expect(result.status).toBe('error')
    expect(result.reason).toContain('not a recognised platform')
  })

  it('accepts a lowercase platform value typed over the dropdown', async () => {
    const result = await validateImportRow(row({ platform: 'facebook' }), ACCOUNTS, TZ)
    expect(result.status).toBe('ready')
    expect(result.post?.platform).toBe('FACEBOOK')
  })

  it('flags a platform with no connected account as an error', async () => {
    const result = await validateImportRow(row({ platform: 'TIKTOK' }), ACCOUNTS, TZ)
    expect(result.status).toBe('error')
    expect(result.reason).toContain('no connected TIKTOK account')
  })

  it('flags an unparseable date/time as an error', async () => {
    const result = await validateImportRow(row({ date: '15/07/2026' }), ACCOUNTS, TZ)
    expect(result.status).toBe('error')
    expect(result.reason).toContain('could not be parsed')
  })

  it('flags a date in the past as an error rather than mass-publishing on import', async () => {
    const result = await validateImportRow(row({ date: '2026-06-01' }), ACCOUNTS, TZ)
    expect(result.status).toBe('error')
    expect(result.reason).toContain('in the past')
  })

  it('resolves the platform to its connected socialAccountId and converts workspace-local time to UTC', async () => {
    const result = await validateImportRow(row(), ACCOUNTS, TZ)
    expect(result.status).toBe('ready')
    expect(result.post).toMatchObject({
      socialAccountId: 'acc-fb',
      platform:        'FACEBOOK',
      content:         'Hello world',
      scheduledAt:     '2026-07-14T23:00:00.000Z',
      mediaUrl:        null,
    })
  })

  it('flags a known-bad media/platform combination as an error, without attempting a fetch', async () => {
    const result = await validateImportRow(
      row({ platform: 'INSTAGRAM', mediaUrl: 'https://example.com/photo.gif' }),
      ACCOUNTS,
      TZ
    )
    expect(result.status).toBe('error')
    expect(result.reason).toContain('does not accept this media format')
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('keeps the media URL and marks the row ready when the HEAD check succeeds with an image content-type', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok:      true,
      headers: { get: () => 'image/jpeg' },
    } as never)

    const result = await validateImportRow(row({ mediaUrl: 'https://example.com/photo.jpg' }), ACCOUNTS, TZ)

    expect(result.status).toBe('ready')
    expect(result.post?.mediaUrl).toBe('https://example.com/photo.jpg')
    expect(safeFetch).toHaveBeenCalledWith('https://example.com/photo.jpg', { method: 'HEAD' })
  })

  it('drops the media URL and warns, without erroring the row, when the HEAD check fails', async () => {
    vi.mocked(safeFetch).mockResolvedValue({ ok: false, headers: { get: () => null } } as never)

    const result = await validateImportRow(row({ mediaUrl: 'https://example.com/dead-link' }), ACCOUNTS, TZ)

    expect(result.status).toBe('warning')
    expect(result.post?.mediaUrl).toBeNull()
  })

  it('drops the media URL and warns when safeFetch throws (e.g. blocked by SSRF validation)', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error('blocked'))

    const result = await validateImportRow(row({ mediaUrl: 'https://example.com/blocked' }), ACCOUNTS, TZ)

    expect(result.status).toBe('warning')
    expect(result.post?.mediaUrl).toBeNull()
  })

  it('warns rather than erroring when the URL resolves to a non-media content type', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok:      true,
      headers: { get: () => 'text/html' },
    } as never)

    const result = await validateImportRow(row({ mediaUrl: 'https://example.com/share-page' }), ACCOUNTS, TZ)

    expect(result.status).toBe('warning')
    expect(result.post?.mediaUrl).toBeNull()
  })

  it('never calls safeFetch when no media URL is given', async () => {
    const result = await validateImportRow(row(), ACCOUNTS, TZ)
    expect(result.status).toBe('ready')
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('picks a deterministic account when a workspace has two of the same platform', async () => {
    // v1 has no way to disambiguate -- the template offers platform names, not
    // account names. Pinning first-listed keeps it predictable rather than
    // arbitrary; see the note in the implementation.
    const twoFacebooks = [
      { id: 'acc-fb-1', platform: 'FACEBOOK' as const },
      { id: 'acc-fb-2', platform: 'FACEBOOK' as const },
    ]
    const result = await validateImportRow(row(), twoFacebooks, TZ)
    expect(result.post?.socialAccountId).toBe('acc-fb-1')
  })
})

describe('validateImportRows', () => {
  it('validates every row independently and preserves row order', async () => {
    const rows = [row({ rowNumber: 4 }), row({ rowNumber: 5, caption: '' })]
    const results = await validateImportRows(rows, ACCOUNTS, TZ)
    expect(results.map((r) => r.rowNumber)).toEqual([4, 5])
    expect(results[0].status).toBe('ready')
    expect(results[1].status).toBe('error')
  })

  it('does not let one row s media failure affect another row', async () => {
    vi.mocked(safeFetch)
      .mockRejectedValueOnce(new Error('dead'))
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'image/png' } } as never)

    const results = await validateImportRows(
      [
        row({ rowNumber: 4, mediaUrl: 'https://example.com/dead.jpg' }),
        row({ rowNumber: 5, mediaUrl: 'https://example.com/ok.png' }),
      ],
      ACCOUNTS,
      TZ
    )

    expect(results[0].status).toBe('warning')
    expect(results[1].status).toBe('ready')
  })
})
