import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'

// ---------- Download: real .xlsx workbook (not a CSV wearing an Excel hat) ----------

export function downloadXlsxTemplate(filename: string, sheetName: string, rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0)
  ws['!cols'] = Array.from({ length: colCount }, (_, i) => {
    const maxLen = rows.reduce((m, r) => Math.max(m, String(r[i] ?? '').length), 8)
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Sheet1')
  XLSX.writeFile(wb, filename)
}

// ---------- Download: same idea, but with real in-cell dropdowns ----------
//
// Whichever columns get a `values` list (an area, a category, a select/status field — anything
// backed by a fixed, known set) become an actual Excel/Sheets data-validation dropdown, not just
// documentation text. The valid values live on a hidden "Lists" sheet (so there's no ~255-char
// inline-list limit and the sheet stays uncluttered), and every data row in the template — plus a
// few hundred blank ones below it, so pasting/adding more rows still gets the dropdown — points at
// that range. Typing something outside the list still works (Excel warns but doesn't hard-block by
// default here), so this is a strong nudge toward valid values, not a replacement for the app's own
// import-time validation, which still runs and still falls back gracefully on anything that slips
// through (a stale value, a paste that skips validation, editing in a tool that ignores it, etc).
export interface ColumnDropdown {
  col: number // 0-indexed, matches the header row passed in `rows[0]`
  values: string[]
}

export async function downloadXlsxTemplateWithDropdowns(
  filename: string,
  sheetName: string,
  rows: (string | number)[][],
  dropdowns: ColumnDropdown[] = [],
  extraBlankRows = 300,
) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName.slice(0, 31) || 'Sheet1')
  ws.addRows(rows)

  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0)
  for (let i = 0; i < colCount; i++) {
    const maxLen = rows.reduce((m, r) => Math.max(m, String(r[i] ?? '').length), 8)
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 10), 60)
  }
  ws.getRow(1).font = { bold: true }

  const usable = dropdowns.filter(d => d.values.length > 0)
  if (usable.length > 0) {
    const listSheet = wb.addWorksheet('Lists')
    listSheet.state = 'veryHidden'
    const lastRow = rows.length + extraBlankRows
    usable.forEach((d, listCol) => {
      d.values.forEach((v, i) => { listSheet.getCell(i + 1, listCol + 1).value = v })
      const colLetter = listSheet.getColumn(listCol + 1).letter
      const ref = `Lists!$${colLetter}$1:$${colLetter}$${d.values.length}`
      const targetCol = ws.getColumn(d.col + 1).letter
      for (let r = 2; r <= lastRow; r++) {
        ws.getCell(`${targetCol}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [ref],
          showErrorMessage: false,
        }
      }
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ---------- Upload: accepts .xlsx *or* .csv, returns a plain string grid ----------

export async function parseSpreadsheetFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    return parseCsvText(await file.text())
  }
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as (string | number)[][]
  return grid
    .map(r => r.map(c => String(c ?? '').trim()))
    .filter(r => r.some(c => c !== ''))
}

function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', inQ = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQ) {
      if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++ } else inQ = false } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some(c => c.trim() !== '')) rows.push(row)
      row = []
    } else cur += ch
  }
  row.push(cur)
  if (row.some(c => c.trim() !== '')) rows.push(row)
  return rows
}

export const SPREADSHEET_ACCEPT = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'
