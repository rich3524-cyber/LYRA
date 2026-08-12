import ExcelJS from 'exceljs'

// Generates the downloadable bulk-import template.
//
// The layout constants are exported so lib/xlsx-parser.ts reads data from the
// exact row this file writes to -- one source of truth for the layout, rather
// than the same magic numbers duplicated between generator and parser.

export const BULK_IMPORT_HEADER_ROW = 2
export const BULK_IMPORT_FIRST_DATA_ROW = 4
export const BULK_IMPORT_MAX_DATA_ROWS = 500

const LAST_DATA_ROW = BULK_IMPORT_FIRST_DATA_ROW + BULK_IMPORT_MAX_DATA_ROWS - 1

const INSTRUCTIONS =
  'Fill in one row per post. A post going to two platforms is two rows. ' +
  'Date: YYYY-MM-DD. Time: 24-hour HH:MM, in your workspace timezone. ' +
  'Platform: pick from the dropdown. Media URL is optional — leave blank for a text-only post. ' +
  'Delete the example row below before uploading.'

const NO_PLATFORMS_WARNING =
  'This workspace has no connected social accounts, so the Platform column has no dropdown and no row can be ' +
  'imported yet. Connect an account in Settings first, then download this template again.'

/**
 * Builds the workspace-scoped `.xlsx` template.
 *
 * The Platform column is a locked dropdown restricted to `connectedPlatforms` --
 * the same set POST /api/posts would actually accept for this workspace right
 * now -- so a row can never target a platform this workspace isn't connected to.
 */
export async function buildBulkImportTemplate(connectedPlatforms: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Posts')

  sheet.getColumn(1).width = 14 // Date
  sheet.getColumn(2).width = 10 // Time
  sheet.getColumn(3).width = 18 // Platform
  sheet.getColumn(4).width = 50 // Caption
  sheet.getColumn(5).width = 40 // Media URL

  sheet.mergeCells('A1:E1')
  sheet.getCell('A1').value = connectedPlatforms.length > 0 ? INSTRUCTIONS : NO_PLATFORMS_WARNING
  sheet.getCell('A1').font = { italic: true, size: 10 }
  sheet.getCell('A1').alignment = { wrapText: true, vertical: 'top' }
  sheet.getRow(1).height = 42

  const headerRow = sheet.getRow(BULK_IMPORT_HEADER_ROW)
  headerRow.values = ['Date', 'Time', 'Platform', 'Caption', 'Media URL']
  headerRow.font = { bold: true }

  const exampleRow = sheet.getRow(BULK_IMPORT_FIRST_DATA_ROW - 1)
  exampleRow.values = [
    '2026-09-01',
    '09:00',
    connectedPlatforms[0] ?? '',
    'EXAMPLE — delete this row before uploading',
    '',
  ]
  exampleRow.font = { italic: true, color: { argb: 'FF999999' } }

  if (connectedPlatforms.length > 0) {
    // Set per cell via the typed `cell.dataValidation` accessor rather than the
    // worksheet's own `dataValidations.add(range, ...)`, which exceljs does not
    // declare in its TypeScript definitions. The writer coalesces adjacent
    // identical validations back into a single sqref range, so the generated
    // file is no larger for it.
    const validation: ExcelJS.DataValidation = {
      type:             'list',
      allowBlank:       false,
      formulae:         [`"${connectedPlatforms.join(',')}"`],
      showErrorMessage: true,
      errorTitle:       'Invalid platform',
      error:            "Choose a platform from the dropdown. Only this workspace's connected platforms are valid.",
    }
    for (let rowNumber = BULK_IMPORT_FIRST_DATA_ROW; rowNumber <= LAST_DATA_ROW; rowNumber++) {
      sheet.getCell(`C${rowNumber}`).dataValidation = validation
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
