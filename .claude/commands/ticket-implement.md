# Ticket Implement — Plan → React Code

Precondition: this command assumes `/ticket-plan <JIRA-KEY>` has already run for this ticket and the user has approved the resulting plan in chat. If no approved plan exists in this conversation, stop and ask the user to run `/ticket-plan` first (or paste the plan) before continuing.

Takes a Jira issue key as its argument (e.g. `WRH-42`).

---

## Step 1 — Branch

Create and check out a feature branch named `feature/<JIRA-KEY>-<short-slug>`, where `<short-slug>` is a few kebab-case words from the ticket summary. If a branch matching this ticket already exists, check it out instead of creating a new one — don't ask, just check `git branch` and act accordingly, but tell the user which you did.

---

## Step 2 — Load repo conventions

Load the `react-conventions` skill (this is a fresh command invocation, so load it again even if a prior command in this session already did).

---

## Step 3 — Write the code

Following the approved plan exactly:

- Page/component(s) per the plan's layout.
- Data-fetching hook(s) wrapping `apiClient`.
- Form/schema, if applicable.
- i18n keys added to **both** `en.json` and `ar.json`.
- Tests per the plan's test list, and an e2e spec update if the plan called for one.

Don't add anything the plan didn't call for.

---

## Step 4 — Lint, format, typecheck

Run `npm run lint:fix`, then `npm run format`, then `npm run typecheck`. Fix anything left over. Repeat until all three are clean.

---

## Step 5 — Local tests

Run `npm test` (unit tests). Fix any failures before moving on. Don't run the full e2e suite here — that's part of `/ticket-ship`'s gauntlet — but do a quick manual sanity check if the change is visual (see Step 6).

---

## Step 6 — Report

Summarize the diff (files touched, what each does) in chat. Do **not** commit, push, or open a PR — that's `/ticket-ship`. Suggest the user run the `/verify` skill next to actually click through the change in the browser (both AR/RTL and EN/LTR, per this repo's PR checklist) before shipping.
