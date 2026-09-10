import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileText, FileImage, FileArchive, File as FileIcon, Loader2, Trash2, Upload, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Project, fmtDateLong } from '@/lib/model'
import { useStore } from '@/lib/store'
import { useCloud } from '@/lib/cloud'
import {
  attachmentsAvailable, deleteAttachmentFile, fmtBytes, getAttachmentUrl, uploadProjectDocument,
} from '@/lib/attachments'

/**
 * The project's Documents tab — a home for everything that isn't a task: contracts, briefs, plans,
 * quotes, images, PDFs, spreadsheets, any file type. Files live in the same private storage as task
 * attachments (only the owner, plus a super-admin for support, can read them) and are filed under
 * the project so they travel with it.
 */
export function ProjectDocuments({ project }: { project: Project }) {
  const cloud = useCloud()
  const { addProjectDocument, removeProjectDocument } = useStore()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const docs = useMemo(
    () => [...(project.documents ?? [])].sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? '')),
    [project.documents],
  )

  async function handleFiles(files: FileList | File[]) {
    if (!cloud) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const { attachment, error } = await uploadProjectDocument(cloud.profile.id, cloud.saveKey, project.id, file)
      if (error) toast.error(error)
      else if (attachment) { addProjectDocument(project.id, attachment); toast.success(`${file.name} added`) }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function open(path: string) {
    const url = await getAttachmentUrl(path)
    if (!url) { toast.error('Couldn’t open that file — try again in a moment'); return }
    window.open(url, '_blank', 'noopener')
  }

  async function remove(id: string, path: string, name: string) {
    const err = await deleteAttachmentFile(path)
    if (err) { toast.error(err); return }
    removeProjectDocument(project.id, id)
    toast(`${name} removed`)
  }

  const canUpload = attachmentsAvailable() && !!cloud

  return (
    <div className="flex flex-col gap-3">
      {canUpload && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) }}
          className={cn(
            'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-border bg-card',
          )}
        >
          <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
          <p className="text-[13px] mt-2">Drag files here, or{' '}
            <button className="text-primary font-medium underline-offset-2 hover:underline" onClick={() => fileRef.current?.click()}>browse</button>.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Any file type · up to 25MB each · private to you</p>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
          {uploading && <p className="text-[12px] text-muted-foreground mt-2 inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading…</p>}
        </div>
      )}

      {!canUpload && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-[13px] text-muted-foreground">Sign in to a real account to upload and store project documents.</p>
        </div>
      )}

      {docs.length === 0 ? (
        canUpload && <p className="text-[12.5px] text-muted-foreground text-center py-2">No documents yet — add the project’s contracts, briefs, plans or images above.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-sm divide-y divide-border/70 overflow-hidden">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors">
              <span className="shrink-0 text-muted-foreground"><DocIcon type={d.type} /></span>
              <button className="min-w-0 flex-1 text-left" onClick={() => open(d.path)} title="Open">
                <span className="block truncate text-[13.5px] font-medium hover:underline">{d.name}</span>
                <span className="block text-[11px] text-muted-foreground">{fmtBytes(d.size)}{d.uploadedAt && ` · added ${fmtDateLong(d.uploadedAt.slice(0, 10))}`}</span>
              </button>
              <button className="shrink-0 grid place-items-center h-7 w-7 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent" title="Open / download" onClick={() => open(d.path)}>
                <Download className="h-3.5 w-3.5" />
              </button>
              <button className="shrink-0 grid place-items-center h-7 w-7 rounded-sm text-muted-foreground hover:text-[hsl(8_60%_41%)] hover:bg-accent" title="Remove" onClick={() => remove(d.id, d.path, d.name)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DocIcon({ type }: { type: string }) {
  if (type.startsWith('image/')) return <FileImage className="h-4 w-4" />
  if (type === 'application/pdf') return <FileText className="h-4 w-4" />
  if (type.includes('zip') || type.includes('compressed')) return <FileArchive className="h-4 w-4" />
  return <FileIcon className="h-4 w-4" />
}
