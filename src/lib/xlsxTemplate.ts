import * as XLSX from 'xlsx'

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
