import React, { useEffect, useState } from 'react'
import { Cloud } from '@/lib/cloud'
import { toast } from 'sonner'
import { Eye, KeyRound, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { AdminUser, Role, fmtDate } from '@/lib/model'
import { useStore } from '@/lib/store'
import { KpiTile, SectionTitle } from '@/components/bits'

export default function AdminPage({ onViewPortal, cloud }: { onViewPortal: (user: AdminUser, mode: 'sample' | 'real') => void; cloud?: Cloud }) {
  const { state, inviteUser, updateAdminUser, removeAdminUser } = useStore()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [liveUsers, setLiveUsers] = useState<AdminUser[] | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [resendTarget, setResendTarget] = useState<AdminUser | null>(null)

  const reload = React.useCallback(() => {
    if (cloud) cloud.admin.listUsers().then(setLiveUsers)
  }, [cloud])
  useEffect(() => { reload() }, [reload])

  const users = liveUsers ?? state.adminUsers
  const active = users.filter(u => u.status === 'active').length
  const invited = users.filter(u => u.status === 'invited').length

  // one set of handlers, live or demo
  const doInvite = async (u: { name: string; email: string; role: Role; hasSample: boolean; hasReal: boolean }) => {
    if (cloud) {
      const err = await cloud.admin.invite({ name: u.name, email: u.email, role: u.role })
      if (err) { toast.error(`Invite failed: ${err}`) }
      else { toast.success(`Invite emailed to ${u.email} — both accounts provision on first sign-in`); reload() }
    } else {
      inviteUser(u)
      toast.success(`Invite sent to ${u.email} (simulated)`)
    }
  }
  const doRole = async (u: AdminUser, role: Role) => {
    if (cloud) { await cloud.admin.setRole(u.id, role); reload() }
    else updateAdminUser(u.id, { role }, `role → ${role}`)
    toast(`${u.name} → ${role}`)
  }
  const doStatus = async (u: AdminUser) => {
    const next = u.status === 'suspended' ? 'active' as const : 'suspended' as const
    if (cloud) { await cloud.admin.setStatus(u.id, next); reload() }
    else updateAdminUser(u.id, { status: next }, next)
    toast(next === 'suspended' ? `${u.name} suspended — data preserved, sign-in blocked` : `${u.name} reactivated`)
  }
  const doDelete = async (u: AdminUser) => {
    if (cloud) {
      const err = await cloud.admin.deleteUser(u.id)
      if (err) { toast.error(`Couldn't delete: ${err}`); return }
      reload()
    } else {
      removeAdminUser(u.id)
    }
    toast.success(`${u.name} removed — account and data deleted permanently`)
    setDeleteTarget(null)
  }
  const doResend = async (u: AdminUser, corrected: { name: string; email: string; role: Role }) => {
    if (cloud) {
      const err = await cloud.admin.resendInvite(u.id, corrected)
      if (err) { toast.error(err); return }
      reload()
      toast.success(`Invite re-sent to ${corrected.email}`)
    } else {
      updateAdminUser(u.id, corrected, 're-invited with corrected details')
      toast.success(`Invite re-sent to ${corrected.email} (simulated)`)
    }
    setResendTarget(null)
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 border border-[hsl(40_50%_60%)] bg-[hsl(40_65%_42%_/_0.1)] px-3 py-1.5 rounded-sm">
          <ShieldCheck className="h-4 w-4 text-[hsl(40_65%_36%)]" />
          <span className="text-[12.5px]"><b>Super-admin</b> — Craig. Every action here, impersonation especially, is written to the audit trail and clearly marked.</span>
        </div>
        <Button size="sm" className="h-8 ml-auto" onClick={() => setInviteOpen(true)}><UserPlus className="h-3.5 w-3.5 mr-1.5" />Invite user</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiTile label="Accounts" value={users.length} sub="all users" />
        <KpiTile label="Active" value={active} tone="good" sub="signed in this month" />
        <KpiTile label="Invited" value={invited} sub="awaiting first sign-in" />
        <KpiTile label="Isolation" value="Per-user" sub="no one sees another's data" />
      </div>

      <section className="border border-border bg-card shadow-sm overflow-x-auto">
        <div className="px-4 pt-3 pb-1"><SectionTitle className="mb-0">Users</SectionTitle></div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
              <th className="px-4 py-2 font-semibold">User</th>
              <th className="px-2 py-2 font-semibold">Role</th>
              <th className="px-2 py-2 font-semibold">Status</th>
              <th className="px-2 py-2 font-semibold">Accounts</th>
              <th className="px-2 py-2 font-semibold">Last active</th>
              <th className="px-2 py-2 font-semibold">View their portal</th>
              <th className="px-2 py-2 font-semibold">Manage</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{u.name}{u.isSuperAdmin && <span className="text-[9.5px] align-top text-[hsl(40_65%_36%)] font-bold ml-1">SUPER</span>}</div>
                  <div className="text-[11.5px] text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-2 py-2.5">
                  {u.isSuperAdmin ? <span className="text-[12px]">Owner</span> : (
                    <Select value={u.role} onValueChange={v => doRole(u, v as Role)}>
                      <SelectTrigger className="h-7 w-[110px] text-[12px] bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="view-only">View-only</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <span className={cn(
                    'text-[10.5px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-sm border',
                    u.status === 'active' && 'text-[hsl(152_25%_30%)] border-[hsl(152_20%_60%)] bg-[hsl(152_25%_38%_/_0.08)]',
                    u.status === 'invited' && 'text-[hsl(28_60%_30%)] border-[hsl(35_50%_65%)] bg-[hsl(35_70%_88%_/_0.5)]',
                    u.status === 'suspended' && 'text-[hsl(8_60%_38%)] border-[hsl(8_40%_65%)] bg-[hsl(8_60%_45%_/_0.07)]',
                  )}>{u.status}</span>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex gap-1">
                    {u.hasReal && <span className="text-[10.5px] border border-border rounded-sm px-1.5 py-0.5 bg-background">Real</span>}
                    {u.hasSample && <span className="text-[10.5px] border border-dashed border-border rounded-sm px-1.5 py-0.5 text-muted-foreground">Sample</span>}
                  </div>
                </td>
                <td className="px-2 py-2.5 tabular text-muted-foreground">{u.lastActive ? fmtDate(u.lastActive) : '—'}</td>
                <td className="px-2 py-2.5">
                  <div className="flex gap-1.5">
                    {u.hasReal && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onViewPortal(u, 'real')}>
                        <Eye className="h-3 w-3 mr-1" />Real
                      </Button>
                    )}
                    {u.hasSample && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onViewPortal(u, 'sample')}>
                        <Eye className="h-3 w-3 mr-1" />Sample
                      </Button>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  {!u.isSuperAdmin && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" title="Send a password reset"
                        onClick={() => toast.success(`Password reset sent to ${u.email} (simulated)`)}>
                        <KeyRound className="h-3 w-3" />
                      </Button>
                      {u.status === 'invited' && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setResendTarget(u)}>Edit &amp; re-send</Button>
                      )}
                      <Button size="sm" variant="ghost" className={cn('h-7 px-2 text-[11px]', u.status !== 'suspended' && 'text-[hsl(8_60%_41%)]')}
                        onClick={() => doStatus(u)}>
                        {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-[hsl(8_60%_41%)]" title="Delete permanently"
                        onClick={() => setDeleteTarget(u)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-[11.5px] text-muted-foreground leading-relaxed max-w-[720px]">
        Accounts run on standard sign-up / log-in with self-service password reset and optional two-factor.
        Each user keeps their own data and settings; the sample account is a seeded demo world they can explore
        and reset freely, while their real account starts clean with sensible defaults. Impersonation lets you see
        a user's system exactly as they do — without ever knowing their password — and is always visible in the trail.
      </p>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onInvite={doInvite} />
      <DeleteUserDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={doDelete} />
      <ResendInviteDialog user={resendTarget} onClose={() => setResendTarget(null)} onConfirm={doResend} />
    </div>
  )
}

