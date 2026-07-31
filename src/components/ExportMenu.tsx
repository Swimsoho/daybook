import React from 'react'
import { Download, FileSpreadsheet, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ViewExport, exportViewToPdf, exportViewToXlsx } from '@/lib/exportView'

// Drop-in Excel + PDF export button used on every list page. `getData` is called at click time so
// the export always reflects the current search / filter / sort — pass a function that builds the
// headers/rows from whatever's on screen right now.
export function ExportMenu({ getData, className, label = 'Export' }: {
  getData: () => ViewExport
  className?: string
  label?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className ?? 'h-8'}>
          <Download className="h-3.5 w-3.5 mr-1.5" />{label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportViewToXlsx(getData())}>
          <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportViewToPdf(getData())}>
          <Printer className="h-3.5 w-3.5 mr-2" />Print / Save as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
