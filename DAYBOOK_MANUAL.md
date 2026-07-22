# Daybook — Full Feature & Technical Manual

*Covers the app as built through v21 (July 2026). Written for Craig as a complete reference — what's built, how it behaves, and how it's put together under the hood.*

---

## 1. What Daybook is

Daybook is a single-user-first, multi-user-ready life-management app: one place for tasks, projects, people/relationships, custom trackers ("Notes & Collections"), reporting, and an AI-assisted capture inbox that takes free-text/voice/SMS/WhatsApp input and files it automatically. The guiding principle used throughout: **nothing is ever silently deleted** — completed tasks, archived categories/areas, dismissed captures, and audit history all persist; the closest thing to a hard delete is the new "Delete an unused category" feature (v19), which is deliberately gated so it can never destroy real history.

The app has two "worlds" per person: a **Sample** account (a fully populated demo world you can explore and break safely) and a **Real** account (starts clean with sensible defaults). You switch between them from the sidebar at any time.

---

## 2. Navigation & shell

The whole app is one page shell (`App.tsx`) with **custom state-based routing** — there's no react-router and no URL changes; navigating is just switching an internal `page` value. Ten (or eleven, with Admin) sections live in the sidebar: Today, Overall, Inbox, Tasks, People, Projects, Collections (hidden entirely if the feature toggle is off), Reports, History, Settings, and Admin (hidden while impersonating, and hidden from non-super-admins).

The sidebar itself is draggable-width on desktop (120–340px, collapses to icon-only under 168px) and becomes a slide-in drawer with backdrop on mobile. The footer of the sidebar carries the Real/Sample account switch, a "Set password" prompt, and Sign out — all only shown once signed in to a real cloud account.

Every page's header carries: the current date, a Today/Overall segmented toggle (on those two pages only), a **global quick-capture bar** ("Quick capture — 'call David re school urgent'") that feeds straight into the AI router from anywhere in the app, and a **mic button** for one-tap voice capture (via the browser's built-in speech recognition — more in §7). A **project filter strip** appears on Today, Overall, Tasks, and Projects, letting you pin the whole view to one active/on-hold project, or to "Loose tasks" (anything with no project) — and you can drag a task onto a project chip anywhere in the app to re-file it.

### Impersonation (super-admin only)
When a super-admin opens another user's portal (from Admin → "View their portal"), a gold banner takes over the top of the screen: *"Super-admin view: {name}'s portal — exactly as they see it. This session is written to the audit trail."* Every enter/exit and every real/sample switch while impersonating is logged. Critically — when connected to the real Supabase backend, impersonated edits **write directly to that user's actual workspace**, not a throwaway copy; the local-only demo mode (no cloud connected) just seeds an in-memory copy instead, since there's nothing to isolate.

---

## 3. Today — the daily driver

The page you land on. Two data cuts:

- **"Today's tasks"** = anything `P0` priority, OR a to-call task with no due date (so a call never quietly goes stale for lack of a date), OR anything with a due date that's today or overdue. Sorted priority-first, then by due date.
- **"Attention needed"** = overdue items that didn't already make the Today cut, plus anything sitting in "Waiting on" status for 5+ days with no update.

**Morning brief** (collapsible, only shown if the feature is on): a 30-second read — top three tasks, today's suggested calls, and a one-line **AI nudge**. The nudge picks whichever is more pressing: a stalled project ("no activity for Nd — worth restarting or parking?") or a dormant contact who's drifted, falling back to "Nothing slipping today. Enjoy the margin." if neither applies.

**Capacity bar**: shows *N of {dailyCapacity} capacity*, flips to a red "over" state past the limit, with a "Rebalance" button. **Important honesty note:** Rebalance is currently a UI stub — it shows a toast ("Auto-rebalance proposed: 2 P2 items → tomorrow...") but does not actually move anything, and the "2 P2 items" text is hardcoded rather than computed. Real auto-rebalancing isn't implemented yet.

