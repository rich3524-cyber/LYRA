import ExcelJS from 'exceljs'
import { BULK_IMPORT_HEADER_ROW, BULK_IMPORT_MAX_DATA_ROWS } from './xlsx-template'

export interface RawImportRow {
  rowNumber: number
  date: string
  time: string
  platform: string
  caption: string
  mediaUrl: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Excel stores anything date-shaped as a real date, whatever display format the
 * user picked -- confirmed against a real filled-in template, where both
 * `mm-dd-yy` and `yyyy-mm-dd;@` cells came through as Date objects. Read the
 * UTC components: exceljs anchors these to UTC midnight, so local getters would
 * shift the day by one for anyone west of Greenwich.
 */
function formatDateCell(value: Date): string {
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`
}

/**
 * A bare time in Excel is a Date against its own 1899-12-30 epoch, so the
 * meaningful part is the time-of-day, not the date.
 *
 * This is what the "Date/Time could not be parsed" report came down to: the
 * Time column was being formatted as a date, yielding "1899-12-30", and the
 * error then told the user to use HH:MM -- which is exactly what they had
 * typed. No cell format could have avoided it.
 */
function formatTimeCell(value: Date): string {
  return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}`
}

/**
 * Some producers write a time as a bare number: a fraction of a 24-hour day,
 * so 0.5 is midday. Rounded to the nearest minute, since the fraction rarely
 * lands exactly on one.
 */
function formatTimeSerial(serial: number): string {
  const totalMinutes = Math.round(((serial % 1) + 1) % 1 * 24 * 60)
  return `${pad2(Math.floor(totalMinutes / 60) % 24)}:${pad2(totalMinutes % 60)}`
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
  if (value instanceof Date) return formatDateCell(value)
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
 * The generated template's example row carries an "EXAMPLE" marker in its
 * Caption. Matching on that -- rather than on the row's position -- is what
 * lets a user type straight over the example instead of deleting it first.
 */
function isUntouchedExampleRow(row: RawImportRow): boolean {
  return row.caption.toUpperCase().startsWith('EXAMPLE')
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
  // sheet.rowCount is attacker-controlled -- a crafted .xlsx can inflate it far
  // beyond what the compressed upload size limit would suggest (a decompression
  // bomb), so the loop must not trust it as a safe iteration count on its own.
  // The x4 margin (rather than exactly BULK_IMPORT_MAX_DATA_ROWS) allows for
  // legitimate blank/example rows interleaved with real data without truncating
  // a real import; the `break` below still stops well short of scanning an
  // enormous rowCount once real data rows alone have exceeded the limit.
  const lastRowToScan = Math.min(sheet.rowCount, BULK_IMPORT_HEADER_ROW + BULK_IMPORT_MAX_DATA_ROWS * 4)
  // Anchored to the header, not to a fixed data row. The template's example
  // row sits directly beneath the header, and deleting it -- which the
  // instructions ask for -- shifts every real row up one. Starting lower than
  // this silently swallowed the user's first post in both cases: the one they
  // typed over the example, and the one that moved up after they deleted it.
  for (let rowNumber = BULK_IMPORT_HEADER_ROW + 1; rowNumber <= lastRowToScan; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const [, date, time, platform, caption, mediaUrl] = row.values as unknown[]

    const parsed: RawImportRow = {
      rowNumber,
      date:     date instanceof Date ? formatDateCell(date) : cellText(date),
      time:     time instanceof Date
        ? formatTimeCell(time)
        : typeof time === 'number'
          ? formatTimeSerial(time)
          : cellText(time),
      platform: cellText(platform),
      caption:  cellText(caption),
      mediaUrl: cellText(mediaUrl),
    }

    // The untouched example row is skipped by its marker rather than by its
    // position, so a row typed over it is still read as real data.
    if (isUntouchedExampleRow(parsed)) continue

    // A blank row is skipped rather than reported -- a user leaving a gap
    // between batches shouldn't see phantom "missing required field" errors,
    // and exceljs's rowCount can extend past the last row anyone typed into if
    // a later row carries styling. Deliberately `continue`, not `break`: a gap
    // in the middle must not silently truncate everything after it.
    if (!parsed.date && !parsed.time && !parsed.platform && !parsed.caption && !parsed.mediaUrl) continue

    rows.push(parsed)
    // Stop scanning once real data rows alone have exceeded the limit -- the
    // caller (parse/route.ts) still reports "too many rows" from this length,
    // it just no longer requires scanning an unbounded rowCount to get there.
    if (rows.length > BULK_IMPORT_MAX_DATA_ROWS) break
  }
  return rows
}
