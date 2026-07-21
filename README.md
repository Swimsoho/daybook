# Daybook

Personal life-management platform: capture anything, organize across focus areas,
track people and promises, get a morning brief. Built per the Project Dashboard v4 spec.

## Deploy (once)

1. **Supabase** — create a project, then in SQL Editor run `supabase/migrations/0001_init.sql`.
   Deploy the invite function: `supabase/functions/invite-user/index.ts`
   (Dashboard → Edge Functions → New function → name it `invite-user` → paste the code)
   or ask Claude to deploy it via the Supabase connector.
2. **Vercel** — import this repo, framework Vite, add env vars from `.env.example`:
   - `VITE_SUPABASE_URL` (Project Settings → API → Project URL)
   - `VITE_SUPABASE_ANON_KEY` (Project Settings → API → anon/publishable key)
3. In Supabase → Authentication → URL Configuration, set the Site URL to your Vercel URL.
4. Open the site, **create your account with yisroelswimmer@gmail.com** — that email is
   auto-promoted to super-admin by the sign-up trigger. Invite everyone else from the Admin page.

No env vars → the app runs as an offline demo with sample data (nothing is saved).

## Notes

- Every user gets two workspaces on sign-up: **Real** (clean, defaults seeded on first open)
  and **Sample** (full demo world). Switch in the sidebar.
- Data isolation is enforced by Postgres row-level security; the super-admin bypass is
  intentional and every impersonation is stamped into the in-app audit trail.
- v1 persists each workspace as a JSON document (`workspace_state`) with an 800 ms
  debounced autosave. Normalizing into per-entity tables (see the launch guide) is the
  next step when server-side reporting/WhatsApp routing arrives.
