# Ticket Ship — Code → PR

Precondition: implementation for this ticket is done and locally tested (normally via `/ticket-implement` and ideally `/verify`). Takes a Jira issue key as its argument (e.g. `WRH-42`).

Every step below that touches shared state (commit, push, PR, Jira transition) requires an **explicit go-ahead from the user in chat** before running — don't rely solely on the ambient tool-permission prompt, actually ask.

---

## Step 1 — Plan-compliance check

Diff the branch against `main` (`git diff main...HEAD --stat` and a full `git diff main...HEAD`) and compare it against the plan approved in `/ticket-plan`. Flag:

- Any file touched that the plan didn't call for.
- Any planned page/hook/component/i18n key missing from the diff.
- i18n keys added to only one of `en.json`/`ar.json`.
- Leftover `console.log`, commented-out code, or stray `TODO`s (the PR template explicitly checks for this).

If you find unexplained scope, stop and show it to the user before continuing. Otherwise, continue.

---

## Step 2 — Run the CI gauntlet locally

Run these in order, exactly as CI does (see `.github/workflows/ci.yml`):

```
npm run format:check
npm run lint
npm run typecheck
npm run security-scan
npm run test:coverage
npm run e2e
```

If anything fails, stop and report it — fix and re-run before continuing. Do not proceed to Step 3 until all of the above pass clean.

---

## Step 3 — Commit

Draft a commit message referencing the Jira key (e.g. `WRH-42: <summary>`). Show it to the user and **wait for explicit confirmation** before running `git commit`.

---

## Step 4 — Push

**Ask for explicit confirmation** before running `git push -u origin <branch>`.

---

## Step 5 — Open the PR

Draft a PR body following `.github/pull_request_template.md`: what/why (with the Jira link), screenshots note (call out both AR/RTL and EN/LTR if layout changed), and the checklist (tests added, e2e added if user-facing, `npm run lint`/`typecheck`/`test` run locally, no leftover debug code). Show it to the user and **ask for explicit confirmation** before running `gh pr create`.

---

## Step 6 — Jira transition (optional)

**Ask for explicit confirmation** before transitioning the Jira issue to "In Review" via the Rovo MCP `transitionJiraIssue` tool (and optionally leaving a comment with the PR link via `addCommentToJiraIssue`). If the user declines or these tools aren't permitted yet, just report the PR URL and skip this step.

---

## Step 7 — Report

Report the branch name, PR URL, and Jira ticket status. Remind the user that:

- `/code-review` (or `/code-review ultra` for higher-stakes changes) should run before merge.
- If review comes back with change requests, use `/ticket-address-review <JIRA-KEY>` rather than fixing ad hoc.
- Merging is always a manual step — this command never runs `gh pr merge`. Once merged, run `/ticket-close <JIRA-KEY>` to close out.
