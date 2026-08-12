// lib/xlsx-parser.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseBulkImportFile } from './xlsx-parser'
import { BULK_IMPORT_HEADER_ROW, BULK_IMPORT_FIRST_DATA_ROW } from './xlsx-template'

// The row the generated template puts its greyed-out example on.
const EXAMPLE_ROW = BULK_IMPORT_FIRST_DATA_ROW - 1

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

  it('skips the untouched example row without reporting it as an error', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Posts')
    sheet.getRow(BULK_IMPORT_HEADER_ROW).values = ['Date', 'Time', 'Platform', 'Caption', 'Media URL']
    sheet.getRow(EXAMPLE_ROW).values = ['2026-09-01', '09:00', 'FACEBOOK', 'EXAMPLE — delete this row before uploading', '']
    sheet.getRow(EXAMPLE_ROW + 1).values = ['2026-07-15', '09:00', 'FACEBOOK', 'Real', '']
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    expect((await parseBulkImportFile(buffer)).map((r) => r.caption)).toEqual(['Real'])
  })

  it('reads a row typed OVER the example row instead of silently dropping it', async () => {
    // Found in real use: the template says to delete the example row, but the
    // natural thing to do is type over it. Skipping that row by position lost
    // a post the user had filled in, with no error anywhere.
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Posts')
    sheet.getRow(BULK_IMPORT_HEADER_ROW).values = ['Date', 'Time', 'Platform', 'Caption', 'Media URL']
    sheet.getRow(EXAMPLE_ROW).values = ['2026-07-15', '09:00', 'FACEBOOK', 'TEST TEST TEST', '']
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    expect((await parseBulkImportFile(buffer)).map((r) => r.caption)).toEqual(['TEST TEST TEST'])
  })

  it('reads data starting immediately below the header, since deleting the example row shifts everything up', async () => {
    // Deleting a row in Excel shifts the rows beneath it up by one, so a user
    // who follows the instruction literally has real data on the example row's
    // old line. Anchoring to the header, not to a fixed data row, covers both.
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Posts')
    sheet.getRow(BULK_IMPORT_HEADER_ROW).values = ['Date', 'Time', 'Platform', 'Caption', 'Media URL']
    sheet.getRow(BULK_IMPORT_HEADER_ROW + 1).values = ['2026-07-15', '09:00', 'FACEBOOK', 'First', '']
    sheet.getRow(BULK_IMPORT_HEADER_ROW + 2).values = ['2026-07-16', '10:00', 'INSTAGRAM', 'Second', '']
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    expect((await parseBulkImportFile(buffer)).map((r) => r.caption)).toEqual(['First', 'Second'])
  })

  it('converts an Excel Date cell in the Date column to YYYY-MM-DD', async () => {
    // Excel coerces anything date-shaped into a real Date regardless of the
    // cell's display format -- confirmed against a real filled-in template.
    const buffer = await buildFixture([
      [new Date(Date.UTC(2026, 7, 13)), '09:00', 'FACEBOOK', 'Hello', ''],
    ])
    expect((await parseBulkImportFile(buffer))[0].date).toBe('2026-08-13')
  })

  it('converts an Excel time-only Date cell to HH:MM', async () => {
    // Excel stores a bare time against its own 1899-12-30 epoch. Formatting
    // that as a date produced "1899-12-30", which then failed validation with
    // a message telling the user to use HH:MM -- which is what they had typed.
    const buffer = await buildFixture([
      ['2026-08-13', new Date(Date.UTC(1899, 11, 30, 19, 0)), 'FACEBOOK', 'Hello', ''],
    ])
    expect((await parseBulkImportFile(buffer))[0].time).toBe('19:00')
  })

  it('zero-pads a single-digit hour from an Excel time cell', async () => {
    const buffer = await buildFixture([
      ['2026-08-13', new Date(Date.UTC(1899, 11, 30, 9, 5)), 'FACEBOOK', 'Hello', ''],
    ])
    expect((await parseBulkImportFile(buffer))[0].time).toBe('09:05')
  })

  it('converts a numeric time serial (fraction of a day) to HH:MM', async () => {
    // Some producers write a bare number rather than a date-typed cell.
    const buffer = await buildFixture([['2026-08-13', 0.5, 'FACEBOOK', 'Hello', '']])
    expect((await parseBulkImportFile(buffer))[0].time).toBe('12:00')
  })

  it('still accepts plain text in both columns, for a hand-built file', async () => {
    const buffer = await buildFixture([['2026-08-13', '19:00', 'FACEBOOK', '  padded  ', '']])
    const [row] = await parseBulkImportFile(buffer)
    expect(row.date).toBe('2026-08-13')
    expect(row.time).toBe('19:00')
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
