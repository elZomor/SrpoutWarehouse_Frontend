# Ticket Plan — Jira Ticket → Implementation Plan

You are turning an existing Jira ticket into a concrete frontend implementation plan for the `sprout_warehouse_FE` repo. Take a Jira issue key as your argument (e.g. `WRH-42`). If none was given, ask for one before proceeding.

Do **not** write or edit any application code during this command. This command only produces a plan for the user to approve.

---

## Step 1 — Fetch the ticket

Use the Atlassian Rovo MCP `getJiraIssue` tool to fetch the issue by key. Pull out:

- Summary / title
- Description (user story)
- Acceptance Criteria (Gherkin, if present — usually already written by the `po-agent` command)
- Test cases table, if present
- Story points / priority (for context, not action)

If the ticket has no AC or test cases, note that as a gap in your plan output rather than inventing scope.

---

## Step 2 — Load repo conventions

Load the `react-conventions` skill before designing anything. It documents this repo's current state, per-feature file layout, i18n rules, and CI-matching style rules.

---

## Step 3 — Check lessons learned

Read `LESSONS.md` at the repo root. It captures recurring, non-obvious mistakes caught in past PR reviews. If any entry is relevant to this ticket's scope, factor its rule into the plan and call it out explicitly (e.g. "per LESSONS.md <date> entry, doing X instead of Y"). If the file has no entries yet, note that and move on.

---

## Step 4 — Read current app state

Read `src/App.tsx`, `src/app/AppProviders.tsx`, and check whether `src/pages/` or a route table already exists. If the ticket touches an existing domain, read its current `src/features/<domain>/` (or equivalent) files too.

---

## Step 5 — Produce the plan

Write a concrete plan, mapped 1:1 to the ticket's Acceptance Criteria, covering:

- Any one-time routing/page-scaffolding still needed.
- Page/component(s) to add or change.
- Data-fetching hook(s) (TanStack Query) and the API calls they wrap.
- Form/schema, if the ticket involves user input.
- i18n keys to add — list them for **both** `en.json` and `ar.json`.
- Test list — one test per AC/test case, named descriptively — plus whether a new/updated e2e spec is warranted.

Flag anything ambiguous in the ticket rather than guessing.

---

## Step 6 — Present and stop

Show the plan in chat. Do not proceed to implementation. Tell the user to run `/ticket-implement <JIRA-KEY>` once they've reviewed and approved it.