**Today's call list** (right column): built from `buildCallList` — overdue-cadence contacts (worst first), people with an open follow-up/call task due, anyone flagged "call this week," and one dormant-tier reconnect suggestion, capped at your call goal + 1. Each row has a **Log** button (opens the full call-logging dialog) and a **Snooze** button — also currently a stub (toasts but doesn't persist a snooze).

Also on this page: an **Inbox** shortcut showing how many captures are waiting to confirm, a collapsed **"By area"** roll-up (project + open-task counts per area, click through to Projects), and, if the "Dates to Remember" tracker has any entries, an **"Upcoming dates"** card (new in v21 — see §10) listing anything due in the next 30 days, nearest first, with a birthday/anniversary/other icon and a "today / tomorrow / in Nd / date" label.

---

## 4. Overall — the portfolio view

Six KPI tiles, all clickable to drill into the underlying records: Open tasks, Overdue, Projects (with stalled count), Calls this week (vs. weekly goal), Contacts overdue (dormant-tier contacts are deliberately excluded from this count), and Done this week.

**Portfolio panel**: every active area, its projects, and — as of a recent fix — any **loose tasks filed directly under the area with no project**, which previously were counted in the area's total but never actually rendered anywhere. Projects can be expanded inline to tick tasks off without leaving the page, dragged-onto to re-file a task, and their status dot reflects active (green) / stalled (red, past the stall-days threshold) / on-hold (grey). "Expand all" / "Collapse all" toggles the whole panel at once.

**Relationship health**: a progress bar per contact tier (inner/active/network/dormant) showing what percentage of that tier is currently within cadence.

---

## 5. Inbox — the AI capture triage

Everything that comes in — quick-capture, voice, the WhatsApp/SMS simulator, forwarded email (planned), and real inbound Twilio texts — lands here first as a **pending Capture** with an AI-proposed routing: kind (task/call/idea/note/entry/question), area, project, person, category, priority, due date, and a plain-English **explanation** of why the router made that call (e.g., *"'call' → to-call task · 'Yaron' matched contact"*).

Before accepting, you can **reassign the area and category inline** — the category dropdown automatically narrows to whatever's relevant for the area you've picked (see §9). Accepting files it as a real task (or tracker entry, for kind `entry`) and shows *"Filed — corrections teach the router over time."* Dismissing never deletes it — it's archived into "Recently processed," which shows the last 6 outcomes.

The right-hand panel is an explicit **WhatsApp simulator** (labeled as a placeholder for the real Business API), letting you type a message or use the mic to test how the router would classify it. If the browser's speech recognition isn't available, it falls back to a canned simulated voice note so the demo still works.

### The AI router (`routeCapture`)
This is a **keyword/pattern-based simulated router**, not a call to an LLM (yet). It recognizes explicit shorthand prefixes (`t:` task, `c:` call, `i:`/`idea:` idea, `?` question), detects call intent from words like "call/phone/ring," matches contacts by first name, matches trackers/projects by keyword overlap, assigns an area from a keyword table (e.g. "boiler/insurance/school" → Family/Home; "invoice/client/vat" → Work; "shul/dinner/chesed" → Shul), matches categories the same way (checking sub-categories like "insurance" before the broader "Money" bucket so it lands on the more specific one), and extracts simple date language ("today/urgent" → P0 due today, "tomorrow," "this week," "Thursday"). Every match appends a human-readable reason to the explanation string.

---

## 6. Tasks — the full task manager

Seven views: Today, This Week, By Area, Waiting On, Someday, Accomplished, Everything — each with its own filter logic (This Week = P0/P1 priority OR due within a week back to a week overdue; Someday = P3 items; Accomplished sorts done/dropped items newest-first and shows a "done today" / "done this week" tally). On top of the view, you can filter by search text, area, priority, and category, and a chip row of top-level categories doubles as a **drop target** — dragging a task onto a category chip re-files it (replacing its existing categories, not appending).

Subtasks: a parent task surfaces in a filtered view if it matches, or if any of its subtasks match, so a parent with one relevant subtask doesn't disappear.

