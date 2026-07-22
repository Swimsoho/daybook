# Daybook — Quick Start

### The short version first. More detail is one click away, wherever you need it.

*Prepared for Craig and anyone he invites onto Daybook · July 2026*

---

This is the "just tell me what to click" guide. It covers the handful of things worth setting up in your first ten minutes, and the small set of daily habits that make Daybook actually useful. Every section below has a **"Show me more"** you can open if you want the full explanation — otherwise the short version is all you need.

Two longer documents exist alongside this one if you ever want the complete picture: the **Daybook Feature & Technical Manual** (everything the app does, in detail) and the **Telegram & Slack Setup Guide** (the admin-level steps for wiring up the bots themselves, one time, for the whole account). This guide is the front door to both — you shouldn't need to open either just to get going.

---

## 1. Your first five minutes

1. **Pick a look.** Settings → Appearance → click a color card. Purely cosmetic, changes nothing else, change your mind anytime.
2. **Set your Focus Areas.** Settings → Focus areas. These are the 3–6 big buckets your life splits into — Family, Work, Personal, whatever fits. Type a name, click **+**.
3. **Turn on phone capture.** Settings → Text-in capture number → type your phone number with country code (e.g. `+15551234567`). From then on, texting or WhatsApping that number drops a pending item straight into your Inbox.
4. **Try it.** Type anything into the Quick capture box at the top of any page, or text your number — then go to **Inbox** and confirm it.
5. **Set your daily capacity.** Settings → Daily capacity & rebalancing → how many tasks you want crammed into one day before Daybook starts flagging you as over-capacity.

That's genuinely enough to start using Daybook day to day. Everything past this point is either a nice-to-have or something you'll only touch once.

<details>
<summary><strong>Show me more — Focus areas, Categories, and Actions</strong></summary>

Categories are sub-topics inside a Focus area (under "Work" you might have Money, Admin, Projects). Actions are what *kind* of thing a task is, regardless of area (Call, Meeting, Decide, Email) — the same "Call" action can apply under Work or under Family. Both are managed the same way in Settings: type a new one in the box at the bottom of its section, click **+**. Click directly into any existing name to rename it. **Archive** retires one without losing history (you can bring it back later); **Delete** removes it permanently, and Daybook tells you first if anything's still using it.

Categories can also be tagged to a specific Focus area (small clickable dots) if you want one to only show up under that area instead of everywhere.
</details>

<details>
<summary><strong>Show me more — Delete vs. Archive</strong></summary>

Anywhere you see both: **Archive** if you might want it back, or if anything still references it — nothing is lost, it just steps out of the way of day-to-day pickers. **Delete** is for something you genuinely don't need anymore; if it's in use anywhere, Daybook tells you exactly how many things reference it before you confirm.
</details>

---

## 2. Your daily rhythm

Once you're set up, this is the loop:

- **Inbox** — every capture (a text, a WhatsApp, a Telegram/Slack message, a forwarded email) lands here first, already pre-filed by Daybook's best guess. Glance through it, fix anything it guessed wrong (the dropdowns next to each item let you redirect it to a different area, category, or even a completely different destination — see below), and confirm.
- **Today** — your day: what's due, what needs attention, who to call.
- **Overall** — the zoomed-out view across every project and area, for when you want the whole picture instead of just today.

<details>
<summary><strong>Show me more — redirecting a capture to something other than a task</strong></summary>

Not everything you send in is a to-do. Each pending item in the Inbox has a **"File as"** dropdown — leave it as-is to accept Daybook's guess, or pick a different destination: a plain Task, or any Collection tracker you've set up (Notes, Movies to watch, Books, whatever exists). Whatever you pick there always wins over Daybook's original guess when you confirm.

You can also skip the dropdown entirely by typing a prefix when you capture something:

| Prefix | Files as |
|---|---|
| `t:` | a task |
| `c:` | a call to log |
| `i:` or `idea:` | an idea |
| `n:` or `note:` | a note (Collections → Notes) |
| `?` | a question for the assistant |

For example, texting `n: check if the warranty covers this` drops straight into your Notes collection, no confirming needed on where it goes.
</details>

<details>
<summary><strong>Show me more — Quick actions, cadence, and nudges</strong></summary>

**Quick actions** (Settings) toggles which one-tap buttons show up on every task/contact row — Done, Called, Snooze, Reassign — so you only see the shortcuts you use. **Contacts & cadence** sets how often you want nudging to reach out to people in each relationship tier (Inner circle, Active, Network, Dormant); override it per-person on their own page if someone needs a different rhythm. **Morning brief** picks the channel (WhatsApp or Email) and time for your daily summary — top 3 tasks, today's calls, anything about to slip.
</details>

---

## 3. Connecting Telegram or Slack (the part you actually need to do)

If someone already set up the Daybook bot for your account (this is a one-time, admin-level job — see the full setup guide if that's not been done yet), connecting *your own* account takes under a minute:

1. Find the bot on Telegram or Slack and send it any message — "hi" is fine.
2. It replies with an ID number.
3. Copy it, paste it into Daybook Settings → Telegram & Slack → the matching field.
4. Click **Send test** — you should get a reply back within a couple of seconds.

Done. From then on, messaging that bot lands in your own Inbox, same as texting.

<details>
<summary><strong>Show me more — setting up the bot itself for the first time (admin, one-time)</strong></summary>

This is the part that involves creating a bot on Telegram's or Slack's own site and handing Daybook its credentials — about 10 minutes for Telegram, 20 for Slack, and only ever done once for the whole account. It's a separate, longer walkthrough: see the **Telegram & Slack Setup Guide**. Once that's done, every person on the account (including whoever did the setup) just does the short "connect your own account" steps above.
</details>

---

## 4. Where does X live?

A few quick answers to questions that come up early:

- **Where do general ideas go?** Type `i:` or `idea:` before it when you capture it, or just let Daybook guess — ideas land under **New Ideas**, a Focus area meant exactly for "not a task yet, don't want to lose it."
- **Where do freeform notes go?** Same idea — `n:` or `note:`, or redirect from the Inbox's "File as" dropdown to the **Notes** collection.
- **What's the difference between Collections and Notes?** Collections page now has two tabs — **Collections** (your structured trackers: Movies, Books, Dates to remember, etc.) and **Notes** (a plain catch-all for anything that isn't its own tracker yet).

---

## Want the full picture?

- **Daybook Feature & Technical Manual** — every feature, every setting, in full detail.
- **Telegram & Slack Setup Guide** — the complete admin walkthrough for wiring up the bots from scratch.

You shouldn't need either one just to get going — but they're there.
