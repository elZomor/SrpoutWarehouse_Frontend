# Sprout Warehouse — Frontend

Web frontend for the Warehouse MVP (Event Equipment Tracking). See the PRD, Delivery Plan, and Technical Notes in Confluence (space `WRH`) and stories in Jira project `WRH` for product context.

## Stack

- **Vite + React 19 + TypeScript** (strict mode)
- **Ant Design** — component library, chosen for built-in RTL support (Arabic is the primary UI language, per PRD §7)
- **React Router** — client-side routing
- **TanStack Query** — server state / data fetching
- **Axios** — HTTP client, `withCredentials: true` (auth is a server-side session cookie, not a token — see Technical Notes v1.0 §1)
- **React Hook Form + Zod** — forms and validation
- **i18next / react-i18next** — Arabic (default) / English, switchable; direction (`rtl`/`ltr`) follows the active language
- **qrcode.react** — QR code generation; **html5-qrcode** — camera-based QR scanning
- **@react-pdf/renderer** — packing list / bulk QR label PDFs
- **Vitest + React Testing Library** — unit/integration tests
- **Playwright** — end-to-end tests

## Getting started

```bash
npm install
cp .env.example .env   # set VITE_API_BASE_URL to your local backend
npm run dev
```

## Scripts

| Script                                    | Purpose                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                             | Start the dev server                                                    |
| `npm run build`                           | Type-check and build for production                                     |
| `npm run lint` / `npm run lint:fix`       | ESLint                                                                  |
| `npm run format` / `npm run format:check` | Prettier                                                                |
| `npm run typecheck`                       | `tsc --noEmit` across the whole project                                 |
| `npm test`                                | Run unit tests once                                                     |
| `npm run test:watch`                      | Unit tests in watch mode                                                |
| `npm run test:coverage`                   | Unit tests with coverage report                                         |
| `npm run e2e`                             | Run Playwright end-to-end tests (builds + serves the app automatically) |

## Guardrails in this repo

This project is largely AI-assisted ("vibe-coded"), so the following are load-bearing, not optional:

- **Pre-commit hook** (Husky + lint-staged): auto-fixes lint/format issues on staged files before they can be committed.
- **CI on every PR** (`.github/workflows/`): `lint.yml` runs Prettier, ESLint, and `tsc --noEmit`; `test.yml` runs unit tests (with coverage) and Playwright e2e tests. Both are required checks — configure branch protection on `main` to enforce this once the repo has a remote.
- **TypeScript strict mode** (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`/`Parameters`) — catches null/undefined and dead-code issues at compile time rather than at review time.
- **`src/config/env.ts`**: validates `import.meta.env` with Zod at startup and throws immediately if a required variable is missing, instead of failing silently deep in a request.
- **`ErrorBoundary`** (`src/components/ErrorBoundary.tsx`): wraps the app root so an unhandled render error doesn't produce a blank white screen for a warehouse manager mid-scan.
- **Dependabot** (`.github/dependabot.yml`): weekly grouped PRs for npm and GitHub Actions dependency/security updates.
- **PR template** (`.github/pull_request_template.md`): checklist includes testing both AR (RTL) and EN (LTR), since RTL regressions are easy to introduce and easy to miss in review.

### Not yet set up — do before the repo goes further

- **Branch protection on `main`**: require the `Lint` and `Test` workflows to pass and require at least one review before merge. Needs a GitHub remote first (`gh repo create` or push to an existing one), then configure under Settings → Branches.
- **CODEOWNERS**: once there's more than one contributor, add `.github/CODEOWNERS` so PRs auto-request the right reviewer.
- **Error monitoring** (e.g. Sentry): the `ErrorBoundary` currently only `console.error`s — wire it to a real error-tracking service before this goes in front of the pilot customer.
