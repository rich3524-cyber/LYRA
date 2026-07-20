export interface CaptionCsvRow {
  date:     string
  time:     string
  platform: string
  topic:    string
  caption:  string
}

const CSV_HEADER = ['Date', 'Time', 'Platform', 'Topic', 'Caption'].join(',')

function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * Pure CSV builder for the Schedule Review "Export captions" action -- takes
 * already-formatted row data (no date/timezone logic here) and returns a
 * CRLF-joined CSV string ready to hand to a Blob.
 */
export function buildCaptionsCsv(rows: CaptionCsvRow[]): string {
  const body = rows.map((row) =>
    [row.date, row.time, row.platform, row.topic, row.caption].map(escapeCsvField).join(',')
  )
  return [CSV_HEADER, ...body].join('\r\n')
}
