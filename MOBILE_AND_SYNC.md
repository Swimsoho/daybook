# Mobile layout + multi-device sync

Two changes, in one repo. Read the deploy order before shipping.

---

## 1. The mobile layout is now part of this app

`src/mobile/` holds the phone layout. It is **not a separate application**: it
calls the same `useStore()`, renders the same `AppState`, and saves through the
same path as the desktop shell. There is no second data model, no second auth,
no copy of `model.ts` to keep in step.

`src/App.tsx` picks a layout inside `Shell`:

```tsx
if (isMobile) return <MobileShell onSwitchToDesktop={...} />
```

Under 768px you get the phone layout; above it, the desktop one. That's the same
breakpoint the sidebar already used to become a drawer. A saved override
(`localStorage: daybook.layout`) beats the width, so "Open the desktop layout"
in mobile Settings works, and you can force the phone layout on a laptop to
check the design.

### What's on the phone

The tab bar carries the daily loop — **Today, Inbox, Tasks, People** — and
**More** is a hub for **Overall, Projects, Collections, Reports, History,
Settings**. Eleven sidebar items don't fit a phone tab bar; nothing was dropped.

Mobile Settings deliberately covers only palette, daily capacity and call goal.
Focus areas, categories, actions, tiers, tracker design, feature toggles,
messaging and admin stay on desktop — configuration you do sitting down. Same
store either way, so a change on the phone *is* the change on the laptop.

Deleting collection entries and editing tracker fields are also desktop-only,
for the same reason.

---

## 2. Two devices can no longer overwrite each other

### The problem

A workspace is one `workspace_state.data` JSON document, previously saved with a
blind `upsert`. Whoever saved last replaced **the whole document**. Two browser
tabs, or a laptop and a phone, silently destroyed each other's work — not one
field, everything the other had done since it loaded. Adding a phone makes this
far likelier, because phones sit suspended holding stale copies.

### The fix

**`supabase/migrations/0006_workspace_state_sync.sql`**

- `version` on `workspace_state`, bumped by a trigger on every write
- `save_workspace_state(workspace_id, data, expected_version)` — saves only if
  the caller's version still matches, otherwise returns the current row instead
  of overwriting
- `workspace_state` added to the realtime publication

Additive and idempotent. Existing rows get version 0; nothing is dropped. An old
client still doing a blind upsert keeps working.

**`src/lib/sync.ts`** turns a rejected save into a merge. It knows the state we
last agreed with the server on (`base`), what we have now (`mine`), and what the
server has now (`theirs`) — enough to replay only *our* changes on top of the
other client's work.

The merge is **per record, not per document**:

| Situation | Result |
|---|---|
| You complete a task on the phone, the laptop renames a different one | both survive |
| Both edit the same task | later save wins **that record only**; every other edit on both sides survives |
| You delete a task, they edit another | your delete stands, their edit stands |
| A webhook files a Telegram capture mid-edit | the capture arrives, your edit stands |
| You change the theme, they change daily capacity | both apply — settings merge field by field |
| Audit trail | union, newest first, nothing ever dropped |
| No baseline (we never loaded) | takes the server's copy, rather than overwriting their saved work with our unsaved edit |

`src/lib/sync.test.ts` covers each of those. `npm test`.

**Live updates.** Each client subscribes to its own workspace. When another
device saves, the change is merged and appears — no reload, no waiting for a
collision. RLS applies to realtime, so you only ever receive your own rows.

### If the migration isn't applied yet

The app detects the missing function, falls back to the old unguarded save, and
shows a one-time warning: *"Multi-device protection is off."* Nothing breaks —
you're simply back to the old risk until the migration runs.

---

## 3. Projects have phases

Areas hold projects and projects hold tasks. That's enough for "book the hall,
send the invitations" and not enough for a build with a sequence — a long project
reads as forty rows in one column, with no way to see that the first block is
finished and the third hasn't started.

`Milestone` adds the level between. It is deliberately thin: a name, an optional
subtitle ("Phase 1 · Weeks 1–3"), an order and an optional date.

**A phase never contains its tasks — tasks point at it.** That asymmetry is the
whole design:

| You do this | What happens to the work |
|---|---|
| Rename or reorder a phase | nothing — tasks aren't touched |
| Delete a phase | its tasks stay on the project, under **No phase** |
| Move a project's tasks elsewhere | the phase link clears; tasks keep everything else |
| A task points at a missing phase | it renders under **No phase**, never disappears |

Phases are opt-in. A project without them behaves exactly as it did before, and
no existing project gets any — inventing phases would rearrange a plan nobody
asked us to touch. The sample workspace has three on the Shul dinner so the
feature is discoverable.

### Dependencies

`Task.blockedBy` names other tasks that have to finish first. This is distinct
from `waitingOn`, which is free text for waiting on a *person*.

Nothing is enforced — a plan that refuses to let you work out of order is a plan
people work around. A task with an open blocker is flagged, and stops being
flagged the moment the blocker is done. The picker walks the dependency graph and
hides anything downstream, so a cycle can't be built through the UI; deleting a
task strips its id from everything that was waiting on it, so no dependency is
left pointing at nothing.

### The project board

Opening a project now gives you a stat strip (tasks / done / in progress /
unassigned / blocked / top-priority open), filters for phase, owner, status and
priority, and each phase as its own section with its own `n of m done`.

Progress bars always count the **unfiltered** phase — a bar that moved because
you ticked "hide done" would be telling you something untrue.

"Owner" is the task's existing contact person, not a new field. A task assigned
to someone therefore shows up on their contact card, which is the behaviour you
want and the reason not to add a fourth person-shaped field alongside `personId`,
`waitingOn` and `shared.sharedWith`.

`src/lib/milestones.ts` holds the arithmetic so both layouts count identically;
`src/lib/milestones.test.ts` covers it.

---

## Deploy order

1. **Apply the migration first.** Supabase dashboard → SQL Editor → paste
   `supabase/migrations/0006_workspace_state_sync.sql` → Run. Safe to re-run.
   *Phases need no migration* — the workspace is one JSON blob, and accounts
   saved before phases existed are backfilled with an empty list on load.
2. **Then deploy the app.** Order isn't critical (step 1 doesn't break the old
   client, and the new client tolerates step 1 being missing), but doing it this
   way means you're never running unprotected.
3. **Check it.** Open the app on a laptop and a phone, signed into the same
   account. Complete a task on one; it should appear done on the other within a
   second or two. Then edit different tasks on each at the same time and confirm
   both edits survive.

## Rolling back

- **The app:** revert the commit. The old blind-upsert path is gone from the new
  code, but the database function is additive — an older build simply ignores it.
- **The migration:** leaving it applied is harmless. To remove it anyway:

```sql
drop function if exists save_workspace_state(uuid, jsonb, bigint);
drop trigger if exists workspace_state_version on workspace_state;
drop function if exists bump_workspace_state_version();
-- keep the column; dropping it loses nothing but costs a table rewrite
```

## Working locally

```bash
npm install
cp .env.example .env    # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev             # narrow the window under 768px to see the phone layout
npm run typecheck
npm test
```
