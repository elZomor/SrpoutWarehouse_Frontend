# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is one of two repos in the `sprout_warehouse` workspace — see `../CLAUDE.md` for cross-cutting/workspace-level facts (Jira/Confluence, auth contract, coverage bar, ticket-* workflow). This file is the frontend-specific detail that file points to. **Also load `.claude/skills/react-conventions/SKILL.md` before writing or planning any code here** — it has the authoritative, exact style rules; treat it as more current than this file if they ever disagree.

## Commands

```bash
npm install && npm run dev            # dev server
npm run build                         # tsc -b && vite build
npm run lint / npm run lint:fix       # ESLint
npm run format / npm run format:check # Prettier
npm run typecheck                     # tsc -b --noEmit
npm run security-scan                 # eslint-plugin-security, separate config, --max-warnings 0
npm test                              # vitest run (single run)
npm run test:watch                    # vitest watch mode
npm run test:coverage                 # vitest with coverage (lines/statements gated at 50%)
npm run e2e                           # playwright — builds + serves the app itself, no dev server needed
```

Single test file/case: `npx vitest run src/pages/CategoriesPage.test.tsx` or `npx vitest run -t "test name"`. Single e2e spec: `npx playwright test e2e/<file>.spec.ts`.

Requires Node `>=22` (`.nvmrc` pins the exact version). `.env` must set `VITE_API_BASE_URL` to a valid URL — `src/config/env.ts` validates `import.meta.env` with Zod at import time and throws immediately if missing/invalid, rather than failing later inside a request.

Husky + lint-staged run ESLint/Prettier on staged files at commit time — don't rely on CI to catch formatting.

## Architecture

**Auth**: server-side session cookie, not a token. `src/lib/apiClient.ts` is a single shared Axios instance with `withCredentials: true` and `withXSRFToken: true` (reads Django's `csrftoken` cookie, sends it back as `X-CSRFToken` on unsafe requests) — never add a bearer-token header, and never construct a second Axios instance. `src/features/auth/useAuth.ts` exposes `useCurrentUser` (query, `retry: false`), `useLogin`, `useLogout` (mutations that write straight into the `['auth', 'me']` query cache via `setQueryData` rather than invalidating). `src/components/ProtectedRoute.tsx` gates the authenticated route subtree on `useCurrentUser`, redirecting to `/login` when there's no user.

**Routing**: flat route table in `src/App.tsx` using `ROUTES` constants from `src/routes.ts` (single source of truth for paths — always route through it, don't hardcode path strings). Structure: `/login` standalone, everything else nested under `<ProtectedRoute>` → `<AppLayout>` (sidebar shell). Unimplemented nav destinations render `<ComingSoonPage titleKey="nav.X">` rather than a route being absent — when building out a real feature, replace the `ComingSoonPage` route with the real page, don't add a new route.

**Feature module pattern** (`src/features/<domain>/`, established by `auth`, `categories`, `product-types` — follow this shape for every new domain resource):

- `api.ts` — thin async functions wrapping `apiClient`, one per REST operation, typed request/response.
- `types.ts` — domain types (usually mirroring backend serializer shape).
- `schema.ts` — `zod` schema for form input, feeding `react-hook-form` via `@hookform/resolvers/zod`.
- `use<Domain>.ts` — TanStack Query hooks (`useQuery`/`useMutation`) built on the `api.ts` functions. Query keys are a base tuple constant (e.g. `['categories']`) plus a key-builder function for parameterized queries; mutations invalidate or directly patch that base key on success — check existing hooks for which pattern a given case calls for.

Pages (`src/pages/<Feature>Page.tsx`) consume feature hooks; they don't call `apiClient` or `api.ts` directly.

**Providers/composition root** (`src/app/AppProviders.tsx`): `QueryClientProvider` → `BrowserRouter` → a `DirectionSync` wrapper that reads the active i18n language, sets `document.documentElement.dir`/`lang`, and passes AntD's `ConfigProvider` a matching `direction` + the shared `antdTheme`. Any new top-level provider goes here, in this nesting order.

**Theme**: `src/theme/tokens.ts` holds raw design tokens (brand colors, font, border radius, sidebar width); `src/theme/antdTheme.ts` maps them into AntD's theme API. Pull colors/spacing from `tokens.ts` rather than hardcoding hex values in components.

**i18n/RTL**: Arabic is the default/primary language; English is switchable. Every user-facing string must go through `useTranslation()`/`t(...)` and be added to **both** `src/i18n/locales/en.json` and `src/i18n/locales/ar.json` in the same change — RTL regressions are easy to introduce and easy to miss in review. Direction follows the language automatically via `DirectionSync` above; don't hand-roll direction logic elsewhere.

**Error handling**: `src/components/ErrorBoundary.tsx` wraps the app root so an unhandled render error doesn't produce a blank screen mid-workflow (currently only `console.error`s — no error-tracking service wired up yet).

**Tests**: colocated `<Name>.test.tsx` next to the unit under test, `@testing-library/react` + `vitest`. Anything depending on Query/Router/i18n context must be wrapped in `AppProviders` (see `App.test.tsx` for the pattern). E2E specs live flat in `e2e/` (Playwright); `playwright.config.ts` builds and serves the app itself, so no separate dev server needs to be running.

## CI (`.github/workflows/ci.yml`, all required on PRs)

Four independent jobs: `lint` (Prettier + ESLint + `tsc --noEmit`), `review-bot` (the standalone `security-scan`, zero-warning), `test` (`test:coverage`, uploads the coverage report as an artifact), `e2e` (Playwright against Chromium, uploads the HTML report as an artifact). Match this locally before pushing — all four commands above are cheap to run individually.
