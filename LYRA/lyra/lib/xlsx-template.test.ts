// lib/xlsx-template.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildBulkImportTemplate,
  BULK_IMPORT_HEADER_ROW,
  BULK_IMPORT_FIRST_DATA_ROW,
  BULK_IMPORT_MAX_DATA_ROWS,
} from './xlsx-template'

async function loadSheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  // exceljs's bundled types declare load(buffer: Buffer<ArrayBuffer>), while
  // Buffer.from() yields Buffer<ArrayBufferLike> under current @types/node --
  // structurally identical at runtime, invariant in the generic to TypeScript.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  return workbook.getWorksheet('Posts')
}

describe('buildBulkImportTemplate', () => {
  it('produces a workbook with a Posts sheet and the expected headers', async () => {
    const buffer = await buildBulkImportTemplate(['FACEBOOK', 'INSTAGRAM'])
    expect(buffer.length).toBeGreaterThan(0)

    const sheet = await loadSheet(buffer)
    expect(sheet).toBeDefined()

    // exceljs row.values is 1-indexed, so slot 0 is an empty hole. (It
    // serialises as null under JSON.stringify, but the value itself is
    // undefined -- assert against the value, not its serialised form.)
    expect(sheet!.getRow(BULK_IMPORT_HEADER_ROW).values).toEqual([
      undefined, 'Date', 'Time', 'Platform', 'Caption', 'Media URL',
    ])
  })

  it('adds a Platform dropdown scoped to the connected platforms', async () => {
    const buffer = await buildBulkImportTemplate(['FACEBOOK', 'INSTAGRAM'])
    const sheet = await loadSheet(buffer)

    const validation = sheet!.getCell(`C${BULK_IMPORT_FIRST_DATA_ROW}`).dataValidation
    expect(validation).toBeDefined()
    expect(validation.type).toBe('list')
    expect(validation.formulae).toEqual(['"FACEBOOK,INSTAGRAM"'])
  })

  it('applies the dropdown across the whole importable range, not just the first row', async () => {
    // A dropdown on row 4 alone would leave every other row unvalidated --
    // exactly the typo class this format was chosen to prevent.
    const buffer = await buildBulkImportTemplate(['FACEBOOK'])
    const sheet = await loadSheet(buffer)

    const lastRow = BULK_IMPORT_FIRST_DATA_ROW + BULK_IMPORT_MAX_DATA_ROWS - 1
    expect(sheet!.getCell(`C${lastRow}`).dataValidation).toBeDefined()
    expect(sheet!.getCell(`C${lastRow + 1}`).dataValidation).toBeUndefined()
  })

  it('omits the dropdown when the workspace has no connected platforms', async () => {
    // An empty Excel list validation rejects every value, which would make the
    // template unusable rather than merely unhelpful.
    const buffer = await buildBulkImportTemplate([])
    const sheet = await loadSheet(buffer)

    expect(sheet!.getCell(`C${BULK_IMPORT_FIRST_DATA_ROW}`).dataValidation).toBeUndefined()
  })

  it('warns in the instructions when there are no connected platforms', async () => {
    const buffer = await buildBulkImportTemplate([])
    const sheet = await loadSheet(buffer)

    expect(String(sheet!.getCell('A1').value)).toMatch(/no connected/i)
  })

  it('marks the example row so it is obviously not real data', async () => {
    const buffer = await buildBulkImportTemplate(['FACEBOOK'])
    const sheet = await loadSheet(buffer)

    const exampleRow = sheet!.getRow(BULK_IMPORT_FIRST_DATA_ROW - 1)
    expect(String(exampleRow.getCell(4).value)).toMatch(/EXAMPLE/i)
  })
})
