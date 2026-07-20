// services/schedule/captions-csv.test.ts
import { describe, it, expect } from 'vitest'
import { buildCaptionsCsv } from './captions-csv'

describe('buildCaptionsCsv', () => {
  it('builds a header row plus one row per caption', () => {
    const csv = buildCaptionsCsv([
      { date: '2026-07-21', time: '08:00', platform: 'Instagram', topic: 'behind the scenes', caption: 'Hello world #bts' },
    ])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Date,Time,Platform,Topic,Caption')
    expect(lines[1]).toBe('"2026-07-21","08:00","Instagram","behind the scenes","Hello world #bts"')
    expect(lines.length).toBe(2)
  })

  it('escapes embedded double quotes and commas in caption text', () => {
    const csv = buildCaptionsCsv([
      { date: '2026-07-21', time: '08:00', platform: 'LinkedIn', topic: 'launch', caption: 'She said "great, launch it" today' },
    ])
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('"2026-07-21","08:00","LinkedIn","launch","She said ""great, launch it"" today"')
  })

  it('returns just the header row for an empty list', () => {
    expect(buildCaptionsCsv([])).toBe('Date,Time,Platform,Topic,Caption')
  })
})
