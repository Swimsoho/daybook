# Daybook — The Dummies Guide

**Two things, start to finish, no tech background assumed: (1) getting your contacts into Daybook, and (2) getting the Telegram daily reminder working.**

*Written for Craig · July 2026. Every step spells out exactly what to click and what you'll see. Where a step is "hand this to Claude," it says so. Take it slow — none of this can break your Daybook data.*

---

# PART 1 — CONTACTS

There are **two ways** to get your contacts in. Read this one paragraph first, then jump to whichever you want.

- **Way A — Import a file (works right now, zero setup, ~5 minutes).** You export your address book from Gmail / iPhone / Outlook / Yahoo as a file, and drop that file into Daybook. It's already built and waiting. Best if you just want everyone in *today*. Downside: it's a one-time snapshot — add a new contact on your phone next month and you'd re-import to pull them in (which is safe — it never makes duplicates).
- **Way B — Live sync (needs a one-time setup, then it's automatic).** Daybook connects straight to your Google or Microsoft account and keeps contacts up to date on its own. This one needs a ~15-minute registration on Google's / Microsoft's developer site, and then a short build step from me. Best if you want it hands-off going forward.

**My honest recommendation:** do **Way A now** so you have all your contacts in Daybook in five minutes — then decide later whether the live sync in Way B is worth the extra setup. They don't conflict; you can do both.

> **iCloud (iPhone) and Yahoo can only use Way A.** Neither company offers a way for an app to sync their contacts live — I checked. So for those, the file import *is* the way in. Google and Outlook can do either.

---

## WAY A — Import your contacts from a file (do this now)

### Step 1 — Export your contacts to a file

Pick whichever accounts you keep contacts in. You can do more than one and import them all.

**From Gmail / Google Contacts**
1. On a computer, go to **contacts.google.com**.
2. On the left, click **Export** (if you don't see it, click the ☰ menu first).
3. Choose **Export as → Google CSV** (or vCard — either works).
4. Click **Export**. A file lands in your Downloads folder, e.g. `contacts.csv`.

**From iPhone / iCloud**
1. On a computer, go to **icloud.com** and sign in.
2. Open **Contacts**.
3. Click the **gear icon** (bottom-left) → **Select All** → click the gear again → **Export vCard**.
4. A `.vcf` file lands in your Downloads.
   *(Alternatively on the phone: open a contact → Share Contact → but the computer route above grabs everyone at once.)*

**From Outlook / Office 365**
1. On a computer, go to **outlook.com**, sign in, open **People** (the little people icon on the left).
2. Click **Manage → Export contacts**.
3. Choose **All contacts → Export**. A `.csv` file lands in your Downloads.

**From Yahoo**
1. Go to **contacts.yahoo.com**, sign in.
2. Click the **… / Actions** menu → **Export**.
3. Export as CSV or vCard → the file lands in your Downloads.

### Step 2 — Drop the file into Daybook
1. In Daybook, click **People** in the left sidebar.
2. Click the **Import** button (top-right of the People page).
3. Either drag your exported file onto the box, or click to browse and pick it.
4. Daybook shows you a preview of the people it found. Look it over, then confirm.
5. Done — they're in.

### The important safety bit (why you can re-import any time)
Daybook **merges, it never duplicates.** If a contact you're importing matches someone already in Daybook — same email, or same name — it *updates* that existing person instead of adding a second copy. So if you export again in three months to pull in newer contacts, just re-import the file; the people already there won't double up, and new details get filled in. Nothing you've typed into Daybook by hand gets wiped.

**That's the whole of Way A.** If that's enough for you, skip to Part 2 (Telegram).

---

## WAY B — Live sync (optional, hands-off going forward)

Here's the shape of it so it's not mysterious: to let an app read your Google/Microsoft contacts, those companies make you *register the app once* on their developer site and hand it two values — a **Client ID** (public, safe to share) and a **Client secret** (a password, keep private). You do that registration once; then I wire it into Daybook and add a **"Connect Google"** button you'll click one time. After that it syncs on its own.

You only need to register the provider(s) you actually use. **Google is the easiest — start there.**

### What you'll do, in order
1. Register the app on Google (and/or Microsoft) — the steps below, ~15 min each.
2. Send me the **Client ID(s)** — you can paste those straight into the chat, they're not secret.
3. **Hold the Client secret** — don't paste it in the chat. I'll have you drop it into a secure settings box at build time.
4. I build the Connect button and the sync. You click Connect once. Done.

---

### Google (Gmail) — about 15 minutes

1. Go to **console.cloud.google.com** and sign in with your Google account.
2. At the very top, click the **project dropdown → New Project**. Name it `Daybook` and create it. Wait a few seconds, then make sure that new project is the one selected in the top bar.
3. In the search bar at the top, type **"People API"**, click it, and click **Enable**.
4. In the left menu, go to **APIs & Services → OAuth consent screen** (on newer layouts it's under **Google Auth Platform → Branding**):
   - Choose **External**, click **Create**.
   - App name: `Daybook`. For the support email and developer email, pick your own email. Save and continue through the screens (you can leave the optional fields blank).
   - Find the **Test users** section and click **Add users** — add **your own Gmail address**. *(This keeps the app in "testing" mode, which is all you need for yourself. When you first connect, Google shows an "unverified app" warning — that's normal for a personal app; you click "continue.")*
5. In the left menu, go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Under **Authorized redirect URIs**, click **Add URI** and paste exactly:
     ```
     https://hduzhemuhyqthfnxchwi.supabase.co/functions/v1/contacts-oauth/google/callback
     ```
   - Click **Create**.
6. A box pops up showing a **Client ID** and a **Client secret**. 
   - **Copy the Client ID** → this is what you send me.
   - **Copy the Client secret** → save it somewhere private (a note to yourself). *Don't* put it in the chat.

*Daybook will only ever ask Google for read-only contact access — it can never change or delete anything in your Google contacts.*

---

### Microsoft (Outlook / Office 365) — about 15 minutes

1. Go to **portal.azure.com** and sign in.
2. In the top search bar, type **"App registrations"** and open it. Click **New registration**.
3. Name it `Daybook`. Under **Supported account types**, pick **"Accounts in any organizational directory and personal Microsoft accounts."**
4. Under **Redirect URI**, set the dropdown to **Web** and paste exactly:
   ```
   https://hduzhemuhyqthfnxchwi.supabase.co/functions/v1/contacts-oauth/microsoft/callback
   ```
   Then click **Register**.
5. In the left menu, click **Certificates & secrets → New client secret**. Give it any description, click Add, then **copy the "Value"** (not the "Secret ID" — the *Value*). Save it privately. *Don't* put it in the chat.
6. In the left menu, click **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, search for **`Contacts.Read`**, tick it, and click **Add**. *(If it's a work account and there's a "Grant admin consent" button, click it.)*
7. Click **Overview** in the left menu. Copy the **Application (client) ID** and the **Directory (tenant) ID** — both of these you send me.

---

### What to send me (Way B)
- **Safe to paste in chat now:** Google **Client ID**, and/or Microsoft **Application (client) ID + Directory (tenant) ID**.
- **Keep private (do NOT paste in chat):** the **Client secret(s)**. I'll give you a secure box for those when I build. If one ever leaks, you can reset it on the same site in seconds.

Once I have the Client ID(s), I build the Connect button and the syncing, and you're one click from done.

---

# PART 2 — TELEGRAM DAILY REMINDER

**Goal:** a message from Daybook in Telegram each morning with your day's to-dos — and, as a bonus, the ability to text Daybook to capture a task on the go.

The Daybook side is already built and live. What's left is the part only you can do: create your bot on Telegram and hand Daybook its key. About **10–15 minutes**, no approval wait.

Do the steps in order. There are five.

---

### Step 1 — Create your Telegram bot (~3 min)
1. Open Telegram (phone app, or **web.telegram.org**).
2. In the search box, type **@BotFather** and open it — it's Telegram's official bot for making bots (it has a blue checkmark).
3. Press **Start**, then send: `/newbot`
4. It asks for a **name** (what shows at the top of the chat) — type `Daybook` and send.
5. It asks for a **username** — must be unique and must end in `bot`, e.g. `craig_daybook_bot`. If it's taken, add a number. Send it.
6. BotFather replies with a **token** — a long line like `7123456789:AAHdq...PALDsaw`. **Copy it and keep it handy** (treat it like a password). You'll paste it in Step 2.

---

### Step 2 — Give the token to Daybook (~4 min)
This is done in Supabase, which is Daybook's backend. You're just pasting in two values.

1. Go to **supabase.com/dashboard**, sign in, and open the project named **daybook**.
2. In the left sidebar, click **Edge Functions**, then find the **Secrets** tab/section.
3. Click **Add new secret** and enter:
   - **Key:** `TELEGRAM_BOT_TOKEN`  ← type it exactly, all caps with underscores
   - **Value:** paste the token from Step 1
   - Save.
4. Add **one more** secret the same way:
   - **Key:** `TELEGRAM_WEBHOOK_SECRET`
   - **Value:** a made-up password using **only letters and numbers** (no spaces, no symbols like `!@#$`). Telegram is fussy about this. Easiest safe option: any random mix of letters and numbers ~20+ characters, e.g. `daybook7h2k9m4p1q8w3e6r`. Save it — you'll reuse it in Step 3.

*(No "deploy" or "restart" needed — secrets take effect immediately.)*

---

### Step 3 — Tell Telegram where to send messages (~2 min)
This is a single web link you visit once. You're plugging your two values into it.

1. Take your **bot token** (Step 1) and your **webhook secret** (Step 2, the letters-and-numbers one).
2. In your browser's address bar, paste this, swapping in your own two values where the `<...>` are:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://hduzhemuhyqthfnxchwi.supabase.co/functions/v1/telegram-inbound&secret_token=<YOUR_WEBHOOK_SECRET>
   ```
   *(Note: it's `bot` immediately followed by your token, no space — e.g. `.../bot7123456789:AAHd...`.)*
3. Press Enter. You should see a short response containing **`"ok":true`** and **"Webhook was set"**. That's it — one time only.

---

### Step 4 — Connect your Daybook account to the bot (~2 min)
1. In Telegram, search for your bot by its username (e.g. `@craig_daybook_bot`) and open a chat with it.
2. Send it any message — `hi` is fine.
3. It replies that this chat isn't registered yet and gives you a **chat ID** (a number like `123456789`). **Copy that number.**
4. In Daybook, go to **Settings → Telegram & Slack**, paste the number into the **Telegram chat ID** field, and click anywhere else on the page (it saves automatically).
5. Click the **Send test** button next to it. Within a second or two you should get a test message in Telegram. **If you do — capture works**, and you can now text the bot any time to drop a task into your Daybook Inbox.

---

### Step 5 — Turn ON the morning reminder (~2 min) ← this is the part that makes the daily message arrive
The steps above make Daybook *able* to message you. This step tells it to send the **daily to-do push** automatically.

1. In Daybook, go to **Settings → Morning brief & nudges** (may be labeled "Morning brief" / "Daily reminders").
2. Turn **ON** the **"Morning to-do push"** toggle. *(If you also want a midday nudge, turn on "Lunch reminder" too.)*
3. Set your **Send time** (e.g. `07:30`) — the time you want the message each morning.
4. **Check your Timezone** in Settings — this is the one that trips people up. The reminder fires at your Send time *in this timezone*. If the timezone is wrong, the message goes out at the wrong hour (or seems not to come at all because it's landing at, say, 2am). Set it to where you actually are (e.g. `Europe/London` or `America/New_York`).
5. Save. From the next morning, at your Send time, you'll get the day's list.

---

### "My reminder didn't come" — run down this checklist
The daily push only fires when **all** of these are true. Nine times out of ten it's #4 or #5.

1. **`TELEGRAM_BOT_TOKEN` is set** in Supabase (Step 2). No token → nothing can send.
2. **You connected your chat ID** and the **Send test** button worked (Step 4). If the test doesn't arrive, fix that first — the daily push uses the exact same connection.
3. **The "Morning to-do push" toggle is ON** (Step 5). If it's off, no daily message — even though Send test works.
4. **Your timezone is correct** (Step 5, #4). Wrong timezone = message at the wrong time. This is the most common cause of "it didn't come."
5. **Your Send time has actually passed today**, in that timezone. The system checks every 15 minutes and sends once when the clock reaches your time — it won't send retroactively for a time earlier in the day.
6. **You have tasks** — a morning with nothing due still sends a short note, but if everything's blank the message is very brief.

If Send test works but the morning push never does even with the toggle on and timezone right, tell me — that points to the scheduled job on the backend, which is my side to check (I'll need Supabase reachable to look).

---

## Quick reference — what's "do it yourself" vs "hand to Claude"

| Task | You do | Claude does |
|---|---|---|
| Import contacts from a file | All of it (Way A) | — (already built) |
| Live contact sync | Register app, send Client ID(s) | Build the Connect button + syncing |
| Telegram capture (text the bot) | Steps 1–4 | — (already built & live) |
| Telegram daily reminder | Step 5 + the checklist | Fix the scheduler if Send-test works but daily doesn't |

**The one rule to remember:** Client IDs and chat IDs are fine to paste in chat. **Client *secrets* and bot *tokens* are passwords — keep those out of the chat.**
