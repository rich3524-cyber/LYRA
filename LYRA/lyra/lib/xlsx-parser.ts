import ExcelJS from 'exceljs'
import { BULK_IMPORT_FIRST_DATA_ROW } from './xlsx-template'

export interface RawImportRow {
  rowNumber: number
  date: string
  time: string
  platform: string
  caption: string
  mediaUrl: string
}

/**
 * Excel cells are not always plain strings. A pasted link becomes a rich
 * `{ text, hyperlink }` object and a formula becomes `{ formula, result }` --
 * `String(cell)` on either yields "[object Object]", which would then fail
 * validation with a baffling message. Reduce every shape to the text a user
 * would see in the cell.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const obj = value as { text?: unknown; hyperlink?: unknown; result?: unknown; richText?: { text: string }[] }
    if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join('').trim()
    if (obj.text !== undefined) return String(obj.text).trim()
    if (obj.result !== undefined) return String(obj.result).trim()
    if (obj.hyperlink !== undefined) return String(obj.hyperlink).trim()
    return ''
  }
  return String(value).trim()
}

/**
 * Pure cell extraction -- no business validation here. That lives in
 * services/posts/bulk-import.ts, which takes this file's output as its input.
 */
export async function parseBulkImportFile(buffer: Buffer): Promise<RawImportRow[]> {
  const workbook = new ExcelJS.Workbook()
  // exceljs's bundled types declare load(buffer: Buffer<ArrayBuffer>), while
  // Buffer.from() yields Buffer<ArrayBufferLike> under current @types/node --
  // structurally identical at runtime, invariant in the generic to TypeScript.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const sheet = workbook.getWorksheet('Posts')
  if (!sheet) return []

  const rows: RawImportRow[] = []
  for (let rowNumber = BULK_IMPORT_FIRST_DATA_ROW; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const [, date, time, platform, caption, mediaUrl] = row.values as unknown[]

    const parsed: RawImportRow = {
      rowNumber,
      date:     cellText(date),
      time:     cellText(time),
      platform: cellText(platform),
      caption:  cellText(caption),
      mediaUrl: cellText(mediaUrl),
    }

    // A blank row is skipped rather than reported -- a user leaving a gap
    // between batches shouldn't see phantom "missing required field" errors,
    // and exceljs's rowCount can extend past the last row anyone typed into if
    // a later row carries styling. Deliberately `continue`, not `break`: a gap
    // in the middle must not silently truncate everything after it.
    if (!parsed.date && !parsed.time && !parsed.platform && !parsed.caption && !parsed.mediaUrl) continue

    rows.push(parsed)
  }
  return rows
}
