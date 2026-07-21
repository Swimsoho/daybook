import React, { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'

// Global project selector chips. Click to filter; DRAG A TASK ONTO A CHIP to re-file it.
export function ProjectFilterBar({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { state, updateTask } = useStore()
  const [dragOver, setDragOver] = useState<string | null>(null)
  const projects = state.projects.filter(p => p.status === 'active' || p.status === 'on-hold')

  function handleDrop(e: React.DragEvent, projectId: string | null) {
    e.preventDefault()
    setDragOver(null)
    const taskId = e.dataTransfer.getData('text/task-id')
    if (!taskId) return
    const pid = projectId === '__none__' ? null : projectId
    const proj = state.projects.find(p => p.id === pid)
    updateTask(
      taskId,
      { projectId: pid ?? undefined, ...(proj ? { areaId: proj.areaId } : {}) },
      proj ? `dragged onto project ${proj.name}` : 'dragged out of its project',
    )
    toast.success(proj ? `Re-filed under ${proj.name}` : 'Removed from its project')
  }

  const chip = (id: string | null, label: string, color?: string) => {
    const selected = value === id
    const isOver = dragOver === (id ?? 'none')
    return (
      <button
        key={id ?? 'none'}
        onClick={() => onChange(selected ? null : id)}
        onDragOver={e => { e.preventDefault(); setDragOver(id ?? 'none') }}
        onDragLeave={() => setDragOver(null)}
        onDrop={e => handleDrop(e, id)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] border rounded-full whitespace-nowrap transition-all shrink-0',
          selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-accent',
          isOver && 'ring-2 ring-[hsl(17_63%_47%)] scale-105 border-[hsl(17_63%_47%)]',
        )}
      >
        {color && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />}
        {label}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground shrink-0 mr-1">Projects</span>
      {value !== null && (
        <button onClick={() => onChange(null)} className="shrink-0 text-[11.5px] text-[hsl(17_63%_40%)] hover:underline mr-0.5">✕ clear</button>
      )}
      {projects.map(p => {
        const area = state.areas.find(a => a.id === p.areaId)
        return chip(p.id, p.name, area?.color)
      })}
      {chip('__none__', 'Loose tasks')}
      <span className="text-[10.5px] text-muted-foreground italic shrink-0 ml-1">click to filter · drag a task onto a chip to re-file it</span>
    </div>
  )
}