function DeleteUserDialog({ user, onClose, onConfirm }: {
  user: AdminUser | null
  onClose: () => void
  onConfirm: (u: AdminUser) => void
}) {
  return (
    <Dialog open={!!user} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle className="font-display text-lg">Delete {user?.name}?</DialogTitle></DialogHeader>
        <p className="text-[13px] leading-relaxed">
          This permanently deletes <b>{user?.email}</b>'s account and everything in it — every task, contact, project
          and tracker entry, in both their real and sample workspaces. This cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="bg-[hsl(8_60%_41%)] hover:bg-[hsl(8_60%_36%)] text-white" onClick={() => user && onConfirm(user)}>Delete permanently</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResendInviteDialog({ user, onClose, onConfirm }: {
  user: AdminUser | null
  onClose: () => void
  onConfirm: (u: AdminUser, corrected: { name: string; email: string; role: Role }) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')

  useEffect(() => {
    if (user) { setName(user.name); setEmail(user.email); setRole(user.role) }
  }, [user])

  return (
    <Dialog open={!!user} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="font-display text-lg">Edit &amp; re-send invite</DialogTitle></DialogHeader>
        <p className="text-[12.5px] text-muted-foreground -mt-1">
          Fix the name, email, or role below — this cancels the old pending invite and sends a fresh one.
          Only available while they haven't yet signed in.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5"><Label className="text-xs">Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="grid grid-cols-1 gap-1.5"><Label className="text-xs">Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={v => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="view-only">View-only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => {
            if (!name.trim() || !email.includes('@')) { toast.error('Name and a valid email are needed'); return }
            if (user) onConfirm(user, { name, email, role })
          }}>Re-send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InviteDialog({ open, onClose, onInvite }: {
  open: boolean
  onClose: () => void
  onInvite: (u: { name: string; email: string; role: Role; hasSample: boolean; hasReal: boolean }) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [hasSample, setHasSample] = useState(true)
  const [hasReal, setHasReal] = useState(true)

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle className="font-display text-lg">Invite a user</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid grid-cols-1 gap-1.5"><Label className="text-xs">Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="grid grid-cols-1 gap-1.5"><Label className="text-xs">Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={v => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner — full control of their account</SelectItem>
                <SelectItem value="member">Member — use everything, no user admin</SelectItem>
                <SelectItem value="view-only">View-only — read but never change</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-2 border border-border rounded-sm p-3 bg-accent/30">
            <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Accounts to provision</span>
            <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
              <input type="checkbox" checked={hasReal} onChange={e => setHasReal(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" />
              <span><b>Real account</b><span className="block text-[11.5px] text-muted-foreground">Starts clean — areas, categories, tiers and trackers seeded, no data</span></span>
            </label>
            <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
              <input type="checkbox" checked={hasSample} onChange={e => setHasSample(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" />
              <span><b>Sample account</b> <span className="text-[10.5px] text-[hsl(40_65%_36%)] font-semibold">RECOMMENDED</span><span className="block text-[11.5px] text-muted-foreground">A fully-populated demo world to explore safely; they can switch between the two at sign-in</span></span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => {
            if (!name.trim() || !email.includes('@')) { toast.error('Name and a valid email are needed'); return }
            if (!hasSample && !hasReal) { toast.error('Pick at least one account to provision'); return }
            onInvite({ name, email, role, hasSample, hasReal })
            setName(''); setEmail(''); onClose()
          }}>Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
