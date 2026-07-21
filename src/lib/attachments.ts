// File attachments for tasks — backed by a private Supabase Storage bucket
// ('task-attachments'). Objects live at {ownerId}/{workspaceId}/{taskId}/{fileId}-{filename};
// Storage RLS policies (see the `add_task_attachments_storage_bucket` migration) restrict
// reads/writes to files under the signed-in user's own ownerId folder (or a super-admin,
// for impersonation), so uploads/downloads/deletes all happen directly from the browser
// using the user's own session — no Edge Function needed in the loop.
import { supabase } from './supabase'
import { TaskAttachment, uid } from './model'

export const ATTACHMENTS_BUCKET = 'task-attachments'
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // matches the bucket's file_size_limit

export function attachmentsAvailable(): boolean {
  return !!supabase
}

export async function uploadAttachment(
  ownerId: string,
  workspaceId: string,
  taskId: string,
  file: File,
): Promise<{ attachment?: TaskAttachment; error?: string }> {
  if (!supabase) return { error: 'Sign in to a real account to attach files.' }
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: `${file.name} is over the 25MB limit.` }
  const fileId = uid('f')
  const safeName = file.name.replace(/[^\w.\-() ]/g, '_')
  const path = `${ownerId}/${workspaceId}/${taskId}/${fileId}-${safeName}`
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) return { error: error.message }
  return {
    attachment: {
      id: fileId, name: file.name, path, size: file.size,
      type: file.type || 'application/octet-stream', uploadedAt: new Date().toISOString(),
    },
  }
}

export async function getAttachmentUrl(path: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 3600)
  if (error || !data) return null
  return data.signedUrl
}

export async function deleteAttachmentFile(path: string): Promise<string | null> {
  if (!supabase) return 'Sign in to a real account to manage attachments.'
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path])
  return error ? error.message : null
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
