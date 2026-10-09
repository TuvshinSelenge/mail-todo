# zan: Email-to-Todo — Design

Date: 2026-10-09
Status: Draft, awaiting review

## Goal

A personal, free todo app. The owner emails themselves from Gmail with lines like
`todo: Homework due to 15.10.2026`. Within about 1–2 minutes the todo appears on a
private-by-key web page that works on Mac and phone, where it can be checked off or
deleted.

**Users:** the owner only. One Gmail account, one secret key. Extra sender addresses can be allowed via Script Property `ALLOWED_SENDERS` (comma-separated); their todos show "from <address>".

**Success criteria**
- An email from the owner to themselves with a `todo:` line shows up in the web list within 2 minutes.
- Check-off and delete feel instant and survive a page reload.
- Without the secret key, the API returns no data.
- Costs nothing to run.

**Out of scope (v1):** adding todos from the web page, editing text, reminders,
multiple users, and sending from other email accounts.

## Architecture

```
Gmail ──(time trigger, every 1 min)──▶ Apps Script ──▶ Google Sheet
                                           ▲
                                           │ HTTPS + secret key
                                           ▼
                                 Static web page (GitHub Pages)
```

Three units:

1. **Google Sheet**: storage, with two tabs:
   - `Todos`: one row per todo.
   - `Processed`: Gmail message IDs already handled.
2. **Apps Script project** (bound to nothing; it opens the Sheet by ID stored in Script Properties):
   - `Parse.js`: pure parsing functions, with no Google APIs, so they can be unit-tested in Node.
   - `Inbox.js`: the time-triggered inbox checker.
   - `Api.js`: `doGet` / `doPost` web-app handlers.
   - `Store.js`: Sheet read and write helpers.
3. **Web frontend**: `index.html`, `style.css` and `app.js`, using plain JavaScript with no build step.

### Repository layout

```
mail-todo/
  apps-script/   Parse.js Inbox.js Api.js Store.js appsscript.json .clasp.json
  web/           index.html style.css app.js
  tests/         parse.test.js        (node --test)
  .github/workflows/pages.yml         (deploys web/ to GitHub Pages)
  docs/superpowers/specs/…
```

The repo is public, which free GitHub Pages requires. It contains no secrets: the key
and the Sheet ID live in Apps Script Script Properties. The public web-app URL in
`app.js` is useless without the key.

## Data model

**`Todos` tab columns:** `id` | `text` | `due` | `done` | `created` | `doneAt` | `messageId`

| Field | Type | Notes |
|---|---|---|
| id | string | `Utilities.getUuid()` |
| text | string | todo text with the `due …` part removed |
| due | string | `YYYY-MM-DD`, or empty |
| done | boolean | |
| created | ISO datetime string | time the email was sent |
| doneAt | ISO datetime string, or empty | set when checked; cleared when unchecked |
| messageId | string | source Gmail message, for reference |

**`Processed` tab columns:** `messageId` | `processedAt`

Message IDs are tracked separately, so deleting a todo never causes it to be
re-imported, and an email with no todo lines is not re-parsed every minute.

## Email ingestion (`Inbox.js`)

- A time-driven trigger runs `checkInbox()` every 1 minute.
- Gmail query: `from:me to:me todo newer_than:2d`.
- Each **message** (not thread) whose ID is not in `Processed`:
  1. Builds the candidate lines from the subject line plus each line of the plain-text body.
  2. Runs `parseEmail(subject, body, sentDate)` to get a list of `{text, due}`.
  3. Appends one `Todos` row per result.
  4. Records the message ID in `Processed`, even when it produced zero todos.
  5. Adds the Gmail label `todo-saved` to the thread, purely as a visual hint. Nothing is moved or marked read.
- Each message is wrapped in try/catch. A failing message is logged and skipped, and is **not** recorded as processed, so it is retried next run. After it fails 3 times (tracked in Script Properties), it is recorded as processed to stop the retries.
- All Sheet writes happen under `LockService.getScriptLock()` (shared with the API).
- Safety check: the message's `From` address must equal `Session.getEffectiveUser().getEmail()`. Otherwise it is skipped.

## Parsing rules (`Parse.js`)

`parseEmail(subject, body, sentDate) → [{text, due}]`

- **Todo lines:** any line (the subject counts as a line) matching `^\s*todo\s*:\s*(.+)$`, case-insensitive. The captured text is trimmed, and empty results are skipped. Lines starting with `>` (quoted replies) are ignored.
- **Due date:** `parseDue(text, today) → {text, due}`. It looks for a trailing segment matching `\s+due(\s+to)?\s*:?\s*<date>\s*$` (case-insensitive), where `<date>` is one of:
  - `today`, `tomorrow`
  - `DD.MM.YYYY`, `DD/MM/YYYY`, `DD-MM-YYYY`
  - `DD.MM`, `DD/MM` (no year): use the current year. If that date is before `today`, use next year.
  - Day and month may be 1 or 2 digits.
