---
name: react-conventions
description: Repo-specific React/TypeScript conventions for sprout_warehouse_FE — pages, components, data fetching, forms, i18n, tests, and the exact style rules CI enforces. Load before writing or planning any frontend code in this repo.
---

# react-conventions

## One-time gap (check every time — may already be closed)

`react-router-dom`'s `BrowserRouter` is already wrapping the app in `src/app/AppProviders.tsx`, but no `<Routes>`/`<Route>` table exists yet and there's no `src/pages/` directory — `App.tsx` is still a single static shell. The first feature that needs its own URL will need to introduce both. Verify this is still the case before assuming; don't add a second routing setup if one now exists.

## Per-feature file layout

- **Page** — `src/pages/<Feature>Page.tsx`, wired into the route table.
- **Reusable UI** — flat in `src/components/<ComponentName>.tsx`, matching the existing pattern (`LanguageSwitcher.tsx`, `ErrorBoundary.tsx`). Only nest under a feature folder once a feature has enough internal-only pieces to justify it — don't pre-emptively create feature folders for a single component.
- **Data fetching** — a TanStack Query hook per domain operation (e.g. `useWarehouses`, `useCreateWarehouse`), wrapping `apiClient` (`src/lib/apiClient.ts`, Axios instance with `withCredentials: true` — auth is a server-side session cookie, never add a bearer-token header). Colocate domain hooks/types/API calls under `src/features/<domain>/` once a domain has more than a trivial page; there's no existing precedent yet, so this is the pattern to establish.
- **Forms** — `react-hook-form` with `@hookform/resolvers/zod` and a `zod` schema colocated with the form (or in a sibling `schema.ts` for reuse).
- **i18n** — every user-facing string goes through `useTranslation()` / `t(...)`. Add the key to **both** `src/i18n/locales/en.json` and `src/i18n/locales/ar.json` in the same change — never add to one without the other, since Arabic is the primary language (README §Stack) and RTL regressions are easy to miss.
- **Tests** — colocate `<Name>.test.tsx` next to the component/page (matches `App.test.tsx`). Use `@testing-library/react` + `vitest`; wrap the unit under test in `AppProviders` when it depends on Query/Router/i18n context, same as `App.test.tsx` does.
- **E2E** — add or extend a spec under `e2e/` (Playwright) for any new user-facing flow. `playwright.config.ts` builds and serves the app itself (`webServer` runs `npm run build && npm run preview`) — no dev server needs to be running manually. If a flow depends on backend data, note in the spec whether it assumes a live backend at `VITE_API_BASE_URL` or needs mocking; there's no existing precedent for API mocking in e2e yet.

## Style constraints (match CI exactly)

- **Prettier**: `npm run format:check` must pass (`.prettierrc.json` / `.prettierignore`).
- **ESLint**: `npm run lint` (`eslint.config.js`) — TypeScript strict rules, `react-hooks`, `react-refresh`, `jsx-a11y`. Unused vars/params are lint errors except when prefixed with `_` (`argsIgnorePattern: '^_'`).
- **Security scan**: `npm run security-scan` (separate `eslint.security.config.js`, `eslint-plugin-security`, run with `--max-warnings 0` as CI's `review-bot` job) — zero tolerance, not just a warning.
- **TypeScript**: `npm run typecheck` (`tsc -b --noEmit`), strict mode with `noUncheckedIndexedAccess` and `noUnusedLocals`/`noUnusedParameters` — don't leave dead code or unchecked array/object indexing.
- Run `npm run lint:fix` and `npm run format` after writing code and fix anything left before considering a change done.

## Env / local run requirements

- Node `>=22` (`.nvmrc` pins `24`).
- `.env` needs `VITE_API_BASE_URL` (a valid URL — validated by `src/config/env.ts` via Zod at startup; the app throws immediately if missing/invalid rather than failing silently later).

## Coverage bar

`vite.config.ts` sets `thresholds: { lines: 50, statements: 50 }` for `npm run test:coverage` — mirrors the backend's `fail_under = 50`. Write real tests for new behavior, don't chase 100%.

## PR expectations

`.github/pull_request_template.md` expects: Jira story linked, screenshots for UI changes (both AR/RTL and EN/LTR if layout is affected), unit tests for new logic, an e2e test if a user-facing flow changed, and no leftover `console.log`/dead code. Match this template when drafting a PR body, don't just write a generic summary.