**CSV export/import**: Export writes Title/Type/Area/Project/Priority/Status/Due/Created to a CSV named for the current view and date. Import is a full bulk-loader with a downloadable template (including an inline instructions row listing every valid value), a hand-written CSV parser (handles quoted fields, embedded commas/newlines), per-field validation with warnings shown in a preview step before committing (bad priority/status/type values fall back to sensible defaults with a warning rather than failing the row), and name-based matching against your existing areas/projects/categories/people/vendors.

**File attachments (new in v20)**: any existing task's detail view has an Attachments section — attach one or more real files (up to 25MB each), see them listed with size, open one in a new tab, or remove it. These are genuine files, not just links: they're stored in a private Supabase Storage bucket (`task-attachments`), scoped by database policy so only you (or a super-admin, for support) can ever read or write your own files, and uploads/downloads happen directly from the browser using your signed-in session — no server round-trip beyond Supabase itself. Only available once signed into a real cloud account; in demo/sample mode the section shows a "sign in to attach files" note instead. One known rough edge: uploading a file while a super-admin is impersonating another user currently files it under the super-admin's own storage folder rather than the impersonated user's — functionally harmless (the file still saves and opens fine) but not perfectly tidy bookkeeping; low priority to fix given how rarely that combination happens.

---

## 7. People — the relationship/CRM side