- The date must be a real calendar date (`31.02.2026` is rejected).
- On a match, `text` has the `due …` segment removed and `due` is `YYYY-MM-DD`.
- When nothing matches, or the date is invalid, the **full text is kept** and `due` is empty.
- `today` is the email's sent date in the script's time zone (`appsscript.json` `timeZone`, set to the owner's zone during setup).

## API (`Api.js`)

Deployed as a web app with "Execute as: Me" and "Who has access: Anyone". Access is
enforced by the secret key.

- `GET ?action=list&key=K` → `{ok:true, todos:[…all rows…]}`
- `POST` with body `text/plain` JSON `{key, action:"toggle"|"delete", id}` → `{ok:true}`
  - `text/plain` avoids a CORS preflight, which Apps Script cannot answer.
- Errors (Apps Script cannot set HTTP status codes): `{ok:false, error:"unauthorized"|"not_found"|"bad_request"|"server_error"}`
- The key is compared against Script Property `SECRET_KEY`. A missing property means every request returns `unauthorized`.

## Frontend (`web/`)

**Look:** design "B1 · Hairline list", approved in brainstorming.
- Background `#0a0a0a`, text `#ededed`, secondary grays (`#5a5a5a`–`#8a8a8a`), hairline dividers `#161616`.
- Single accent: orange `#ff6b1a`. Overdue: red `#ff4d4d`.
- Font: Inter (Google Fonts), with a system-ui fallback.
- Header: orange slash logo mark plus the name "zan", and a sync status on the right ("Synced" with a green dot, "Syncing…", or "Offline").
- Title block: today's date (e.g. "Friday, October 9") in gray, then "Today." with an orange period, then "N open · M done".
- Sections: **Open** (with count), then **Done** (with count).
- Row: round checkbox, todo text, and a meta line: `<due label> · from email · <relative created time>`.
  - Due label: "Overdue · Oct 8" (red), "Due today" (orange), "Due Thu, Oct 15" (gray). Omitted when there is no due date.
  - Rows created in the last 10 minutes get a 2px orange inset left edge.
- Done rows: muted text with an orange strike-through.
- Responsive: one column, max width about 560px, centered on desktop; full width on phone, respecting safe-area insets.

**Sorting**
- Open: rows with a due date first, ascending by due; then rows with no due date, newest `created` first.
- Done: newest `doneAt` first.

**Interactions**
- Checking a todo plays an orange slash animation across the row (about 300ms), then the row moves to Done. Unchecking a done todo moves it back.
- Delete: swipe left on touch devices to reveal a delete action; on desktop, a ✕ appears on row hover. There is no confirmation dialog.
- Changes are applied to the UI immediately and then sent to the API. On failure the change is reverted and a toast shows "Couldn't sync, try again".

**Data and state**
- `API_URL` is a constant in `app.js`.
- The key lives in `localStorage` under `zan.key`. With no key, or after an `unauthorized` response, the page shows a single key-entry screen.
- The last successful list is cached in `localStorage` under `zan.todos` and rendered instantly on load.
- The list refreshes on load, on window focus or `visibilitychange` to visible, and every 15s while visible.
- When a network failure happens, the cached list stays on screen and the status shows "Offline".
- All `localStorage` access is wrapped in try/catch.
- Due-date labels compare `due` with the browser's local date.

## Error handling summary

| Situation | Behavior |
|---|---|
| Wrong or missing key | API returns `unauthorized`; the page shows key entry |
| Network down | Cached list shown, status "Offline" |
| Toggle or delete fails | UI reverted, toast shown |
| Unparseable due date | Todo saved with full text and no due date |
| One email throws during import | Skipped and retried; recorded as processed after 3 failures |
| Concurrent trigger and API write | Serialized by script lock |

## Testing

- **Automated:** `tests/parse.test.js` runs with `node --test` against `Parse.js` (which exports via `module.exports` when `module` exists). Cases:
  - subject-only, body-only, and multiple todo lines
  - case and spacing variants, and empty `todo:` lines
  - quoted `>` lines and signatures are ignored
  - every due format, `today` and `tomorrow`, and year inference for `DD.MM`
  - invalid dates are kept as text
  - `due` inside the text but not at the end (e.g. "todo: check due diligence") is not treated as a date
- **Manual checklist** (after deploy):
  - Send a subject-only email, a body-only email, and one with several todos plus a due date; all appear within 2 minutes.
  - Check, uncheck and delete each survive a reload.
  - A deleted todo does not come back.
  - A wrong key shows the key screen.
  - Airplane mode shows the cached list and "Offline".
  - Test on a phone (Safari) and on desktop.

## Setup steps (owner)

1. Run `npx @google/clasp login`, after enabling the Apps Script API at script.google.com/home/usersettings.
2. Claude creates the project and Sheet. The owner then:
   - sets the time zone
   - sets Script Properties `SECRET_KEY` and `SHEET_ID`
   - deploys the web app
   - authorizes the Gmail and Sheets scopes
   - creates the 1-minute trigger by running `setup()` once
3. Create the public GitHub repo, push it, and set Pages source to "GitHub Actions".
4. Open the Pages URL on each device and enter the key.
