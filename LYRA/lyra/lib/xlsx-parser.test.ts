// lib/xlsx-parser.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseBulkImportFile } from './xlsx-parser'
import { BULK_IMPORT_HEADER_ROW, BULK_IMPORT_FIRST_DATA_ROW } from './xlsx-template'

async function buildFixture(dataRows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Posts')
  sheet.getRow(BULK_IMPORT_HEADER_ROW).values = ['Date', 'Time', 'Platform', 'Caption', 'Media URL']
  dataRows.forEach((values, i) => {
    sheet.getRow(BULK_IMPORT_FIRST_DATA_ROW + i).values = values as ExcelJS.CellValue[]
  })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe('parseBulkImportFile', () => {
  it('extracts each data row starting after the header, tagged with its real row number', async () => {
    const buffer = await buildFixture([
      ['2026-07-15', '09:00', 'FACEBOOK', 'Hello', 'https://example.com/a.jpg'],
      ['2026-07-16', '10:00', 'INSTAGRAM', 'World', ''],
    ])

    expect(await parseBulkImportFile(buffer)).toEqual([
      {
        rowNumber: BULK_IMPORT_FIRST_DATA_ROW,
        date:      '2026-07-15',
        time:      '09:00',
        platform:  'FACEBOOK',
        caption:   'Hello',
        mediaUrl:  'https://example.com/a.jpg',
      },
      {
        rowNumber: BULK_IMPORT_FIRST_DATA_ROW + 1,
        date:      '2026-07-16',
        time:      '10:00',
        platform:  'INSTAGRAM',
        caption:   'World',
        mediaUrl:  '',
      },
    ])
  })

  it('skips a fully empty row rather than reporting it as data', async () => {
    const buffer = await buildFixture([
      ['2026-07-15', '09:00', 'FACEBOOK', 'Hello', ''],
      ['', '', '', '', ''],
    ])
    expect(await parseBulkImportFile(buffer)).toHaveLength(1)
  })

  it('keeps a later real row even when a blank row sits above it', async () => {
    // A gap in the middle must not silently truncate the rest of the import.
    const buffer = await buildFixture([
      ['2026-07-15', '09:00', 'FACEBOOK', 'First', ''],
      ['', '', '', '', ''],
      ['2026-07-17', '11:00', 'FACEBOOK', 'Third', ''],
    ])
    const rows = await parseBulkImportFile(buffer)
    expect(rows.map((r) => r.caption)).toEqual(['First', 'Third'])
    expect(rows[1].rowNumber).toBe(BULK_IMPORT_FIRST_DATA_ROW + 2)
  })

  it('reads the example row too, so a user who forgets to delete it sees it flagged', async () => {
    // The template's example row sits directly above the first data row, so it
    // is out of range by construction -- this pins that boundary.
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Posts')
    sheet.getRow(BULK_IMPORT_FIRST_DATA_ROW - 1).values = ['x', 'y', 'z', 'EXAMPLE', '']
    sheet.getRow(BULK_IMPORT_FIRST_DATA_ROW).values = ['2026-07-15', '09:00', 'FACEBOOK', 'Real', '']
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const rows = await parseBulkImportFile(buffer)
    expect(rows.map((r) => r.caption)).toEqual(['Real'])
  })

  it('coerces non-string cells (a real date or number typed by Excel) to trimmed strings', async () => {
    const buffer = await buildFixture([
      [new Date('2026-07-15T00:00:00Z'), 900, 'FACEBOOK', '  padded  ', ''],
    ])
    const [row] = await parseBulkImportFile(buffer)
    expect(typeof row.date).toBe('string')
    expect(row.time).toBe('900')
    expect(row.caption).toBe('padded')
  })

  it('extracts the display text when Excel stores a Media URL as a hyperlink object', async () => {
    // Pasting a link into Excel produces a rich {text, hyperlink} cell, not a
    // plain string -- String(cell) on that yields "[object Object]".
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Posts')
    sheet.getRow(BULK_IMPORT_HEADER_ROW).values = ['Date', 'Time', 'Platform', 'Caption', 'Media URL']
    const row = sheet.getRow(BULK_IMPORT_FIRST_DATA_ROW)
    row.values = ['2026-07-15', '09:00', 'FACEBOOK', 'Hello', '']
    row.getCell(5).value = { text: 'https://example.com/a.jpg', hyperlink: 'https://example.com/a.jpg' }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const [parsed] = await parseBulkImportFile(buffer)
    expect(parsed.mediaUrl).toBe('https://example.com/a.jpg')
  })

  it('returns an empty array when the Posts sheet is missing', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('SomethingElse')
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    expect(await parseBulkImportFile(buffer)).toEqual([])
  })
})