Contacts sit on four **tiers** — Inner, Active, Network, Dormant — each with a default contact cadence in days (7/14/30/90 out of the box), overridable per person. `personOverdueBy` = days since last contact minus that cadence; go over and the contact shows up in call-list building and the "Contacts overdue" KPI (dormant contacts are excluded from that specific overdue count everywhere, by design — you're allowed to let dormant contacts go quiet).

The **person detail** view has one-tap actions — log a full interaction, log a "called, nothing to report" touch instantly (skips the dialog and resets last-contact to today), flag/unflag "call this week," and change tier directly. It shows a running interaction timeline (append-only, newest first, expandable), open tasks tied to that person under "You owe them," and stat tiles for days-since-contact, cadence, and total touches. The phone/email quick-action buttons are currently stubs (they toast rather than actually dialing or drafting).

**Bulk import/export** uses real `.xlsx` files (via SheetJS) with a generated template, and — unlike task import — **merges on import**: an existing contact matched by email or exact name gets updated in place rather than duplicated, and the commit summary reports "N new, M merged."

---

## 8. Projects — grouped by area, with a WIP guardrail

Each active area lists its live projects as cards (name, priority, outcome/goal text, a done/total progress bar computed across *all* of that project's tasks including subtasks and closed ones, and status badges for on-hold/done/stalled/due date), plus — as of the recent fix — any loose tasks filed straight under the area with no project, which the empty-state copy always promised but never actually rendered until now.

**Stall detection**: any active project with no activity for `stallDays` (default 14) shows a red "stalled Nd" badge everywhere it appears.

**WIP guardrail**: Settings lets you set how many *active* projects per area is healthy (default 3, configurable — this used to be hardcoded). Go over it and the area header shows a red "{active}/{limit} — over WIP limit" badge. It's advisory only — nothing blocks you from adding more.

Opening a project shows its full task list and a status dropdown (active/on-hold/done/archived).

---

## 9. Settings — every configurable behavior

- **Focus areas**: add, rename, recolor, archive/restore (never hard-deleted), toggle inclusion in the morning brief.
- **Priority scheme**: switch the whole app's priority labels between P0–P3, High/Med/Low, or a 1–5 numeric scale, plus an independent "Eisenhower (urgent/important) matrix grouping" toggle — this toggle exists but currently has no corresponding UI anywhere else in the app; it doesn't do anything yet.
- **Categories — main/sub/secondary**, the feature most recently overhauled:
  - Two levels of hierarchy (main category, and sub-categories nested under one).
  - **Area tagging (new in v18)**: every category now has a row of small clickable area chips. Tag a category to one or more areas and it only appears in that area's dropdowns everywhere in the app (QuickAdd, task reassignment, task detail "Move to," and the Inbox capture-confirm row); leave it untagged and it keeps showing everywhere, exactly as before this feature shipped — so nothing already in use went missing the moment it launched. A "clear (show everywhere)" link untags in one click.
  - **Archive vs. permanent delete (new in v19)**: every category now shows an "in use ×N" count (tasks filed under it, pending/processed captures proposing it, or subcategories nested under it). If that count is zero, a **Delete** button appears next to Archive, with a confirm step, for a genuine permanent removal — no history to preserve, so no reason to keep clutter around. Anything actually in use only offers Archive, which keeps it out of new work while preserving every past reference.
- **Feature switchboard**: eleven on/off toggles (WhatsApp, Email forwarding, Gmail, Outlook/365, Calendar, SMS, Slack, Teams, Voice-note transcription, Notes & Collections, Morning brief). Honest status check: of these, only WhatsApp (partially — the simulator + the real Twilio inbound), SMS (real, via Twilio), Voice notes, Collections, and Morning brief have any actual logic behind them today. Gmail, Outlook, Calendar, Slack, and Teams are switches with no integration built yet — flipping them currently changes nothing else in the app.
- **Text-in capture number**: register your own phone number (E.164 format, e.g. `+15551234567`) — this is what the live Twilio SMS/WhatsApp integration matches an inbound text against to know whose Inbox to file it into. Only available once signed into a real cloud account.
- **Daily capacity & rebalancing**: tasks-per-day-before-overflow, project stall threshold (days), and the WIP guardrail limit. The section's own copy promises automatic overflow rebalancing — as noted in §3, that part isn't implemented yet; only the manual "Rebalance" button stub exists.
- **Morning brief & nudges**: channel (WhatsApp or Email) and send time.
- **Quick actions**: which one-tap buttons show on task/contact rows (Done, Called, Snooze, Reassign area).
- **Multi-user & accounts**: this section's own text still says "later phase... prove the single-user system first" — which is stale copy, since multi-user accounts, roles, invites, and impersonation are already substantially built (see §11/§12). Worth updating, but harmless as-is.

---

## 10. Collections (Notes & Collections) — user-defined trackers

A generalized structured-list system for anything that isn't a task: movies, books, subscriptions, vendors you're comparing, whatever. **Collections** group related **Trackers**; each Tracker defines its own **columns** (text, long text, number, currency, date, checkbox, 1–5 star rating, single-select, multi-select, URL, or a "status" column that also powers a kanban view) and holds **Entries**.

Columns can be marked `isTitle` (used as the entry's display name), `required`, or given a **conditional visibility rule** (`showWhen`) — e.g. a movie's "Rating" column only appears once its Status reaches "Watched." Conditional columns are marked with `*` in the table header and explained inline wherever they'd otherwise silently be missing.

Three views per tracker — table, board (kanban columns driven by the status column's option list, drag-and-drop between stages), and gallery (card grid) — with a default per tracker, overridable per session.

Each tracker gets its own generated Excel import/export template (matching its actual columns, with an instructions row listing valid values per column type), full validation on import (numbers must parse, dates must match `YYYY-MM-DD`, select/status values must be in the option list), and duplicate-title flagging (always imported as a new row rather than merged, unlike the People import).

**Full setup UI in Settings (new in v20)**: Collections and Trackers used to only exist as whatever came seeded in — there was no way to add your own. Settings now has a "Notes & Collections — set up your own trackers" section (shown whenever the Collections feature is on) where you can add a new Collection, add Trackers inside it, and — per tracker — add/rename/remove fields, set each field's type and its choice list (for single/multi-select and status fields), mark which one field is the entry's title, mark fields required, and build conditional show-when rules pointing at another field's value. Nothing extra had to be wired up for import/export or the three views to pick up new fields — since those all already read a tracker's column list dynamically, anything you define here works everywhere immediately.

**Fixed in v21**: on a brand-new tracker, "Only show when" was effectively invisible — a freshly added Status/single-choice field couldn't be picked as a dependency target until it already had saved options, unlike the seeded Movies tracker where Status's options already existed. Any select/status field can now be picked as a target as soon as it exists; if it doesn't have options yet, the "equals" value is a free-text field instead of a dropdown until you add some.

**Dates to Remember + calendar export (new in v21)**: a seeded tracker (Personal collection) for birthdays, anniversaries, and other dates worth a nudge — Name, Date, a "Repeats every year" checkbox, a Birthday/Anniversary/Other type, and Notes. Today's page surfaces anything due in the next 30 days (see §3), correctly rolling a recurring date forward to its next occurrence regardless of what year is actually on file (a birth year, an original anniversary year, whatever). Any tracker with a date column — this one, or the existing Subscriptions tracker's renewal date — gets an **"Add to Calendar"** button on its Collections toolbar that downloads a standard `.ics` file (one `VEVENT` per entry with a date, `RRULE:FREQ=YEARLY` set for anything with its recurring checkbox on) you can import into Google, Outlook, or Apple Calendar. Honest scope note: this is a one-way file export, not live two-way sync — a real Google/Outlook Calendar API integration would need OAuth consent screens and app credentials that haven't been set up. The existing "Calendar" feature toggle in Settings still does nothing (see §16); it's unrelated to this export, which works regardless of that toggle.

---

## 11. Reports & History

**Reports** has two tabs. **Exception** surfaces the things that need attention right now: overdue tasks, contacts past cadence, waiting-on items gone quiet 5+ days, stalled projects, tasks with no due date (excluding Someday-priority ones), tasks stuck In Progress for 7+ days, and — if a Subscriptions tracker exists — upcoming renewals and policies with no renewal date on file. **Standard** has bar charts for open tasks by area, calls made this week vs. goal, tasks by priority, contacts by tier, a vendor table (open items, all-time usage, rating), and a running total of active subscription costs. Honest note: the "Export to PDF/Excel" button and the standard tab's "click through to underlying items" copy are currently just a toast stub and aspirational text respectively — no file export or drill-through exists on that tab yet (the Exception cards likewise show rows but don't click through to full detail).

**History** is a straight, filterable view over the append-only audit trail — every create, edit, status change, call log, and archive action, timestamped and attributed to whoever (or whatever — "AI router" and "Super-admin" are real actor labels) did it. Nothing in this table is ever updated or deleted.

---

## 12. Admin — multi-user management

Visible to super-admins (and hidden entirely while impersonating). Shows every account with role (Owner/Member/View-only), status (Active/Invited/Suspended), which of Real/Sample workspaces they have, last-active date, and a "View their portal" shortcut into each. Actions: invite (choosing role and which of Real/Sample to provision — Sample is marked recommended so new users always land somewhere populated), change role, suspend/reactivate, delete (with an explicit warning that it removes everything in both workspaces, irreversibly), and resend/edit a still-pending invite (blocked once the person has actually signed in, to avoid wiping real data — you're told to use Delete instead in that case).

---

## 13. Capture channels in detail

| Channel | Status | How it works |
|---|---|---|
| Manual quick-capture / typed text | Live | Header bar and Inbox simulator both feed `capture(text, 'manual')` straight into the router. |
| Voice | Live (browser-dependent) | Uses the browser's built-in Web Speech API (`SpeechRecognition`) — Chrome-family browsers only, needs mic permission, English (UK) locale, single final transcript per recording (no live streaming text). No cloud transcription service is called; it's entirely client-side. Falls back to a toast telling you it's unavailable if unsupported. |
| WhatsApp / SMS simulator (Inbox page) | Demo only | Lets you test router behavior without a real message. |
| **Real inbound SMS/WhatsApp via Twilio** | **Live, shipped this session** | Each person registers their own phone number in Settings. A public Supabase Edge Function (`sms-inbound`) receives Twilio's webhook, verifies it's genuinely from Twilio (HMAC-SHA1 request signing, checked against a server-side secret — never exposed to the frontend), matches the sender's number to a profile, and files a new pending Capture straight into that person's real (never sample) workspace. Twilio texts back a confirmation or a helpful error (e.g. "this number isn't registered yet"). |
| Email forwarding | Not built | Toggle and copy exist ("capture@…"); no inbound-email handling exists yet. |

---

## 14. Data model (`src/lib/model.ts`)

Core entities: **Area** (name, color, sort order, active flag, whether it's included in the morning brief, a weekly review day), **Project** (belongs to an area; status active/on-hold/done/archived; priority; due date; outcome text; `lastActivity` for stall detection), **Task** (title, type todo/call/followup, links to area/project/parent-task/person/vendor, one or more category IDs, priority, status inbox/next/in-progress/waiting/done/dropped, due date, follow-up date, source of capture, notes, and call/waiting-specific fields), **Person** (tier, custom cadence override, last contact date, VIP and flagged-for-call booleans), **Interaction** (a logged touch — channel, purpose, outcome, sentiment, optional follow-up date), **Category** (name, parent for hierarchy, level 0/1/2, color, active flag, and the new `areaIds` array for area scoping), **Vendor**, and the Collections/Trackers/Entries trio described in §10. **Capture** wraps a raw text/source plus the AI's **RoutingProposal** and a pending/accepted/dismissed status. **AuditEvent** is the append-only log entry shape. **Settings** holds every configurable value from §9. Priority is always internally `P0`–`P3` regardless of which display scheme is active.

---

## 15. Technical architecture

**Frontend**: React 18.3, TypeScript 5.7, Vite 6.1, Tailwind CSS 3.4 (+ `tailwindcss-animate`), shadcn/ui-style components hand-built on Radix primitives (`@radix-ui/react-dialog`, `-dropdown-menu`, `-label`, `-select`, `-slot`, `-switch`), `lucide-react` for icons, `sonner` for toasts, `xlsx` (SheetJS) for the Collections/People Excel import-export, `class-variance-authority` + `clsx` + `tailwind-merge` for styling utilities. No test framework and no react-router are in the dependency list — routing is hand-rolled state, and there's currently no automated test suite (verification has been done via manual `tsc`/build checks and scripted Playwright smoke tests during development, not a committed test suite).

**Backend**: Supabase — Postgres, Auth, Row-Level Security, and Edge Functions (Deno). There's a fully normalized schema on paper (separate `tasks`, `projects`, `areas`, `categories`, `people`, etc. tables with foreign keys and RLS policies — see the project's launch guide doc for the full DDL), but **the live app currently reads and writes a single `workspace_state.data` JSON blob per workspace** rather than the normalized tables — every page's data comes from one `AppState` object round-tripped as JSON. This was a deliberate simplification during the prototype-to-live transition; the normalized tables exist but are unused (0 rows). Anything server-side that needs to touch app data (like the SMS Edge Function) reads/writes that same JSON blob directly rather than the relational tables.

**Persistence pattern**: client-side writes are debounced 800ms per workspace before being upserted to `workspace_state`; a schema-drift backfill pattern (`SETTINGS_BACKFILL`) exists specifically so that adding a new field to `Settings` later doesn't leave it silently `undefined` on accounts that were saved before that field existed — every future Settings addition should extend this same backfill.

**Auth flow**: standard Supabase email/password sign-up and sign-in, with email confirmation (configurable), "forgot password" reset emails, and invited users landing via Supabase's own invite link and setting a password from the sidebar afterward. A suspended account is blocked at the loading screen with an explicit message, before any app UI renders.

**Edge Functions** (`supabase/functions/`): `invite-user` (super-admin-only, sends a real Supabase invite email and marks the profile invited), `manage-user` (super-admin-only; `delete` removes a user and everything cascades off `auth.users`, `resend` re-invites someone who's never actually signed in yet — refuses once they have, to avoid wiping real data), and `sms-inbound` (public, Twilio-signature-verified, described in §13).

**PWA**: `vite-plugin-pwa` with auto-update, a full manifest (standalone display, themed dark-green, `any` and `maskable` icon sets), and Workbox runtime caching set to **app-shell only** — the static UI is precached and served offline via a network-first strategy with a 3-second timeout, but there's no offline queueing of writes; without a network connection you get the shell instantly instead of a blank screen, but live data still needs Supabase.

**Deployment**: Vercel, connected to a GitHub repo, auto-deploying on push. Because direct `git push` isn't available in this working environment, every frontend change ships as a versioned zip of the `src` folder for manual drag-into-GitHub; Supabase-side changes (migrations, Edge Function deploys) are applied live and directly, with no separate deploy step.

---

## 16. Known stubs, gaps & stale copy — an honest list

Worth having in one place so nothing here is mistaken for finished:

- **Auto-rebalance** (Today page "Rebalance" button) — shows a toast, moves nothing. No real overflow algorithm exists.
- **Snooze** (call-list row) — toasts, doesn't persist.
- **Contact phone/email quick-actions** (Person detail) — both stub toasts, no real dialing or drafting.
- **Reports "Export to PDF/Excel"** — stub toast, produces no file. The standard tab's "results click through to the underlying items" footer copy is aspirational; nothing on that tab is actually clickable.
- **Eisenhower matrix toggle** (Settings → Priority scheme) — the switch exists and saves, but nothing in Dashboard or Tasks reads it yet.
- **Feature toggles with no logic behind them**: Gmail, Outlook/365, Calendar, Slack, Teams. Flipping these currently has zero effect elsewhere in the app — note the Settings "Calendar" toggle is unrelated to the real `.ics` export described in §10, which isn't gated by it.
- **Calendar sync is one-way `.ics` export, not live sync** — no Google/Outlook Calendar API integration exists yet (would need OAuth credentials/consent screens); a downloaded `.ics` file won't reflect later edits made in Daybook.
- **"Corrections teach the router over time"** (Inbox accept toast) — no learning/feedback loop is implemented; the router is static keyword matching.
- **Admin → real-mode `listUsers`** hardcodes `hasSample: true, hasReal: true` for every account rather than checking which workspaces actually exist for that user — a simplification versus the local demo data, which tracks it properly.
- **Settings → "Multi-user & accounts"** section text is stale — it still describes multi-user as a future phase, when Admin/roles/invites/impersonation are already substantially built.
- **Email-forward capture** — toggle and "capture@…" copy exist; no inbound-email handling exists.
- Sub-tracker/Collections duplicate detection **always imports as new** rather than offering a merge (unlike the People import, which does merge).

None of these are things the rest of the app depends on to function — they're clearly flagged here so future work (yours or mine) knows exactly what's real versus what's currently just the intended shape of a feature.

---

## 17. Recent change log (this session)

1. AI-capture routing now also infers Category; accepting a capture in Inbox no longer discards manual corrections; Categories in Settings gained rename/archive.
2. Fixed to-call tasks disappearing from Today (they now always surface when undated, but respect a deliberately-set future due date).
3. Fixed loose (no-project) tasks never rendering in Overall → Portfolio and on the Areas & Projects page, and added the missing task-detail dialog mount on the latter.
4. Made the project WIP guardrail configurable in Settings (previously hardcoded at 3), with a backfill so existing accounts don't silently load it as `undefined`.
5. Built real inbound SMS/WhatsApp capture via Twilio — each person registers their own number; a signature-verified Edge Function files inbound texts straight into their Inbox.
6. **v18** — Categories can now be tagged to specific focus areas, so every area-scoped category picker in the app only shows what's relevant.
7. **v19** — Unused categories can be permanently deleted (with an "in use ×N" indicator and a confirm step); anything actually in use still only offers Archive.
8. **v20** — Tasks can now have real files attached (private Supabase Storage, per-user access control); Settings gained a full setup UI for creating your own Collections/Trackers and defining each one's fields from scratch, automatically wired into every existing view and the Excel import/export templates.
9. **v21** — Fixed "Only show when" being unusable on newly created trackers (a fresh Status field couldn't be picked as a dependency target until it already had options). Added a "Dates to Remember" tracker for birthdays/anniversaries/other dates with an "Upcoming dates" widget on Today, plus a general "Add to Calendar" `.ics` export for any tracker with a date column.
