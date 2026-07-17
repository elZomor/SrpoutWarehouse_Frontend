# Lessons

Recurring, non-obvious lessons pulled from PR review feedback (`/code-review`, `/code-review ultra`, or human reviewers) for `sprout_warehouse_FE`. Consulted by `/ticket-plan` and `/ticket-auto-ship` before a plan is written — check here before repeating a mistake already caught once.

Only log lessons that generalize (would bite again on a different ticket). Skip one-off typos. Don't duplicate an existing entry — if a new PR hits the same rule, leave the entry as-is.

## Format

```
## <YYYY-MM-DD> — <JIRA-KEY> — <short title>
- What: what went wrong
- Fix: what the reviewer/fix actually changed
- Rule: the generalizable rule to apply during future planning
```

---

## 2026-07-17 — WRH-55 — a growing test file's coverage-instrumented CI run started failing the required Unit tests check on unrelated tests

- What: `WorkOrdersPage.tsx`/`WorkOrdersPage.test.tsx` grew substantially (a new Tabs UI with two extra `Table` instances plus a detail `Modal`). `npm run test:coverage` (CI's "Unit tests" job, `v8` coverage provider, default vitest file-parallelism) started intermittently timing out 2-9 tests in that one file per run at the global 10000ms `testTimeout` - not the same tests each run, and not tests that do anything unusual (no rc-motion/Popconfirm involved, matching the CategoriesPage precedent this repo already had a fix for). The same file passed 22/22 locally without `--coverage`, and in isolation with `--coverage` (borderline, ~12-30s for the single heaviest test). CI failed it twice in a row (including after a full rerun), blocking `gh pr merge`'s required check.
- Fix: three changes, not one, applied across two rounds - (1) added `--no-file-parallelism` to the `test:coverage` npm script (`package.json`) to remove cross-file CPU contention during the coverage run, which explained most of the spread-across-tests failures (2-9 tests/run down to 1); (2) raised `vite.config.ts`'s global `testTimeout` 10000 -> 20000, because even with file-parallelism removed, individual tests in this specific heavier file could still occasionally cross 10s purely from `v8` coverage instrumentation overhead; (3) after (1)+(2) landed, CI still failed on the _one_ remaining heaviest test each run (confirmed via the actual GitHub Actions log, not just local reruns - local machine and CI runner have different headroom, so a test passing locally under the same flags doesn't guarantee it'll pass in CI) - two specific tests (`WorkOrdersPage.test.tsx`'s "does not show a loading state on other draft rows..." and "refreshes the Active tab after starting a WO from the Manage tab", the latter doing two full render/interact cycles) needed their own even-larger per-test override (45000ms/40000ms) on top of the global bump.
- Rule: when a page/test file grows meaningfully larger (new UI surface, more `Table`/`Modal` instances, more hooks), re-verify `npm run test:coverage` (the exact CI command, not just `npm test`) before considering the change done - don't assume passing `npm test` (no coverage) or an isolated coverage run of just that file is sufficient, since cross-file parallelism contention only shows up in the _full_ coverage run and can look like "random unrelated tests failing" rather than an obvious regression in the diff. If it's failing intermittently across multiple tests in one file (not consistently the same one), suspect resource contention (fix: `--no-file-parallelism` and/or raise the global timeout) rather than chasing it as N separate test-level bugs. Even after a local fix looks clean (including re-running the _exact_ CI command), don't assume CI will agree - CI's runner can be measurably slower than a local dev machine for the same flags, so treat a green local run as a strong signal, not proof, until CI itself confirms it; check the actual CI job log (`gh run view --job <id> --log-failed`), not just the checks summary, to see which specific test(s) are still borderline.
