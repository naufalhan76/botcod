# Dashboard UI/UX Revamp — Full Frontend Rewrite

## TL;DR

> **Quick Summary**: Complete frontend rewrite of AI/LLM Gateway/Proxy dashboard from vanilla HTML/CSS/JS to Next.js + React + Tailwind CSS + shadcn/ui. New design system (Slate + Sky Blue, Inter font, dark-first), sidebar navigation, charts, micro-animations, and full responsiveness.
> 
> **Deliverables**:
> - New Next.js frontend application (separate process from Express backend)
> - Complete design system with dark/light theme toggle
> - 9 dashboard pages with sidebar navigation
> - Charts & data visualization (Recharts)
> - Backend API endpoints for time-series chart data
> - Responsive design (mobile → desktop)
> - Basic component tests
> 
> **Estimated Effort**: XL (full rewrite + new features)
> **Parallel Execution**: YES - 5 waves
> **Critical Path**: Project Setup → Design System → Layout Shell → Core Pages → Charts + Polish

---

## Context

### Original Request
User wants a complete UI/UX revamp of their AI/LLM Gateway/Proxy dashboard. Every visual aspect needs improvement: layout, style, color palette, font, navigation, and overall moderness. Migration from vanilla to modern React stack.

### Interview Summary
**Key Discussions**:
- **Stack**: Vanilla HTML/CSS/JS → Next.js + React + Tailwind + shadcn/ui
- **Style**: Minimalist/Clean + Bento Grid + Soft/Rounded Modern
- **Colors**: Slate + Sky Blue (calm, modern, clean). AVOID indigo, violet, teal
- **Theme**: Dark mode default + light mode toggle
- **Font**: Inter (Google Fonts)
- **Icons**: Material Design icons via `react-icons/md` (CSS-in-JS free, tree-shakeable)
- **Charts**: Recharts (request volume, token consumption, performance, provider health)
- **Navigation**: Sidebar + Top bar combo
- **Component lib**: shadcn/ui
- **State**: TanStack Query
- **Backend**: Express stays, Next.js separate process
- **Charts data**: New backend endpoints needed
- **Responsive**: Fully responsive
- **Tests**: Basic tests for key components
- **Branding**: Fresh start total

**Research Findings**:
- Current frontend: 3 files (index.html ~500 lines, app.js ~960 lines, style.css ~390 lines)
- Current API: ~45 endpoints across /api/* and /v1/*
- Real-time: SSE for bot logs (one stream endpoint)
- Auth: Optional shared password (no sessions/JWT)
- State: File-backed JSON (history.json, tempmail.json, settings.json, state.json, filters.json)
- No existing test infrastructure

### Metis Review
**Identified Gaps** (addressed):
- Deployment model → Separate process (Next.js on its own port)
- Chart data source → New backend endpoints for time-series aggregation
- URL routing → Tabs become routes with deep-linking
- SSE handling → Custom EventSource hook
- Multi-user model → Shared instance with optional password auth
- Scope creep risk → Locked: backend changes ONLY for chart aggregation endpoints

---

## Work Objectives

### Core Objective
Rebuild the dashboard frontend as a modern, responsive, visually polished Next.js application that consumes the existing Express API, adding charts and improved UX while maintaining all current functionality.

### Concrete Deliverables
- `/dashboard` — Next.js app in project root (e.g., `dashboard/` directory)
- Design system: Tailwind config + CSS variables + shadcn/ui theme
- 9 pages: Overview, Provider Pool, Accounts, Proxies, Run Bot, Temp Mail, History, Content Filter, Settings
- Sidebar navigation component with collapse/expand
- Top bar with search, theme toggle, breadcrumb
- Charts: 4 chart types (line, bar, area, status grid)
- Dark/Light theme with system preference detection
- Skeleton loading states for all data-fetching components
- Toast notification system
- Backend: 3-4 new aggregation API endpoints for charts
- Basic tests for critical components (layout, navigation, theme toggle)

### Definition of Done
- [ ] `npm run build` succeeds with zero errors
- [ ] All 9 pages render correctly in dark and light mode
- [ ] Sidebar navigation works with active state indicators
- [ ] Charts display data from new API endpoints
- [ ] Responsive: usable on 375px mobile through 1440px desktop
- [ ] Lighthouse accessibility score ≥ 90
- [ ] Basic component tests pass

### Must Have
- All current dashboard functionality preserved (no feature regression)
- Dark mode as default with light mode toggle
- Sidebar navigation with icons + labels
- Inter font loaded via Google Fonts / next/font
- Slate + Sky Blue color palette
- shadcn/ui components for all UI elements
- TanStack Query for all API data fetching
- Recharts for data visualization
- Skeleton loading states
- Toast notifications
- Fully responsive layout

### Must NOT Have (Guardrails)
- NO indigo, violet, or teal colors anywhere
- NO emoji as icons (use Material Icons only)
- NO changes to existing Express API endpoints (only ADD new `/api/stats/*` endpoints for charts)
- NO backend features that don't have existing endpoints (e.g., no "test proxy", no "test filter against text" — unless endpoint exists)
- NO authentication system changes
- NO business logic changes
- NO over-engineered abstractions (keep components focused and simple)
- NO CSS-in-JS (Tailwind only — no Emotion, styled-components, or MUI styling)
- NO @mui/icons-material (use react-icons/md instead — zero CSS-in-JS dependency)
- NO client-side routing that breaks deep-linking
- NO placeholder/dummy data in production — all data from real API
- NO excessive animations that hurt performance (keep under 300ms)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (setting up fresh)
- **Automated tests**: YES (tests-after, basic coverage for key components)
- **Framework**: Vitest + React Testing Library + Playwright (e2e for critical flows)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Build/Config**: Use Bash — Run build commands, verify output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
├── Task 1: Next.js project scaffolding + config [quick]
├── Task 2: Design system (Tailwind config + CSS vars + theme) [deep]
├── Task 3: shadcn/ui setup + base component customization [quick]
├── Task 4: TypeScript types for all API responses [quick]
├── Task 5: TanStack Query setup + API client utility [quick]
├── Task 6: Backend chart aggregation endpoints [unspecified-high]

Wave 2 (Layout Shell — after Wave 1):
├── Task 7: Sidebar navigation component (depends: 2, 3) [visual-engineering]
├── Task 8: Top bar component (depends: 2, 3) [visual-engineering]
├── Task 9: Layout shell + theme provider + responsive wrapper (depends: 2, 3, 7, 8) [visual-engineering]
├── Task 10: Toast notification system (depends: 3) [quick]
├── Task 11: Skeleton loading components (depends: 2, 3) [quick]
├── Task 12: SSE hook for real-time data (depends: 5) [quick]

Wave 3 (Core Pages — after Wave 2, MAX PARALLEL):
├── Task 13: Overview page + charts (depends: 6, 9, 11) [deep]
├── Task 14: Provider Pool page (depends: 9, 11) [unspecified-high]
├── Task 15: Accounts page (depends: 9, 11) [unspecified-high]
├── Task 16: Proxies page (depends: 9, 11) [unspecified-high]
├── Task 17: Run Bot page + SSE integration (depends: 9, 11, 12) [deep]
├── Task 18: Temp Mail page (depends: 9, 11) [unspecified-high]
├── Task 19: History page (depends: 9, 11) [unspecified-high]
├── Task 20: Content Filter page (depends: 9, 11) [unspecified-high]
├── Task 21: Settings page (depends: 9, 11) [unspecified-high]

Wave 4 (Polish + Integration — after Wave 3):
├── Task 22: Micro-animations + transitions (depends: 13-21) [visual-engineering]
├── Task 23: Responsive fine-tuning + mobile nav (depends: 13-21) [visual-engineering]
├── Task 24: Dark/Light theme polish + contrast verification (depends: 13-21) [visual-engineering]
├── Task 25: Error states + empty states for all pages (depends: 13-21) [unspecified-high]

Wave 5 (Testing + Final — after Wave 4):
├── Task 26: Test infrastructure setup (Vitest + RTL + Playwright) [quick]
├── Task 27: Component tests (layout, nav, theme, key interactions) [unspecified-high]
├── Task 28: E2E tests (critical user flows) [unspecified-high]
├── Task 29: Build optimization + performance audit [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | - | 2-6, all | 1 |
| 2 | 1 | 7, 8, 9, 11, 22-24 | 1 |
| 3 | 1 | 7, 8, 9, 10, 11 | 1 |
| 4 | 1 | 5, 13-21 | 1 |
| 5 | 1, 4 | 12, 13-21 | 1 |
| 6 | - | 13 | 1 |
| 7 | 2, 3 | 9 | 2 |
| 8 | 2, 3 | 9 | 2 |
| 9 | 2, 3, 7, 8 | 13-21 | 2 |
| 10 | 3 | 13-21 | 2 |
| 11 | 2, 3 | 13-21 | 2 |
| 12 | 5 | 17 | 2 |
| 13 | 6, 9, 11 | 22-25 | 3 |
| 14-16 | 9, 11 | 22-25 | 3 |
| 17 | 9, 11, 12 | 22-25 | 3 |
| 18-21 | 9, 11 | 22-25 | 3 |
| 22-24 | 13-21 | 26-29 | 4 |
| 25 | 13-21 | 26-29 | 4 |
| 26 | 22-25 | 27, 28 | 5 |
| 27-28 | 26 | F1-F4 | 5 |
| 29 | 22-25 | F1-F4 | 5 |

### Agent Dispatch Summary

- **Wave 1**: 6 tasks — T1 `quick`, T2 `deep`, T3 `quick`, T4 `quick`, T5 `quick`, T6 `unspecified-high`
- **Wave 2**: 6 tasks — T7 `visual-engineering`, T8 `visual-engineering`, T9 `visual-engineering`, T10 `quick`, T11 `quick`, T12 `quick`
- **Wave 3**: 9 tasks — T13 `deep`, T14-T16 `unspecified-high`, T17 `deep`, T18-T21 `unspecified-high`
- **Wave 4**: 4 tasks — T22-T24 `visual-engineering`, T25 `unspecified-high`
- **Wave 5**: 4 tasks — T26 `quick`, T27-T28 `unspecified-high`, T29 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Next.js Project Scaffolding + Config

  **What to do**:
  - Create `dashboard/` directory in project root
  - Initialize Next.js 14+ with App Router, TypeScript, Tailwind CSS
  - Configure `next.config.js` with API proxy to Express backend (rewrite `/api/*` → `http://localhost:PORT/api/*`)
  - Set up path aliases (`@/components`, `@/lib`, `@/hooks`, `@/types`)
  - Add `.env.local` with `NEXT_PUBLIC_API_URL` pointing to Express backend
  - Install core dependencies: `@tanstack/react-query`, `recharts`, `react-icons` (for Material Design icons via `react-icons/md`), `next-themes`
  - Configure ESLint + Prettier for consistent code style
  - Add `package.json` scripts: `dev`, `build`, `start`, `lint`, `test`

  **Must NOT do**:
  - Do NOT modify any files outside `dashboard/` directory
  - Do NOT install CSS-in-JS libraries
  - Do NOT use Pages Router (use App Router only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard scaffolding with well-known tools, no complex logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: Not needed for scaffolding, only config

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Tasks 2, 3, 4, 5 (all need project to exist)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `server/index.js:1-30` — Express server port and startup to know which port to proxy to
  - `server/routes/api.js:1-20` — API route prefix pattern to configure Next.js rewrites

  **API/Type References**:
  - `package.json` — Current project root package.json to understand existing scripts/deps

  **External References**:
  - Next.js App Router docs: https://nextjs.org/docs/app
  - Tailwind CSS + Next.js setup: https://tailwindcss.com/docs/guides/nextjs

  **WHY Each Reference Matters**:
  - `server/index.js` — Need the Express port number to configure API proxy correctly
  - `server/routes/api.js` — Need to know the exact route prefix pattern for rewrites

  **Acceptance Criteria**:
  - [ ] `cd dashboard && npm run dev` starts without errors
  - [ ] `cd dashboard && npm run build` completes successfully
  - [ ] Visiting `http://localhost:3000` shows Next.js default page
  - [ ] API proxy works: `curl http://localhost:3000/api/overview` returns data from Express

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dev server starts successfully
    Tool: Bash
    Preconditions: Express backend running on port 4141
    Steps:
      1. cd dashboard && npm run dev (background, wait 10s)
      2. curl -s http://localhost:3000 → should return HTML with Next.js markers
      3. Kill dev server
    Expected Result: HTTP 200 with HTML content containing "__next"
    Failure Indicators: Connection refused, build errors in terminal output
    Evidence: .sisyphus/evidence/task-1-dev-server.txt

  Scenario: API proxy forwards to Express
    Tool: Bash
    Preconditions: Express backend running on port 4141, Next.js dev server running on port 3000
    Steps:
      1. curl -s http://localhost:3000/api/overview → should return JSON with pool/config data
      2. Compare response with direct curl to Express: curl -s http://localhost:4141/api/overview
    Expected Result: Both responses are identical JSON (containing "pool", "config" keys)
    Failure Indicators: 404, CORS error, empty response, connection refused
    Evidence: .sisyphus/evidence/task-1-api-proxy.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): scaffold Next.js project with Tailwind and core deps`
  - Files: `dashboard/*`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 2. Design System — Tailwind Config + CSS Variables + Theme

  **What to do**:
  - Configure `tailwind.config.ts` with custom color palette:
    - **Slate** tones for backgrounds/surfaces (slate-900 → slate-50)
    - **Sky blue** for primary accent (sky-400/sky-500 range)
    - Semantic colors: success (emerald), warning (amber), danger (rose)
    - Surface colors: dark mode (slate-900, slate-800, slate-700) / light mode (white, slate-50, slate-100)
  - Set up CSS variables in `globals.css` for theme switching (HSL format for shadcn/ui compatibility)
  - Configure `next-themes` for dark/light mode with system preference detection
  - Define spacing scale (4px base, 8px rhythm)
  - Define border-radius tokens (sm: 6px, md: 8px, lg: 12px, xl: 16px)
  - Define shadow tokens (subtle elevation system for cards/modals)
  - Configure Inter font via `next/font/google` with proper subsets and weights (400, 500, 600, 700)
  - Define typography scale: xs(12), sm(14), base(16), lg(18), xl(20), 2xl(24), 3xl(30), 4xl(36)

  **Must NOT do**:
  - NO indigo, violet, or teal in the palette
  - NO raw hex values in components (use Tailwind classes only)
  - NO more than 2 font weights for body text (400, 500)
  - NO shadows heavier than `shadow-lg` for cards

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Design system requires careful color theory, contrast verification, and systematic token architecture
  - **Skills**: [`ui-ux-pro-max`]
    - `ui-ux-pro-max`: Color palette selection, typography scale, spacing system, dark mode pairing rules
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: Overlaps with ui-ux-pro-max for this specific task

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1 creates project)
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: Tasks 7, 8, 9, 11, 22, 23, 24
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `server/public/style.css:1-50` — Current CSS variables to understand existing color semantics and ensure feature parity

  **External References**:
  - shadcn/ui theming: https://ui.shadcn.com/docs/theming
  - Tailwind CSS colors: https://tailwindcss.com/docs/customizing-colors
  - next-themes: https://github.com/pacocoursey/next-themes

  **WHY Each Reference Matters**:
  - `style.css` — Maps current semantic colors (--ok, --warn, --danger) to new system so no meaning is lost
  - shadcn/ui theming — MUST follow their HSL variable convention for components to work

  **Acceptance Criteria**:
  - [ ] `tailwind.config.ts` has complete custom color palette (no indigo/violet/teal)
  - [ ] `globals.css` has HSL variables for both dark and light themes
  - [ ] Inter font loads via next/font (no FOIT)
  - [ ] Dark mode: text contrast ≥ 4.5:1 on all surface colors
  - [ ] Light mode: text contrast ≥ 4.5:1 on all surface colors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Theme variables render correctly in dark mode
    Tool: Playwright
    Preconditions: Next.js dev server running with a test page that shows all color tokens
    Steps:
      1. Navigate to http://localhost:3000 (dark mode default)
      2. Inspect body background → should be slate-900 equivalent
      3. Inspect text color → should be slate-50/white equivalent
      4. Inspect accent element → should be sky-400/500
      5. Screenshot full page
    Expected Result: Dark theme with slate backgrounds, light text, sky blue accents
    Failure Indicators: White background (light mode showing), missing colors, FOUT
    Evidence: .sisyphus/evidence/task-2-dark-theme.png

  Scenario: Theme toggle switches to light mode
    Tool: Playwright
    Preconditions: Theme toggle button exists on page
    Steps:
      1. Navigate to http://localhost:3000
      2. Click theme toggle button
      3. Verify body background changes to white/slate-50
      4. Verify text changes to slate-900
      5. Screenshot
    Expected Result: Light theme with white backgrounds, dark text, sky blue accents maintained
    Failure Indicators: No visual change, flash of wrong theme, broken contrast
    Evidence: .sisyphus/evidence/task-2-light-theme.png

  Scenario: No forbidden colors in Tailwind config
    Tool: Bash
    Preconditions: tailwind.config.ts exists
    Steps:
      1. grep -i "indigo\|violet\|teal" dashboard/tailwind.config.ts
    Expected Result: Zero matches (empty output)
    Failure Indicators: Any line containing indigo, violet, or teal
    Evidence: .sisyphus/evidence/task-2-no-forbidden-colors.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(dashboard): implement design system with Slate+Sky palette and Inter font`
  - Files: `dashboard/tailwind.config.ts`, `dashboard/src/app/globals.css`, `dashboard/src/lib/fonts.ts`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 3. shadcn/ui Setup + Base Component Customization

  **What to do**:
  - Initialize shadcn/ui with `npx shadcn-ui@latest init` (New York style, slate base)
  - Install essential components: Button, Card, Input, Select, Table, Dialog, Sheet, Tabs, Badge, Tooltip, Toast (Sonner), Skeleton, DropdownMenu, Avatar, Separator, ScrollArea
  - Customize component themes to match Slate + Sky Blue palette
  - Ensure all components respect dark/light mode via CSS variables
  - Create `components/ui/` directory structure following shadcn/ui conventions

  **Must NOT do**:
  - Do NOT modify shadcn/ui component internals heavily (keep upgradeable)
  - Do NOT add components not needed yet (install on-demand later)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard shadcn/ui installation with minimal customization
  - **Skills**: [`ckm:ui-styling`]
    - `ckm:ui-styling`: shadcn/ui component setup and Tailwind theming patterns
  - **Skills Evaluated but Omitted**:
    - `ui-ux-pro-max`: Already covered in Task 2 for design system

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1, parallel with Task 2)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: Tasks 7, 8, 9, 10, 11
  - **Blocked By**: Task 1

  **References**:

  **External References**:
  - shadcn/ui installation: https://ui.shadcn.com/docs/installation/next
  - shadcn/ui components: https://ui.shadcn.com/docs/components
  - Sonner toast: https://sonner.emilkowal.dev/

  **WHY Each Reference Matters**:
  - shadcn/ui docs — Exact init commands and component install syntax
  - Sonner — The toast library shadcn/ui uses, need to configure provider

  **Acceptance Criteria**:
  - [ ] `components.json` exists with correct configuration
  - [ ] All listed components installed in `dashboard/src/components/ui/`
  - [ ] Components render correctly in both dark and light mode
  - [ ] `cd dashboard && npm run build` passes with all components

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: shadcn/ui components render without errors
    Tool: Playwright
    Preconditions: Test page exists showing Button, Card, Input, Badge, Skeleton
    Steps:
      1. Navigate to http://localhost:3000/test-components (temporary test page)
      2. Verify Button renders with sky-blue primary color
      3. Verify Card has proper border-radius and shadow
      4. Verify Skeleton animates (shimmer effect)
      5. Screenshot
    Expected Result: All components visible, styled correctly, no console errors
    Failure Indicators: Unstyled components, missing imports, hydration errors
    Evidence: .sisyphus/evidence/task-3-components.png

  Scenario: Build succeeds with all components
    Tool: Bash
    Preconditions: All components installed
    Steps:
      1. cd dashboard && npm run build
      2. Check exit code
    Expected Result: Exit code 0, no TypeScript errors
    Failure Indicators: Non-zero exit code, type errors, missing module errors
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `feat(dashboard): setup shadcn/ui with customized components`
  - Files: `dashboard/src/components/ui/*`, `dashboard/components.json`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 4. TypeScript Types for All API Responses

  **What to do**:
  - Create `dashboard/src/types/` directory
  - Define TypeScript interfaces for ALL API response shapes:
    - `api.ts`: Base response types, pagination, error shapes
    - `models.ts`: Model, Provider, ModelCapability types
    - `accounts.ts`: Account, AccountStatus types
    - `proxies.ts`: Proxy, ProxyStatus types
    - `history.ts`: HistoryEntry, HistoryFilter types
    - `settings.ts`: Settings, FilterConfig types
    - `tempmail.ts`: TempMailAccount, Email types
    - `stats.ts`: RequestStats, TokenStats, PerformanceMetrics, ProviderHealth types (for new chart endpoints)
  - Derive types from actual API responses (curl endpoints and inspect JSON structure)
  - Export all types from `types/index.ts` barrel file

  **Must NOT do**:
  - NO `any` types
  - NO overly generic types that lose specificity

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definitions from existing API responses, straightforward mapping
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6)
  - **Blocks**: Task 5, Tasks 13-21
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `server/routes/api.js` — All API endpoint handlers showing response shapes
  - `server/lib/modelCaps.js` — Model capability defaults (type structure)
  - `server/lib/config.js` — Config object shape

  **API/Type References**:
  - `server/public/app.js:100-300` — Frontend code that consumes API responses (shows expected shapes)

  **WHY Each Reference Matters**:
  - `api.js` — Source of truth for what each endpoint returns
  - `app.js` — Shows how data is consumed, revealing implicit type expectations

  **Acceptance Criteria**:
  - [ ] All type files created with zero `any` usage
  - [ ] Types match actual API response shapes (verified by curling endpoints)
  - [ ] `cd dashboard && npx tsc --noEmit` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Types compile without errors
    Tool: Bash
    Preconditions: All type files created
    Steps:
      1. cd dashboard && npx tsc --noEmit
    Expected Result: Exit code 0, no type errors
    Failure Indicators: Type errors, missing imports
    Evidence: .sisyphus/evidence/task-4-typecheck.txt

  Scenario: Types match actual API responses
    Tool: Bash
    Preconditions: Express backend running on port 4141
    Steps:
      1. curl -s http://localhost:4141/api/overview | python -m json.tool > /tmp/overview.json
      2. Verify JSON structure matches OverviewResponse type (has pool, kiro_pool, config keys)
      3. curl -s http://localhost:4141/api/accounts | python -m json.tool > /tmp/accounts.json
      4. Verify JSON structure matches AccountsResponse type (has entries array with idx, email, has_password)
      5. curl -s http://localhost:4141/api/filters | python -m json.tool > /tmp/filters.json
      6. Verify JSON structure matches FiltersResponse type (has filters array with id, pattern, replacement, target, active)
    Expected Result: All response shapes match their TypeScript definitions
    Failure Indicators: Missing fields, wrong types, unexpected nested structures
    Evidence: .sisyphus/evidence/task-4-api-shapes.txt
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(dashboard): add TypeScript types for all API responses`
  - Files: `dashboard/src/types/*`
  - Pre-commit: `cd dashboard && npx tsc --noEmit`

- [x] 5. TanStack Query Setup + API Client Utility

  **What to do**:
  - Create `dashboard/src/lib/api-client.ts` — Base fetch wrapper with:
    - Base URL from env variable
    - Error handling (parse error responses)
    - Optional auth header (shared password if configured)
    - Request/response interceptors for logging
  - Create `dashboard/src/lib/query-client.ts` — TanStack Query client config:
    - Default stale time: 30s for dashboard data
    - Retry: 2 attempts with exponential backoff
    - Refetch on window focus: true
  - Create `dashboard/src/hooks/` directory with query hooks:
    - `use-models.ts` — Fetch models/providers
    - `use-accounts.ts` — Fetch accounts
    - `use-proxies.ts` — Fetch proxies
    - `use-history.ts` — Fetch history with pagination/filters
    - `use-settings.ts` — Fetch/mutate settings
    - `use-stats.ts` — Fetch chart data from new endpoints
  - Set up QueryClientProvider in root layout

  **Must NOT do**:
  - NO direct fetch calls in components (always use hooks)
  - NO caching that could show stale critical data (provider status)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard TanStack Query setup pattern, well-documented
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6)
  - **Blocks**: Task 12, Tasks 13-21
  - **Blocked By**: Tasks 1, 4

  **References**:

  **Pattern References**:
  - `server/public/app.js:50-150` — Current fetch patterns showing all API endpoints called
  - `server/routes/api.js` — All available endpoints and their HTTP methods

  **External References**:
  - TanStack Query: https://tanstack.com/query/latest/docs/react/overview
  - TanStack Query with Next.js App Router: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr

  **WHY Each Reference Matters**:
  - `app.js` — Shows which endpoints are called, with what params, and how responses are used
  - `api.js` — Complete list of endpoints to create hooks for

  **Acceptance Criteria**:
  - [ ] QueryClientProvider wraps the app in root layout
  - [ ] All hooks return typed data (no `any`)
  - [ ] Error states handled in each hook
  - [ ] `cd dashboard && npm run build` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Query hooks fetch data successfully
    Tool: Playwright
    Preconditions: Express backend running, test page using useModels hook
    Steps:
      1. Navigate to http://localhost:3000 (page that uses useModels)
      2. Wait for data to load (no more skeleton/loading state)
      3. Verify model data appears on page
    Expected Result: Data from Express API renders on the Next.js page
    Failure Indicators: Infinite loading, network errors in console, empty data
    Evidence: .sisyphus/evidence/task-5-query-hooks.png

  Scenario: API client handles errors gracefully
    Tool: Playwright
    Preconditions: Express backend NOT running (stopped before test)
    Steps:
      1. Ensure Express backend is stopped (kill process on port 4141)
      2. Navigate to http://localhost:3000 in Playwright browser
      3. Wait for page to attempt data fetch (2-3 seconds)
      4. Verify error state component renders (not white screen/crash)
      5. Verify no unhandled promise rejection in console
      6. Screenshot the error state
    Expected Result: Error UI shown with message, no unhandled exceptions, no white screen
    Failure Indicators: White screen, browser console shows unhandled rejection, page crashes
    Evidence: .sisyphus/evidence/task-5-error-handling.png
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(dashboard): setup TanStack Query with typed API hooks`
  - Files: `dashboard/src/lib/api-client.ts`, `dashboard/src/lib/query-client.ts`, `dashboard/src/hooks/*`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 6. Backend Chart Aggregation Endpoints

  **What to do**:
  - Add new endpoints to `server/routes/api.js`:
    - `GET /api/stats/requests` — Request volume over time (hourly/daily buckets)
      - Query params: `period=1h|24h|7d|30d`
      - Response: `{ buckets: [{ timestamp, count, success, error }] }`
    - `GET /api/stats/tokens` — Token consumption by model/provider
      - Query params: `period=1h|24h|7d|30d`
      - Response: `{ byModel: [{ model, promptTokens, completionTokens, total }], byProvider: [...] }`
    - `GET /api/stats/performance` — Latency and error rates
      - Query params: `period=1h|24h|7d|30d`
      - Response: `{ avgLatency, p95Latency, errorRate, byProvider: [{ provider, avgLatency, errorRate }] }`
    - `GET /api/stats/health` — Provider health status
      - Response: `{ providers: [{ name, status: 'up'|'down'|'degraded', lastCheck, uptime }] }`
  - Aggregate data from existing `history.json` file (or in-memory if history is kept in memory)
  - Add simple in-memory stats collector that tracks requests as they flow through

  **Must NOT do**:
  - NO modifications to existing API endpoints
  - NO external database (keep file-based/in-memory)
  - NO breaking changes to existing functionality

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Backend logic with data aggregation, needs careful implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-5)
  - **Blocks**: Task 13 (Overview page with charts)
  - **Blocked By**: None (can start immediately, works on existing backend)

  **References**:

  **Pattern References**:
  - `server/routes/api.js` — Existing route patterns to follow for consistency
  - `server/index.js` — How routes are registered, middleware chain
  - `server/lib/config.js` — How to access shared state/config

  **API/Type References**:
  - `server/routes/openai.js` — Where requests flow through (intercept point for stats collection)

  **WHY Each Reference Matters**:
  - `api.js` — Follow existing route registration pattern
  - `openai.js` — This is where API requests are proxied; stats collection hooks here
  - `config.js` — Access to shared state for storing stats

  **Acceptance Criteria**:
  - [ ] All 4 new endpoints return valid JSON
  - [ ] `GET /api/stats/requests?period=24h` returns time-bucketed data
  - [ ] `GET /api/stats/health` returns current provider statuses
  - [ ] Existing endpoints still work (no regression)
  - [ ] Stats accumulate as requests flow through the proxy

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Stats endpoints return valid data
    Tool: Bash
    Preconditions: Express backend running with some request history
    Steps:
      1. curl -s http://localhost:PORT/api/stats/requests?period=24h | python -m json.tool
      2. Verify response has "buckets" array with timestamp and count fields
      3. curl -s http://localhost:PORT/api/stats/tokens?period=24h | python -m json.tool
      4. Verify response has "byModel" and "byProvider" arrays
      5. curl -s http://localhost:PORT/api/stats/performance?period=24h | python -m json.tool
      6. Verify response has "avgLatency" and "errorRate" fields
      7. curl -s http://localhost:PORT/api/stats/health | python -m json.tool
      8. Verify response has "providers" array with status field
    Expected Result: All 4 endpoints return 200 with correctly structured JSON
    Failure Indicators: 404, 500, malformed JSON, missing fields
    Evidence: .sisyphus/evidence/task-6-stats-endpoints.txt

  Scenario: Existing endpoints not broken
    Tool: Bash
    Preconditions: Express backend running with new stats code
    Steps:
      1. curl -s http://localhost:PORT/api/models → should still return models
      2. curl -s http://localhost:PORT/api/accounts → should still return accounts
      3. curl -s http://localhost:PORT/api/config → should still return config
    Expected Result: All existing endpoints return same data as before
    Failure Indicators: Different response shape, errors, missing data
    Evidence: .sisyphus/evidence/task-6-no-regression.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add chart aggregation endpoints for dashboard stats`
  - Files: `server/routes/api.js`, `server/lib/stats.js` (new)
  - Pre-commit: `node server/index.js` (verify starts without error)

- [x] 7. Sidebar Navigation Component

  **What to do**:
  - Create `dashboard/src/components/layout/sidebar.tsx`
  - Implement collapsible sidebar with:
    - Logo/brand area at top (fresh design — simple text logo or icon)
    - 9 navigation items with `react-icons/md` Material Design icons + labels:
      1. Overview (MdDashboard)
      2. Provider Pool (MdCloud)
      3. Accounts (MdPeople)
      4. Proxies (MdRouter)
      5. Run Bot (MdSmartToy)
      6. Temp Mail (MdMail)
      7. History (MdHistory)
      8. Content Filter (MdFilterList)
      9. Settings (MdSettings)
    - Active state indicator (sky-blue highlight + left border)
    - Collapse/expand toggle (icon-only mode when collapsed)
    - Smooth transition animation (width change, 200ms ease-out)
    - Responsive: hidden on mobile, replaced by hamburger menu
  - Use Next.js `usePathname()` for active state detection
  - Persist collapse state in localStorage

  **Must NOT do**:
  - NO emoji icons
  - NO more than 9 items (no sub-menus for now)
  - NO horizontal scrolling in sidebar

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Navigation component with animations, responsive behavior, and visual polish
  - **Skills**: [`ui-ux-pro-max`, `frontend-design`]
    - `ui-ux-pro-max`: Navigation patterns, active states, sidebar best practices
    - `frontend-design`: Polished component implementation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 10, 11, 12)
  - **Blocks**: Task 9 (Layout shell)
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `server/public/index.html:20-60` — Current tab navigation items (names and order to preserve)
  - `server/public/style.css:50-100` — Current nav styling for reference

  **External References**:
  - shadcn/ui Sheet component (for mobile drawer): https://ui.shadcn.com/docs/components/sheet
  - react-icons Material Design: https://react-icons.github.io/react-icons/icons/md/

  **WHY Each Reference Matters**:
  - `index.html` — Exact tab names and order that users are familiar with
  - shadcn/ui Sheet — Mobile sidebar implementation pattern

  **Acceptance Criteria**:
  - [ ] Sidebar renders with all 9 items + icons
  - [ ] Active state highlights current page
  - [ ] Collapse/expand works with smooth animation
  - [ ] Collapsed state persists across page refreshes
  - [ ] Mobile: sidebar hidden, hamburger menu opens Sheet/drawer

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Sidebar navigation works on desktop
    Tool: Playwright
    Preconditions: Layout shell rendered at 1440px viewport
    Steps:
      1. Navigate to http://localhost:3000 at viewport 1440x900
      2. Verify sidebar visible with all 9 items (check for text "Overview", "Provider Pool", etc.)
      3. Click "Provider Pool" nav item
      4. Verify URL changes to /provider-pool
      5. Verify "Provider Pool" item has active styling (sky-blue indicator)
      6. Click collapse toggle
      7. Verify sidebar width reduces, only icons visible
      8. Refresh page → verify sidebar stays collapsed
    Expected Result: Full navigation flow works, collapse persists
    Failure Indicators: Missing items, no active state, collapse doesn't persist
    Evidence: .sisyphus/evidence/task-7-sidebar-desktop.png

  Scenario: Mobile navigation via hamburger menu
    Tool: Playwright
    Preconditions: Layout rendered at 375px viewport
    Steps:
      1. Set viewport to 375x812
      2. Verify sidebar is NOT visible
      3. Verify hamburger menu icon is visible
      4. Click hamburger icon
      5. Verify Sheet/drawer opens with all 9 nav items
      6. Click "History" item
      7. Verify drawer closes and URL changes to /history
    Expected Result: Mobile nav works via drawer, closes on selection
    Failure Indicators: Sidebar visible on mobile, drawer doesn't open, nav doesn't work
    Evidence: .sisyphus/evidence/task-7-sidebar-mobile.png
  ```

  **Commit**: YES (groups with Tasks 8, 9)
  - Message: `feat(dashboard): add collapsible sidebar navigation`
  - Files: `dashboard/src/components/layout/sidebar.tsx`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 8. Top Bar Component

  **What to do**:
  - Create `dashboard/src/components/layout/topbar.tsx`
  - Implement top bar with:
    - Breadcrumb showing current page name
    - Search input (global search, can be placeholder for now)
    - Theme toggle button (sun/moon icon, uses next-themes)
    - Optional: user avatar/status indicator
  - Fixed position, doesn't scroll with content
  - Responsive: on mobile, shows hamburger + page title + theme toggle
  - Subtle bottom border or shadow for separation from content

  **Must NOT do**:
  - NO duplicate navigation in top bar (sidebar handles nav)
  - NO heavy visual weight (keep minimal, content is king)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Layout component with responsive behavior and theme integration
  - **Skills**: [`frontend-design`]
    - `frontend-design`: Clean, polished header implementation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 10, 11, 12)
  - **Blocks**: Task 9 (Layout shell)
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `server/public/style.css:1-30` — Current topbar styling (`.topbar` class)

  **External References**:
  - next-themes usage: https://github.com/pacocoursey/next-themes#usage
  - shadcn/ui Breadcrumb: https://ui.shadcn.com/docs/components/breadcrumb

  **WHY Each Reference Matters**:
  - Current topbar — Understand what info was shown before to maintain familiarity
  - next-themes — Correct API for theme toggle implementation

  **Acceptance Criteria**:
  - [ ] Top bar renders with breadcrumb, search, theme toggle
  - [ ] Theme toggle switches between dark/light mode
  - [ ] Fixed position, content scrolls beneath
  - [ ] Responsive layout adjusts for mobile

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Top bar renders correctly with theme toggle
    Tool: Playwright
    Preconditions: Layout shell with topbar at 1440px
    Steps:
      1. Navigate to http://localhost:3000/provider-pool
      2. Verify breadcrumb shows "Provider Pool"
      3. Verify theme toggle icon visible (moon icon for dark mode)
      4. Click theme toggle
      5. Verify page switches to light mode
      6. Verify toggle icon changes to sun
      7. Screenshot both states
    Expected Result: Breadcrumb accurate, theme toggle functional
    Failure Indicators: Wrong breadcrumb, toggle doesn't work, flash of wrong theme
    Evidence: .sisyphus/evidence/task-8-topbar.png

  Scenario: Top bar stays fixed on scroll
    Tool: Playwright
    Preconditions: Page with enough content to scroll
    Steps:
      1. Navigate to page with scrollable content
      2. Scroll down 500px
      3. Verify top bar still visible at top of viewport
    Expected Result: Top bar remains fixed, content scrolls beneath
    Failure Indicators: Top bar scrolls away, content overlaps top bar
    Evidence: .sisyphus/evidence/task-8-topbar-fixed.png
  ```

  **Commit**: YES (groups with Tasks 7, 9)
  - Message: `feat(dashboard): add top bar with breadcrumb and theme toggle`
  - Files: `dashboard/src/components/layout/topbar.tsx`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 9. Layout Shell + Theme Provider + Responsive Wrapper

  **What to do**:
  - Create `dashboard/src/app/layout.tsx` (root layout):
    - ThemeProvider (next-themes) wrapping entire app
    - QueryClientProvider (TanStack Query)
    - Toaster component (Sonner)
    - Inter font applied to body
  - Create `dashboard/src/components/layout/dashboard-layout.tsx`:
    - Sidebar (left) + Main content area (right) using CSS Grid/Flex
    - Top bar above main content
    - Main content area with proper padding and max-width
    - Responsive: sidebar collapses on tablet, hidden on mobile
  - Create `dashboard/src/app/(dashboard)/layout.tsx` — Route group layout that applies dashboard shell
  - Set up route structure:
    - `/` → Overview (redirect or default)
    - `/provider-pool`
    - `/accounts`
    - `/proxies`
    - `/run-bot`
    - `/temp-mail`
    - `/history`
    - `/content-filter`
    - `/settings`

  **Must NOT do**:
  - NO nested layouts that cause re-renders on navigation
  - NO layout shift when sidebar collapses

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Core layout architecture with responsive grid, multiple providers, route structure
  - **Skills**: [`ui-ux-pro-max`, `frontend-design`]
    - `ui-ux-pro-max`: Layout patterns, responsive breakpoints, spacing
    - `frontend-design`: Production-grade layout implementation

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs Tasks 7, 8 complete)
  - **Parallel Group**: Wave 2 (sequential after 7, 8)
  - **Blocks**: Tasks 13-21 (all pages)
  - **Blocked By**: Tasks 2, 3, 7, 8

  **References**:

  **Pattern References**:
  - `server/public/index.html:1-20` — Current page structure (topbar + main content)
  - `server/public/style.css:100-150` — Current layout CSS (grid/flex patterns)

  **External References**:
  - Next.js App Router layouts: https://nextjs.org/docs/app/building-your-application/routing/layouts-and-templates
  - Next.js route groups: https://nextjs.org/docs/app/building-your-application/routing/route-groups

  **WHY Each Reference Matters**:
  - Current layout — Understand content area sizing and spacing expectations
  - Next.js layouts — Correct pattern for nested layouts with App Router

  **Acceptance Criteria**:
  - [ ] Root layout has ThemeProvider + QueryClientProvider + Toaster
  - [ ] Dashboard layout shows sidebar + topbar + content area
  - [ ] All 9 routes accessible and render placeholder content
  - [ ] Responsive: proper layout at 375px, 768px, 1024px, 1440px
  - [ ] No layout shift on navigation between pages

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Layout renders correctly at all breakpoints
    Tool: Playwright
    Preconditions: Dashboard layout with sidebar and topbar
    Steps:
      1. Navigate to http://localhost:3000 at 1440x900 → screenshot
      2. Resize to 1024x768 → verify sidebar still visible → screenshot
      3. Resize to 768x1024 → verify sidebar collapsed to icons → screenshot
      4. Resize to 375x812 → verify sidebar hidden, hamburger visible → screenshot
    Expected Result: Layout adapts correctly at each breakpoint
    Failure Indicators: Overflow, broken grid, sidebar overlapping content
    Evidence: .sisyphus/evidence/task-9-layout-responsive.png

  Scenario: Navigation between routes works
    Tool: Playwright
    Preconditions: All routes set up with placeholder pages
    Steps:
      1. Navigate to / → verify redirects to overview or shows overview
      2. Click "Accounts" in sidebar → verify URL is /accounts
      3. Click "Settings" → verify URL is /settings
      4. Browser back → verify returns to /accounts
      5. Direct URL: navigate to /history → verify page loads
    Expected Result: All routes work, back/forward preserved, deep-linking works
    Failure Indicators: 404 on routes, broken back button, no deep-linking
    Evidence: .sisyphus/evidence/task-9-routing.txt
  ```

  **Commit**: YES (groups with Tasks 7, 8)
  - Message: `feat(dashboard): implement layout shell with responsive grid and routing`
  - Files: `dashboard/src/app/layout.tsx`, `dashboard/src/app/(dashboard)/layout.tsx`, `dashboard/src/components/layout/dashboard-layout.tsx`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 10. Toast Notification System

  **What to do**:
  - Configure Sonner toast provider in root layout (already part of shadcn/ui)
  - Create `dashboard/src/lib/toast.ts` utility with typed helpers:
    - `showSuccess(message)` — Green checkmark toast
    - `showError(message)` — Red error toast with optional retry action
    - `showWarning(message)` — Amber warning toast
    - `showInfo(message)` — Neutral info toast
    - `showLoading(message)` → returns dismiss function
  - Style toasts to match design system (slate surfaces, proper contrast)
  - Position: bottom-right on desktop, bottom-center on mobile
  - Auto-dismiss: 4 seconds (configurable)

  **Must NOT do**:
  - NO toasts that block interaction
  - NO more than 3 toasts visible simultaneously

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple utility setup with Sonner, minimal custom code
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 11, 12)
  - **Blocks**: Tasks 13-21 (pages use toasts for feedback)
  - **Blocked By**: Task 3

  **References**:

  **External References**:
  - Sonner docs: https://sonner.emilkowal.dev/
  - shadcn/ui Sonner integration: https://ui.shadcn.com/docs/components/sonner

  **WHY Each Reference Matters**:
  - Sonner — API for creating typed toasts with actions and auto-dismiss

  **Acceptance Criteria**:
  - [ ] All 5 toast types render with correct styling
  - [ ] Auto-dismiss after 4 seconds
  - [ ] Position correct on desktop and mobile
  - [ ] Max 3 visible at once

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Toast notifications display correctly
    Tool: Playwright
    Preconditions: Test page with buttons triggering each toast type
    Steps:
      1. Click "Show Success" button → verify green toast appears bottom-right
      2. Click "Show Error" button → verify red toast appears
      3. Wait 5 seconds → verify first toast auto-dismissed
      4. Trigger 4 toasts rapidly → verify max 3 visible
    Expected Result: Toasts appear, auto-dismiss, respect max limit
    Failure Indicators: Wrong position, no auto-dismiss, unlimited stacking
    Evidence: .sisyphus/evidence/task-10-toasts.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add toast notification system`
  - Files: `dashboard/src/lib/toast.ts`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 11. Skeleton Loading Components

  **What to do**:
  - Create reusable skeleton components in `dashboard/src/components/skeletons/`:
    - `card-skeleton.tsx` — Matches stat card dimensions
    - `table-skeleton.tsx` — Table with shimmer rows (configurable row count)
    - `chart-skeleton.tsx` — Chart area placeholder
    - `page-skeleton.tsx` — Full page skeleton combining card + table skeletons
    - `list-skeleton.tsx` — List items with avatar + text placeholders
  - Use shadcn/ui Skeleton primitive as base
  - Shimmer animation using Tailwind `animate-pulse`
  - Match exact dimensions of real components to prevent layout shift

  **Must NOT do**:
  - NO layout shift when real content replaces skeleton
  - NO skeleton that looks nothing like the final content

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple component variants using shadcn/ui Skeleton primitive
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 10, 12)
  - **Blocks**: Tasks 13-21 (all pages use skeletons)
  - **Blocked By**: Tasks 2, 3

  **References**:

  **External References**:
  - shadcn/ui Skeleton: https://ui.shadcn.com/docs/components/skeleton

  **WHY Each Reference Matters**:
  - shadcn/ui Skeleton — Base primitive API and animation pattern

  **Acceptance Criteria**:
  - [ ] All skeleton variants created
  - [ ] Shimmer animation works in both dark and light mode
  - [ ] Dimensions match real component sizes (no CLS)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skeletons match real component dimensions
    Tool: Playwright
    Preconditions: Page showing skeleton then real content after load
    Steps:
      1. Throttle network to slow 3G
      2. Navigate to overview page
      3. Screenshot during loading (skeleton visible)
      4. Wait for data to load
      5. Screenshot after load (real content)
      6. Compare dimensions — no layout shift
    Expected Result: Skeleton and real content occupy same space
    Failure Indicators: Content jumps when skeleton replaced, different heights
    Evidence: .sisyphus/evidence/task-11-skeleton-cls.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add skeleton loading components`
  - Files: `dashboard/src/components/skeletons/*`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 12. SSE Hook for Real-time Data

  **What to do**:
  - Create `dashboard/src/hooks/use-sse.ts` — Custom hook for Server-Sent Events:
    - Connect to Express SSE endpoint for bot logs
    - Auto-reconnect on disconnect (exponential backoff)
    - Parse incoming events and update local state
    - Cleanup on unmount
  - Create `dashboard/src/hooks/use-bot-logs.ts` — Specific hook for bot run logs:
    - Uses `use-sse` internally
    - Typed log entries
    - Buffer management (keep last N entries)

  **Must NOT do**:
  - NO WebSocket (Express uses SSE only)
  - NO memory leaks (proper cleanup)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard EventSource pattern, well-known implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 10, 11)
  - **Blocks**: Task 17 (Run Bot page)
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `server/public/app.js:400-500` — Current SSE connection code (EventSource usage)
  - `server/routes/api.js` — SSE endpoint path and event format

  **WHY Each Reference Matters**:
  - `app.js` — Shows exact SSE endpoint URL and how events are parsed
  - `api.js` — Server-side event format to match in the hook

  **Acceptance Criteria**:
  - [ ] SSE hook connects to Express endpoint
  - [ ] Auto-reconnects on disconnect
  - [ ] Properly cleans up on unmount
  - [ ] Typed event data

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: SSE connection receives real-time data
    Tool: Playwright
    Preconditions: Express backend running, bot running to generate logs
    Steps:
      1. Navigate to Run Bot page
      2. Start a bot run
      3. Verify log entries appear in real-time (within 1s of generation)
      4. Verify entries are properly formatted
    Expected Result: Real-time log streaming works
    Failure Indicators: No logs appear, connection errors, stale data
    Evidence: .sisyphus/evidence/task-12-sse.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add SSE hook for real-time bot logs`
  - Files: `dashboard/src/hooks/use-sse.ts`, `dashboard/src/hooks/use-bot-logs.ts`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 13. Overview Page + Charts

  **What to do**:
  - Create `dashboard/src/app/(dashboard)/page.tsx` (Overview/home page)
  - Bento grid layout with:
    - **Row 1**: 4 stat cards (Total Requests, Active Providers, Token Usage, Error Rate)
    - **Row 2**: Request volume line chart (Recharts) + Token consumption bar chart
    - **Row 3**: Provider health status grid + Performance metrics (latency chart)
  - Each card uses shadcn/ui Card with subtle shadow
  - Charts use Recharts with sky-blue primary color, slate grid lines
  - Skeleton loading while data fetches
  - Responsive: cards stack on mobile, charts full-width

  **Must NOT do**:
  - NO pie charts (use bar charts for proportions)
  - NO chart animations longer than 300ms
  - NO data that doesn't come from real API endpoints

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex page with multiple data sources, charts, responsive bento grid
  - **Skills**: [`ui-ux-pro-max`, `frontend-design`]
    - `ui-ux-pro-max`: Chart best practices, bento grid layout, data visualization
    - `frontend-design`: Polished dashboard page implementation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14-21)
  - **Blocks**: Tasks 22-25
  - **Blocked By**: Tasks 6, 9, 11

  **References**:

  **Pattern References**:
  - `server/routes/api.js:55-75` — `GET /api/overview` endpoint: returns pool summary, kiro pool summary, tempmail summary, account/proxy counts, job counts, and config
  
  **API/Type References**:
  - `dashboard/src/types/stats.ts` — Chart data types (from Task 4)
  - Existing: `GET /api/overview` — Summary stats for stat cards
  - New endpoints from Task 6: `/api/stats/requests`, `/api/stats/tokens`, `/api/stats/performance`, `/api/stats/health`

  **External References**:
  - Recharts docs: https://recharts.org/en-US/api
  - Recharts responsive container: https://recharts.org/en-US/api/ResponsiveContainer

  **WHY Each Reference Matters**:
  - Current overview — What metrics users expect to see
  - Stats types — Correct data shapes for chart components
  - Recharts — API for LineChart, BarChart, ResponsiveContainer

  **Acceptance Criteria**:
  - [ ] Bento grid layout with 4 stat cards + 4 chart areas
  - [ ] All charts render real data from /api/stats/* endpoints
  - [ ] Skeleton loading shown while data fetches
  - [ ] Responsive: stacks properly on mobile
  - [ ] Charts use sky-blue primary, slate-200 grid lines

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Overview page renders with charts
    Tool: Playwright
    Preconditions: Express backend running with stats endpoints, some history data
    Steps:
      1. Navigate to http://localhost:3000 at 1440x900
      2. Verify 4 stat cards visible with numeric values
      3. Verify line chart renders with data points
      4. Verify bar chart renders with bars
      5. Verify provider health grid shows provider statuses
      6. Screenshot full page
    Expected Result: Complete overview with real data in all sections
    Failure Indicators: Empty charts, "No data" states, broken layout
    Evidence: .sisyphus/evidence/task-13-overview.png

  Scenario: Overview responsive on mobile
    Tool: Playwright
    Preconditions: Same as above
    Steps:
      1. Set viewport to 375x812
      2. Verify stat cards stack vertically (1 per row)
      3. Verify charts are full-width and readable
      4. Verify no horizontal scroll
      5. Screenshot
    Expected Result: All content visible, properly stacked, no overflow
    Failure Indicators: Horizontal scroll, overlapping elements, unreadable charts
    Evidence: .sisyphus/evidence/task-13-overview-mobile.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): implement overview page with charts and bento grid`
  - Files: `dashboard/src/app/(dashboard)/page.tsx`, `dashboard/src/components/charts/*`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 14. Provider Pool Page

  **What to do**:
  - Create `dashboard/src/app/(dashboard)/provider-pool/page.tsx`
  - Display CodeBuddy key pool (from `GET /api/pool`) in a card/table:
    - Key (masked), email, status badge (active/cooldown/dead), last used, cooldown timer
    - Action: Set status via `POST /api/pool/:identifier/status` (active/cooldown/dead)
  - Display Kiro credential pool (from `GET /api/kiro/pool`) in separate section:
    - Label, status badge, last refreshed
    - Actions: Set status, Add credential, Remove credential
  - Reload pool button (`POST /api/pool/reload`, `POST /api/kiro/pool/reload`)
  - Status badges using semantic colors (emerald=active, amber=cooldown, rose=dead)
  - Skeleton loading state
  - Search/filter by email/label

  **Must NOT do**:
  - NO deletion without confirmation dialog
  - NO showing full API keys (already masked by backend)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Data-driven page with cards, actions, and state management
  - **Skills**: [`frontend-design`]
    - `frontend-design`: Card grid layout, action patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13, 15-21)
  - **Blocks**: Tasks 22-25
  - **Blocked By**: Tasks 9, 11

  **References**:

  **Pattern References**:
  - `server/routes/api.js:228-240` — CodeBuddy pool endpoints: `GET /api/pool`, `POST /api/pool/reload`, `POST /api/pool/:identifier/status`
  - `server/routes/api.js:77-110` — Kiro pool endpoints: `GET /api/kiro/pool`, `POST /api/kiro/pool`, `DELETE /api/kiro/pool/:idx`, `POST /api/kiro/pool/:idx/status`

  **API/Type References**:
  - `server/lib/keyPool.js` — Pool entry shape (key, email, status, lastUsedAt, cooldownUntil)
  - `dashboard/src/types/models.ts` — Provider/Pool type definitions

  **WHY Each Reference Matters**:
  - `api.js:228-240` — Exact endpoints for CodeBuddy pool CRUD and status changes
  - `api.js:77-110` — Exact endpoints for Kiro pool CRUD and status changes

  **Acceptance Criteria**:
  - [ ] CodeBuddy pool table displays with masked keys and status badges
  - [ ] Kiro pool section displays with labels and status badges
  - [ ] Status change works via `POST /api/pool/:identifier/status`
  - [ ] Reload pool button works
  - [ ] Search/filter functional
  - [ ] Skeleton loading on initial load
  - [ ] Confirmation dialog for remove/dead actions

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Provider pool displays keys with status
    Tool: Playwright
    Preconditions: Express backend with keys in pool (codebuddy_keys.txt has entries)
    Steps:
      1. Navigate to /provider-pool
      2. Verify CodeBuddy pool table renders with masked keys and status badges
      3. Verify at least one key shows "active" status (emerald badge)
      4. Verify Kiro pool section renders (may be empty if no creds)
    Expected Result: Pool entries displayed with correct status badges
    Failure Indicators: Empty page, missing status badges, API errors
    Evidence: .sisyphus/evidence/task-14-providers.png

  Scenario: Key status change works
    Tool: Playwright
    Preconditions: At least one active key in pool
    Steps:
      1. Find active key entry
      2. Click status dropdown/button → select "cooldown"
      3. Verify confirmation dialog appears
      4. Confirm action
      5. Verify key status badge changes to amber (cooldown)
      6. Verify toast notification shows success
    Expected Result: Key status updated, UI reflects change, toast confirms
    Failure Indicators: No confirmation, silent failure, UI doesn't update
    Evidence: .sisyphus/evidence/task-14-status-change.png
  ```

  **Commit**: YES (groups with Tasks 15, 16)
  - Message: `feat(dashboard): implement provider pool page`
  - Files: `dashboard/src/app/(dashboard)/provider-pool/page.tsx`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 15. Accounts Page

  **What to do**:
  - Create `dashboard/src/app/(dashboard)/accounts/page.tsx`
  - Data table (shadcn/ui Table) showing Google accounts for bot signup (from `GET /api/accounts`):
    - Columns: Index, Email, Has Password (boolean), Actions
    - Sortable columns
  - Actions: Add accounts (bulk paste textarea, `POST /api/accounts`), Delete (`DELETE /api/accounts/:idx`)
  - Add accounts form: textarea for bulk paste (format: `email:password`, one per line)
  - Replace all option (checkbox for `{ replace: true }`)
  - Skeleton table loading state

  **Must NOT do**:
  - NO showing passwords (backend only returns `has_password` boolean)
  - NO delete without confirmation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Table-heavy page with CRUD operations and forms
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13, 14, 16-21)
  - **Blocks**: Tasks 22-25
  - **Blocked By**: Tasks 9, 11

  **References**:

  **Pattern References**:
  - `server/routes/api.js:242-272` — Account endpoints: `GET /api/accounts` (returns `{ entries: [{ idx, email, has_password }] }`), `POST /api/accounts` (body `{ lines, replace? }`), `DELETE /api/accounts/:idx`

  **API/Type References**:
  - `dashboard/src/types/accounts.ts` — Account type definitions (idx, email, has_password)

  **Acceptance Criteria**:
  - [ ] Table renders with email and has_password columns
  - [ ] Passwords NOT shown (only boolean indicator)
  - [ ] Add accounts (bulk paste) works
  - [ ] Delete with confirmation works
  - [ ] Sortable columns

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Accounts table displays
    Tool: Playwright
    Preconditions: Express backend with accounts.txt having entries
    Steps:
      1. Navigate to /accounts
      2. Verify table renders with Email and Has Password columns
      3. Verify no raw passwords visible (only checkmark/x for has_password)
      4. Click "Email" column header to sort
      5. Verify rows reorder
    Expected Result: Table with emails, no passwords exposed, sortable
    Failure Indicators: Passwords visible, sort doesn't work, empty table
    Evidence: .sisyphus/evidence/task-15-accounts.png

  Scenario: Add accounts bulk flow
    Tool: Playwright
    Preconditions: Accounts page loaded
    Steps:
      1. Click "Add Accounts" button
      2. Verify textarea form opens
      3. Paste "test@gmail.com:password123" in textarea
      4. Submit form
      5. Verify new account appears in table
      6. Verify success toast with count
    Expected Result: Account added, table updates, toast confirms
    Failure Indicators: Form errors, account not added, no feedback
    Evidence: .sisyphus/evidence/task-15-add-account.png
  ```

  **Commit**: YES (groups with Tasks 14, 16)
  - Message: `feat(dashboard): implement accounts page with data table`
  - Files: `dashboard/src/app/(dashboard)/accounts/page.tsx`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 16. Proxies Page

  **What to do**:
  - Create `dashboard/src/app/(dashboard)/proxies/page.tsx`
  - Table/card view of configured proxies (from `GET /api/proxies`):
    - Proxy URL (masked credentials), index
    - Actions: Add proxies (`POST /api/proxies`), Delete (`DELETE /api/proxies/:idx`)
  - Add proxies form: textarea for bulk paste (one per line)
  - Replace all option (checkbox for `{ replace: true }`)
  - Skeleton loading

  **Must NOT do**:
  - NO bulk delete without confirmation
  - NO showing proxy credentials in plain text (mask user:pass portion)
  - NO "test proxy" feature (no backend endpoint exists for this)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Table page with CRUD and bulk operations
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-15, 17-21)
  - **Blocks**: Tasks 22-25
  - **Blocked By**: Tasks 9, 11

  **References**:

  **Pattern References**:
  - `server/routes/api.js:274-298` — Proxy endpoints: `GET /api/proxies`, `POST /api/proxies`, `DELETE /api/proxies/:idx`

  **API/Type References**:
  - `dashboard/src/types/proxies.ts` — Proxy type definitions (idx, proxy URL string)

  **WHY Each Reference Matters**:
  - `api.js:274-298` — Exact proxy CRUD endpoints, shows response shape `{ entries: [{ idx, proxy }] }`

  **Acceptance Criteria**:
  - [ ] Proxy table renders with masked credentials
  - [ ] Add proxies (bulk paste) works
  - [ ] Delete individual proxy works with confirmation
  - [ ] Replace all option works

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Proxies page displays and allows adding
    Tool: Playwright
    Preconditions: Express backend with proxies.txt having entries
    Steps:
      1. Navigate to /proxies
      2. Verify proxy list renders with masked credentials
      3. Click "Add Proxies" button
      4. Paste "http://user:pass@1.2.3.4:8080" in textarea
      5. Submit
      6. Verify new proxy appears in list
      7. Verify credentials are masked (show http://***:***@1.2.3.4:8080)
    Expected Result: Proxy added, list updates, credentials masked
    Failure Indicators: Full credentials visible, add fails
    Evidence: .sisyphus/evidence/task-16-proxies.png

  Scenario: Delete proxy with confirmation
    Tool: Playwright
    Preconditions: At least one proxy in list
    Steps:
      1. Click delete button on first proxy
      2. Verify confirmation dialog appears
      3. Confirm deletion
      4. Verify proxy removed from list
    Expected Result: Proxy deleted after confirmation
    Failure Indicators: No confirmation, proxy still visible after delete
    Evidence: .sisyphus/evidence/task-16-proxy-delete.png
  ```

  **Commit**: YES (groups with Tasks 14, 15)
  - Message: `feat(dashboard): implement proxies page`
  - Files: `dashboard/src/app/(dashboard)/proxies/page.tsx`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 17. Run Bot Page + SSE Integration

  **What to do**:
  - Create `dashboard/src/app/(dashboard)/run-bot/page.tsx`
  - Bot control panel:
    - Start/Stop bot buttons with loading states
    - Configuration form (model selection, parameters)
    - Real-time log viewer using SSE hook (Task 12)
    - Log viewer: monospace font, auto-scroll, color-coded log levels
    - Status indicator (running/stopped/error)
  - Log viewer features:
    - Auto-scroll to bottom (with "scroll to bottom" button if user scrolled up)
    - Clear logs button
    - Copy logs to clipboard
    - Filter by log level (info/warn/error)

  **Must NOT do**:
  - NO storing unlimited logs in memory (cap at 1000 entries)
  - NO blocking UI during bot operations

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Real-time SSE integration, complex state management, log viewer UX
  - **Skills**: [`frontend-design`]
    - `frontend-design`: Log viewer component, real-time UI patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-16, 18-21)
  - **Blocks**: Tasks 22-25
  - **Blocked By**: Tasks 9, 11, 12

  **References**:

  **Pattern References**:
  - `server/routes/api.js:300-336` — Job endpoints: `GET /api/jobs` (list), `POST /api/jobs` (create: `{ mode, headless, limit, concurrency }`), `GET /api/jobs/:id` (detail + recentLogs), `GET /api/jobs/:id/stream` (SSE), `POST /api/jobs/:id/abort`

  **API/Type References**:
  - `dashboard/src/hooks/use-bot-logs.ts` — SSE hook from Task 12
  - `dashboard/src/types/` — Job type (id, status, mode, logs, progress)

  **WHY Each Reference Matters**:
  - `api.js:300-336` — Exact job CRUD + SSE stream endpoint format
  - SSE format: `GET /api/jobs/:id/stream` sends `text/event-stream` with log events

  **Acceptance Criteria**:
  - [ ] Start/Stop bot works with loading feedback
  - [ ] Real-time logs stream via SSE
  - [ ] Log viewer auto-scrolls, supports filtering
  - [ ] Monospace font, color-coded levels
  - [ ] Memory capped at 1000 log entries

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Bot start and real-time log streaming
    Tool: Playwright
    Preconditions: Express backend running, bot can be started
    Steps:
      1. Navigate to /run-bot
      2. Click "Start Bot" button
      3. Verify button shows loading state
      4. Verify status changes to "Running"
      5. Wait 3 seconds → verify log entries appear in real-time
      6. Verify logs are color-coded (errors in red, info in default)
      7. Verify auto-scroll keeps latest log visible
    Expected Result: Bot starts, logs stream in real-time with proper formatting
    Failure Indicators: No logs appear, button stuck in loading, no auto-scroll
    Evidence: .sisyphus/evidence/task-17-bot-logs.png

  Scenario: Log viewer controls work
    Tool: Playwright
    Preconditions: Bot running with logs streaming
    Steps:
      1. Scroll up in log viewer
      2. Verify "Scroll to bottom" button appears
      3. Click it → verify scrolls to latest
      4. Click "Clear" → verify logs cleared
      5. Click "Copy" → verify clipboard has log content
    Expected Result: All log viewer controls functional
    Failure Indicators: Controls don't respond, scroll button missing
    Evidence: .sisyphus/evidence/task-17-log-controls.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): implement run bot page with real-time SSE logs`
  - Files: `dashboard/src/app/(dashboard)/run-bot/page.tsx`, `dashboard/src/components/log-viewer.tsx`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 18. Temp Mail Page

  **What to do**:
  - Create `dashboard/src/app/(dashboard)/temp-mail/page.tsx`
  - Temp mail management:
    - List of temporary email accounts (table or card list)
    - Create new temp email button
    - Inbox viewer: select account → show received emails
    - Email detail view (subject, from, body, timestamp)
  - Split layout: email list (left) + email content (right) on desktop
  - Mobile: stacked view with back navigation

  **Must NOT do**:
  - NO rendering untrusted HTML without sanitization
  - NO auto-refresh faster than 10 seconds

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Split-pane layout, email rendering, responsive design
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-17, 19-21)
  - **Blocks**: Tasks 22-25
  - **Blocked By**: Tasks 9, 11

  **References**:

  **Pattern References**:
  - `server/routes/api.js:112-218` — Temp mail endpoints: overview, inboxes CRUD, domains CRUD, addresses CRUD, messages, extract code, poll

  **API/Type References**:
  - `dashboard/src/types/tempmail.ts` — TempMail type definitions (Inbox, Domain, Address, Message)

  **WHY Each Reference Matters**:
  - `api.js:112-218` — Complete temp mail API surface: inboxes (IMAP config), domains, addresses (generate/revoke), messages (list/get), extract (OTP extraction), poll

  **Acceptance Criteria**:
  - [ ] Email accounts list renders
  - [ ] Create new temp email works
  - [ ] Inbox shows received emails
  - [ ] Email content renders safely (sanitized)
  - [ ] Responsive split-pane layout

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Temp mail inbox flow
    Tool: Playwright
    Preconditions: Express backend with temp mail accounts
    Steps:
      1. Navigate to /temp-mail
      2. Verify email accounts listed
      3. Click an account → verify inbox loads
      4. Click an email → verify content displays
      5. Verify no raw HTML injection (check for sanitization)
    Expected Result: Full email flow works safely
    Failure Indicators: Empty inbox, unsanitized HTML, broken layout
    Evidence: .sisyphus/evidence/task-18-tempmail.png
  ```

  **Commit**: YES (groups with Tasks 19, 20)
  - Message: `feat(dashboard): implement temp mail page`
  - Files: `dashboard/src/app/(dashboard)/temp-mail/page.tsx`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 19. History Page

  **What to do**:
  - Create `dashboard/src/app/(dashboard)/history/page.tsx`
  - Request history table (data from `GET /api/history?limit=500`):
    - Columns: Timestamp, Model, Provider, Tokens (prompt/completion), Latency, Status
    - Client-side filtering: by model, provider, status (success/error)
    - Client-side search by model name
    - Expandable row detail (full request/response preview)
    - Clear history button (`DELETE /api/history`) with confirmation
  - Export functionality (copy as JSON)
  - Skeleton table loading
  - Virtual scroll for large lists (if >100 entries)

  **Must NOT do**:
  - NO showing full request/response bodies in table (only in expanded detail)
  - NO clear history without confirmation dialog

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex table with pagination, filters, expandable rows
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-18, 20-21)
  - **Blocks**: Tasks 22-25
  - **Blocked By**: Tasks 9, 11

  **References**:

  **Pattern References**:
  - `server/routes/api.js:220-226` — History endpoints: `GET /api/history` (query: `?limit=N`), `DELETE /api/history` (clear all)
  - `server/lib/history.js` — History entry shape and storage logic

  **API/Type References**:
  - `dashboard/src/types/history.ts` — History entry type (timestamp, model, provider, tokens, latency, status, request/response preview)

  **WHY Each Reference Matters**:
  - `api.js:220-226` — History API is simple (list with limit, clear all). Filtering/sorting must be done client-side
  - `history.js` — Defines the actual entry shape stored per request

  **Acceptance Criteria**:
  - [ ] History table renders with pagination
  - [ ] Filters work (date, model, provider, status)
  - [ ] Expandable row shows request/response detail
  - [ ] Search functional
  - [ ] No performance issues with large datasets

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: History table with filters and pagination
    Tool: Playwright
    Preconditions: Express backend with history data
    Steps:
      1. Navigate to /history
      2. Verify table renders with data
      3. Apply filter: status = "error"
      4. Verify table updates to show only errors
      5. Click pagination "Next" → verify new page loads
      6. Click a row to expand → verify detail shows
    Expected Result: Filtered, paginated table with expandable details
    Failure Indicators: Filters don't work, pagination broken, expand fails
    Evidence: .sisyphus/evidence/task-19-history.png
  ```

  **Commit**: YES (groups with Tasks 18, 20)
  - Message: `feat(dashboard): implement history page with filters and pagination`
  - Files: `dashboard/src/app/(dashboard)/history/page.tsx`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 20. Content Filter Page

  **What to do**:
  - Create `dashboard/src/app/(dashboard)/content-filter/page.tsx`
  - Content filter management using existing API (`GET/POST/PUT/DELETE /api/filters`, `POST /api/filters/:id/toggle`):
    - Filter rules list showing: pattern, replacement, target (body/headers/both), active status
    - Add filter form with fields: pattern (required string), replacement (string, default ""), target (select: body/headers/both)
    - Edit filter via modal (PUT /api/filters/:id)
    - Delete filter with confirmation (DELETE /api/filters/:id)
    - Toggle individual filter active/inactive via `POST /api/filters/:id/toggle`
  - Visual feedback for active vs inactive filters (opacity/badge on the `active` boolean field)
  - Filter count summary at top

  **Must NOT do**:
  - NO "test filter" feature (no backend endpoint exists)
  - NO treating pattern as regex (it's plain text matching per contentFilter.js)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Form-heavy page with rule management and testing
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-19, 21)
  - **Blocks**: Tasks 22-25
  - **Blocked By**: Tasks 9, 11

  **References**:

  **Pattern References**:
  - `server/routes/api.js:398-430` — Filter endpoints: `GET /api/filters`, `POST /api/filters`, `PUT /api/filters/:id`, `POST /api/filters/:id/toggle`, `DELETE /api/filters/:id`
  - `server/lib/contentFilter.js` — Filter entry shape and logic

  **API/Type References**:
  - `dashboard/src/types/settings.ts` — FilterEntry type: `{ id: string, pattern: string, replacement: string, target: 'body'|'headers'|'both', active: boolean, createdAt: string }`

  **WHY Each Reference Matters**:
  - `api.js:398-430` — Exact CRUD + toggle endpoints for filters
  - `contentFilter.js` — Filter entry shape to define correct TypeScript types

  **Acceptance Criteria**:
  - [ ] Filter list renders with enabled/disabled visual state
  - [ ] Toggle individual filter works (POST /api/filters/:id/toggle)
  - [ ] Add new filter works
  - [ ] Edit existing filter works
  - [ ] Delete filter with confirmation works

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Content filter rule management
    Tool: Playwright
    Preconditions: Express backend with some filter rules in filters.json
    Steps:
      1. Navigate to /content-filter
      2. Verify existing rules displayed with active/inactive badges
      3. Verify each rule shows: pattern text, replacement text, target badge (body/headers/both)
      4. Click "Add Rule" → fill pattern="test", replacement="", target=body → submit
      5. Verify new rule appears in list with active=true
      6. Click toggle on the new rule → verify badge changes to inactive
      7. Verify toast confirms toggle
    Expected Result: Rules CRUD works, toggle updates active state visually
    Failure Indicators: Rules don't save, toggle doesn't work, wrong field names
    Evidence: .sisyphus/evidence/task-20-filters.png

  Scenario: Delete filter with confirmation
    Tool: Playwright
    Preconditions: At least one filter exists
    Steps:
      1. Click delete on a filter
      2. Verify confirmation dialog
      3. Confirm → verify filter removed from list
    Expected Result: Filter deleted after confirmation
    Failure Indicators: No confirmation, filter still visible
    Evidence: .sisyphus/evidence/task-20-filter-delete.png
  ```

  **Commit**: YES (groups with Tasks 18, 19)
  - Message: `feat(dashboard): implement content filter page`
  - Files: `dashboard/src/app/(dashboard)/content-filter/page.tsx`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 21. Settings Page

  **What to do**:
  - Create `dashboard/src/app/(dashboard)/settings/page.tsx`
  - Settings sections (grouped with shadcn/ui Tabs or accordion):
    - **Rotation**: Cooldown duration (COOLDOWN_MS), Max rotations per request (MAX_ROTATIONS_PER_REQUEST)
    - **Models**: Exposed models list (EXPOSED_MODELS), Per-model capability overrides (MODEL_CAPS_OVERRIDES)
    - **Optimization**: RTK toggle (RTK_ENABLED), Caveman mode toggle + level (CAVEMAN_ENABLED, CAVEMAN_LEVEL)
    - **Appearance**: Theme preference (system/dark/light) — client-side only, not sent to backend
    - **About**: Version info, API endpoint info, OpenCode config snippet generator (from GET /api/settings MODEL_CAPS)
  - Form with save button using `PUT /api/settings` (only allowed fields: COOLDOWN_MS, EXPOSED_MODELS, MAX_ROTATIONS_PER_REQUEST, MODEL_CAPS_OVERRIDES, RTK_ENABLED, CAVEMAN_ENABLED, CAVEMAN_LEVEL)
  - Success/error toast on save
  - Read-only display for non-editable config (UPSTREAM_BASE, PORT) from `GET /api/settings`

  **Must NOT do**:
  - NO auto-save (explicit save only)
  - NO attempting to save fields not in the allowed list (backend rejects them)
  - NO password protection toggle (controlled by env var SAMBUNGIN_DASHBOARD_PASSWORD, not API)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-section form page with various input types
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-20)
  - **Blocks**: Tasks 22-25
  - **Blocked By**: Tasks 9, 11

  **References**:

  **Pattern References**:
  - `server/routes/api.js:338-368` — Settings endpoints: `GET /api/settings` (returns all config), `PUT /api/settings` (allowed fields: COOLDOWN_MS, EXPOSED_MODELS, MAX_ROTATIONS_PER_REQUEST, MODEL_CAPS_OVERRIDES, RTK_ENABLED, CAVEMAN_ENABLED, CAVEMAN_LEVEL)
  - `server/lib/config.js` — Config defaults and how settings are merged

  **API/Type References**:
  - `dashboard/src/types/settings.ts` — Settings type definitions matching GET /api/settings response

  **WHY Each Reference Matters**:
  - `api.js:338-368` — Exact allowed fields for PUT, validation logic for MODEL_CAPS_OVERRIDES
  - `config.js` — Default values to show "reset to defaults" option

  **Acceptance Criteria**:
  - [ ] All settings sections render with current values from GET /api/settings
  - [ ] Save button persists only allowed fields via PUT /api/settings
  - [ ] Toast confirms save success/failure
  - [ ] Read-only fields (UPSTREAM_BASE, PORT) displayed but not editable
  - [ ] OpenCode config snippet generator works (shows copyable JSON)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Settings save and persist
    Tool: Playwright
    Preconditions: Express backend running
    Steps:
      1. Navigate to /settings
      2. Verify current settings loaded
      3. Change a setting (e.g., toggle token optimization)
      4. Click "Save"
      5. Verify success toast
      6. Refresh page → verify setting persisted
    Expected Result: Settings save and persist across page loads
    Failure Indicators: Save fails, settings revert on refresh
    Evidence: .sisyphus/evidence/task-21-settings.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): implement settings page`
  - Files: `dashboard/src/app/(dashboard)/settings/page.tsx`
  - Pre-commit: `cd dashboard && npm run build`

- [x] 22. Micro-animations + Transitions

  **What to do**:
  - Add page transition animations (fade + subtle slide, 200ms)
  - Hover effects on cards (subtle scale 1.01 + shadow increase)
  - Button press feedback (scale 0.97 on active)
  - Sidebar item hover/active transitions
  - Chart entrance animations (fade-in, 300ms)
  - Stagger animation for card grids (30ms delay per item)
  - Toast enter/exit animations
  - Use Tailwind `transition-*` utilities + CSS animations
  - Respect `prefers-reduced-motion` (disable all animations)

  **Must NOT do**:
  - NO animations longer than 300ms for micro-interactions
  - NO layout-shifting animations (only transform/opacity)
  - NO animations that block interaction
  - NO decorative-only animations without purpose

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Animation design requires visual sensitivity and performance awareness
  - **Skills**: [`ui-ux-pro-max`, `frontend-design`]
    - `ui-ux-pro-max`: Animation timing, easing, reduced-motion rules
    - `frontend-design`: Production animation implementation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 23, 24, 25)
  - **Blocks**: Tasks 26-29
  - **Blocked By**: Tasks 13-21

  **References**:

  **External References**:
  - Tailwind transitions: https://tailwindcss.com/docs/transition-property
  - prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

  **Acceptance Criteria**:
  - [ ] Page transitions smooth (no flash/jump)
  - [ ] Card hover effects subtle and performant
  - [ ] All animations ≤ 300ms
  - [ ] `prefers-reduced-motion` disables all animations
  - [ ] No layout shift from any animation

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Animations work and respect reduced-motion
    Tool: Playwright
    Preconditions: All pages implemented
    Steps:
      1. Navigate between pages → verify smooth transition (no flash)
      2. Hover over a card → verify subtle scale/shadow effect
      3. Enable prefers-reduced-motion in browser
      4. Repeat navigation → verify NO animations occur
    Expected Result: Smooth animations that disable with reduced-motion
    Failure Indicators: Janky transitions, animations with reduced-motion on
    Evidence: .sisyphus/evidence/task-22-animations.png
  ```

  **Commit**: YES (groups with Tasks 23, 24)
  - Message: `feat(dashboard): add micro-animations and page transitions`
  - Files: `dashboard/src/app/globals.css`, various component files
  - Pre-commit: `cd dashboard && npm run build`

- [x] 23. Responsive Fine-tuning + Mobile Navigation

  **What to do**:
  - Audit all pages at 375px, 768px, 1024px, 1440px viewports
  - Fix any overflow, cramped spacing, or unreadable text
  - Mobile-specific adjustments:
    - Tables → horizontal scroll or card view on mobile
    - Charts → simplified view or full-width with scroll
    - Forms → full-width inputs, larger touch targets
    - Modals → full-screen on mobile (Sheet component)
  - Ensure touch targets ≥ 44px on mobile
  - Test landscape orientation
  - Add viewport meta tag if missing

  **Must NOT do**:
  - NO horizontal page scroll (individual tables can scroll)
  - NO text smaller than 14px on mobile
  - NO disabled zoom

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Responsive design requires visual testing at multiple breakpoints
  - **Skills**: [`ui-ux-pro-max`]
    - `ui-ux-pro-max`: Responsive rules, touch targets, mobile patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 22, 24, 25)
  - **Blocks**: Tasks 26-29
  - **Blocked By**: Tasks 13-21

  **Acceptance Criteria**:
  - [ ] No horizontal page scroll at any viewport
  - [ ] All text ≥ 14px on mobile
  - [ ] Touch targets ≥ 44px
  - [ ] Tables usable on mobile (scroll or card view)
  - [ ] Charts readable on mobile

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All pages responsive at 375px
    Tool: Playwright
    Preconditions: All pages implemented
    Steps:
      1. Set viewport 375x812
      2. Navigate to each of 9 pages
      3. For each: verify no horizontal scroll, text readable, touch targets adequate
      4. Screenshot each page
    Expected Result: All 9 pages usable on mobile
    Failure Indicators: Horizontal scroll, tiny text, overlapping elements
    Evidence: .sisyphus/evidence/task-23-responsive-375.png
  ```

  **Commit**: YES (groups with Tasks 22, 24)
  - Message: `feat(dashboard): responsive fine-tuning for all breakpoints`
  - Files: Various page and component files
  - Pre-commit: `cd dashboard && npm run build`

- [x] 24. Dark/Light Theme Polish + Contrast Verification

  **What to do**:
  - Audit every page in both dark and light mode:
    - Verify text contrast ≥ 4.5:1 (body) and ≥ 3:1 (secondary)
    - Verify borders/dividers visible in both modes
    - Verify charts readable in both modes
    - Verify status badges have sufficient contrast
  - Fix any contrast issues found
  - Ensure smooth theme transition (no flash of wrong theme)
  - Test with system preference changes
  - Verify no hardcoded colors (all via CSS variables/Tailwind)

  **Must NOT do**:
  - NO flash of unstyled content on theme switch
  - NO hardcoded hex values in components

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Color contrast verification, visual consistency across themes
  - **Skills**: [`ui-ux-pro-max`]
    - `ui-ux-pro-max`: Color contrast rules, dark mode pairing, accessibility

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 22, 23, 25)
  - **Blocks**: Tasks 26-29
  - **Blocked By**: Tasks 13-21

  **Acceptance Criteria**:
  - [ ] All text passes WCAG AA contrast (4.5:1 body, 3:1 secondary)
  - [ ] No hardcoded colors found (grep for hex values in components)
  - [ ] Theme switch is instant, no flash
  - [ ] Both themes look intentionally designed (not just inverted)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Contrast verification in both themes
    Tool: Playwright + Bash
    Preconditions: All pages implemented
    Steps:
      1. Navigate to overview in dark mode → run axe accessibility audit
      2. Switch to light mode → run axe accessibility audit
      3. Verify zero contrast violations in both
      4. grep -r "#[0-9a-fA-F]\{3,6\}" dashboard/src/components/ → verify zero matches
    Expected Result: Zero contrast violations, zero hardcoded colors
    Failure Indicators: Contrast violations, hardcoded hex values found
    Evidence: .sisyphus/evidence/task-24-contrast.txt

  Scenario: Theme switch without flash
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Navigate to / in dark mode
      2. Click theme toggle rapidly 5 times
      3. Verify no white flash or unstyled content between switches
    Expected Result: Smooth transitions, no FOUC
    Failure Indicators: White flash, unstyled moment, wrong colors briefly
    Evidence: .sisyphus/evidence/task-24-theme-switch.png
  ```

  **Commit**: YES (groups with Tasks 22, 23)
  - Message: `feat(dashboard): polish dark/light themes with contrast verification`
  - Files: `dashboard/src/app/globals.css`, various components
  - Pre-commit: `cd dashboard && npm run build`

- [x] 25. Error States + Empty States for All Pages

  **What to do**:
  - Create reusable error/empty state components:
    - `dashboard/src/components/error-state.tsx` — Error with retry button
    - `dashboard/src/components/empty-state.tsx` — Empty with illustration + action
  - Implement for each page:
    - **Error**: API failure → show error message + retry button
    - **Empty**: No data → show helpful message + primary action (e.g., "Add your first provider")
  - Error boundary at page level (catch React errors)
  - Network error detection (offline state)

  **Must NOT do**:
  - NO generic "Something went wrong" without context
  - NO empty pages without guidance

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple components + integration across all pages
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 22, 23, 24)
  - **Blocks**: Tasks 26-29
  - **Blocked By**: Tasks 13-21

  **Acceptance Criteria**:
  - [ ] Every page has error state (API failure)
  - [ ] Every page has empty state (no data)
  - [ ] Error states have retry button that works
  - [ ] Empty states have actionable guidance
  - [ ] Error boundary catches React crashes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Error state shows on API failure
    Tool: Playwright
    Preconditions: Express backend stopped (simulate failure)
    Steps:
      1. Stop Express backend
      2. Navigate to /provider-pool
      3. Verify error state component shows (not white screen)
      4. Verify "Retry" button visible
      5. Start Express backend
      6. Click "Retry" → verify data loads
    Expected Result: Graceful error with working retry
    Failure Indicators: White screen, unhandled error, retry doesn't work
    Evidence: .sisyphus/evidence/task-25-error-state.png

  Scenario: Empty state shows when no data
    Tool: Playwright
    Preconditions: Express backend with empty accounts list
    Steps:
      1. Navigate to /accounts (with no accounts configured)
      2. Verify empty state shows with message and "Add Account" action
      3. Click action → verify add dialog opens
    Expected Result: Helpful empty state with actionable CTA
    Failure Indicators: Blank page, generic message, no action
    Evidence: .sisyphus/evidence/task-25-empty-state.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add error and empty states for all pages`
  - Files: `dashboard/src/components/error-state.tsx`, `dashboard/src/components/empty-state.tsx`, various pages
  - Pre-commit: `cd dashboard && npm run build`

- [x] 26. Test Infrastructure Setup

  **What to do**:
  - Install and configure Vitest + React Testing Library:
    - `vitest.config.ts` with jsdom environment
    - `@testing-library/react`, `@testing-library/jest-dom`
    - Test utilities: render wrapper with providers (QueryClient, Theme)
  - Install and configure Playwright for e2e:
    - `playwright.config.ts` targeting localhost:3000
    - Base test fixtures
  - Add test scripts to package.json: `test`, `test:e2e`, `test:coverage`
  - Create test utilities file with common helpers

  **Must NOT do**:
  - NO complex test setup that's hard to maintain
  - NO snapshot tests (they break too easily during UI work)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard test tooling setup, well-documented
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs Wave 4 complete for meaningful tests)
  - **Parallel Group**: Wave 5 (sequential start)
  - **Blocks**: Tasks 27, 28
  - **Blocked By**: Tasks 22-25

  **Acceptance Criteria**:
  - [ ] `npm run test` runs (even with no tests yet)
  - [ ] `npm run test:e2e` runs Playwright
  - [ ] Test utilities render components with all providers

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Test infrastructure works
    Tool: Bash
    Preconditions: Test packages installed
    Steps:
      1. cd dashboard && npm run test -- --run (should pass with 0 tests or example test)
      2. cd dashboard && npx playwright test --list (should list test files)
    Expected Result: Both commands exit successfully
    Failure Indicators: Config errors, missing dependencies
    Evidence: .sisyphus/evidence/task-26-test-infra.txt
  ```

  **Commit**: YES
  - Message: `test(dashboard): setup Vitest + Playwright test infrastructure`
  - Files: `dashboard/vitest.config.ts`, `dashboard/playwright.config.ts`, `dashboard/src/test-utils.tsx`
  - Pre-commit: `cd dashboard && npm run test -- --run`

- [x] 27. Component Tests (Key Components)

  **What to do**:
  - Write tests for critical components:
    - `sidebar.test.tsx` — Renders all nav items, active state, collapse toggle
    - `topbar.test.tsx` — Renders breadcrumb, theme toggle works
    - `theme-toggle.test.tsx` — Switches theme, persists preference
    - `toast.test.tsx` — Shows/dismisses toasts
    - `error-state.test.tsx` — Renders error, retry callback fires
    - `empty-state.test.tsx` — Renders message and action
  - Use React Testing Library best practices (query by role, not implementation)
  - Mock TanStack Query responses for isolated testing

  **Must NOT do**:
  - NO testing implementation details (internal state, private methods)
  - NO snapshot tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files with mocking and assertions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 28, 29)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 26

  **Acceptance Criteria**:
  - [ ] All listed test files created
  - [ ] `npm run test` passes all tests
  - [ ] Tests use accessible queries (getByRole, getByLabelText)
  - [ ] No implementation detail testing

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All component tests pass
    Tool: Bash
    Preconditions: Test files written
    Steps:
      1. cd dashboard && npm run test -- --run
      2. Verify all tests pass
      3. Check coverage for tested components
    Expected Result: All tests pass, key components have coverage
    Failure Indicators: Test failures, missing assertions
    Evidence: .sisyphus/evidence/task-27-component-tests.txt
  ```

  **Commit**: YES (groups with Task 28)
  - Message: `test(dashboard): add component tests for key UI elements`
  - Files: `dashboard/src/**/*.test.tsx`
  - Pre-commit: `cd dashboard && npm run test -- --run`

- [x] 28. E2E Tests (Critical User Flows)

  **What to do**:
  - Write Playwright e2e tests for critical flows:
    - `navigation.spec.ts` — Navigate all 9 pages via sidebar, verify content loads
    - `theme.spec.ts` — Toggle theme, verify persistence across navigation
    - `provider-pool.spec.ts` — View providers, toggle enable/disable
    - `settings.spec.ts` — Change setting, save, verify persistence
  - Run against real Express backend (not mocked)
  - Include visual regression screenshots

  **Must NOT do**:
  - NO flaky tests (use proper waits, not arbitrary timeouts)
  - NO tests that depend on specific data state

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E tests with real backend interaction
  - **Skills**: [`playwright`]
    - `playwright`: Playwright test patterns and best practices

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 27, 29)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 26

  **Acceptance Criteria**:
  - [ ] All e2e tests pass against running backend
  - [ ] No flaky tests (run 3 times, all pass)
  - [ ] Critical flows covered: navigation, theme, CRUD operations

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: E2E tests pass
    Tool: Bash
    Preconditions: Express backend + Next.js dev server running
    Steps:
      1. cd dashboard && npx playwright test
      2. Verify all tests pass
      3. Run again to check for flakiness
    Expected Result: All e2e tests pass consistently
    Failure Indicators: Test failures, flaky results between runs
    Evidence: .sisyphus/evidence/task-28-e2e.txt
  ```

  **Commit**: YES (groups with Task 27)
  - Message: `test(dashboard): add e2e tests for critical user flows`
  - Files: `dashboard/e2e/*`
  - Pre-commit: `cd dashboard && npx playwright test`

- [x] 29. Build Optimization + Performance Audit

  **What to do**:
  - Analyze bundle size: `npm run build` → check output sizes
  - Optimize:
    - Code splitting by route (Next.js does this automatically, verify)
    - Lazy load heavy components (charts, code editors)
    - Optimize images if any (next/image)
    - Tree-shake unused Material Icons (import individually, not entire package)
  - Performance audit:
    - Run Lighthouse on key pages (target: Performance ≥ 80, Accessibility ≥ 90)
    - Check Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1)
    - Verify no unnecessary re-renders (React DevTools profiler)
  - Add `next.config.js` optimizations if needed

  **Must NOT do**:
  - NO premature optimization that hurts readability
  - NO removing features for performance

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard Next.js optimization patterns, mostly config
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 27, 28)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 22-25

  **Acceptance Criteria**:
  - [ ] Bundle size reasonable (< 500KB initial JS)
  - [ ] Lighthouse Performance ≥ 80
  - [ ] Lighthouse Accessibility ≥ 90
  - [ ] No unused large imports
  - [ ] Route-level code splitting verified

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build output is optimized
    Tool: Bash
    Preconditions: All features implemented
    Steps:
      1. cd dashboard && npm run build
      2. Check .next/analyze or build output for bundle sizes
      3. Verify initial JS bundle < 500KB
      4. Verify route splitting (each page has separate chunk)
    Expected Result: Optimized build with proper code splitting
    Failure Indicators: Bundle > 500KB, single monolithic chunk
    Evidence: .sisyphus/evidence/task-29-bundle.txt

  Scenario: Lighthouse scores meet targets
    Tool: Bash
    Preconditions: Production build running
    Steps:
      1. cd dashboard && npm run build && npm run start
      2. Run lighthouse on http://localhost:3000 --output=json
      3. Verify Performance ≥ 80, Accessibility ≥ 90
    Expected Result: Scores meet or exceed targets
    Failure Indicators: Performance < 80, Accessibility < 90
    Evidence: .sisyphus/evidence/task-29-lighthouse.json
  ```

  **Commit**: YES
  - Message: `perf(dashboard): optimize bundle size and performance`
  - Files: `dashboard/next.config.js`, various imports
  - Pre-commit: `cd dashboard && npm run build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run build` + linter + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify Tailwind classes are consistent, no raw hex colors, no inline styles.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Navigate every page via sidebar. Test dark/light toggle on each page. Test responsive at 375px, 768px, 1440px. Verify charts render with data. Test all interactive elements (forms, buttons, modals). Test SSE bot logs streaming. Save screenshots to `.sisyphus/evidence/final-qa/`.
  Output: `Pages [9/9 pass] | Theme [PASS/FAIL] | Responsive [PASS/FAIL] | Charts [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual implementation. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Verify no indigo/violet/teal colors. Verify no emoji icons. Verify no existing API endpoints were modified. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Guardrails [N/N respected] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message | Files |
|------|---------------|-------|
| 1 | `feat(dashboard): scaffold Next.js project with design system` | dashboard/* |
| 1 | `feat(api): add chart aggregation endpoints` | server/routes/api.js |
| 2 | `feat(dashboard): add layout shell with sidebar and topbar` | dashboard/src/components/layout/* |
| 3 | `feat(dashboard): implement all 9 dashboard pages` | dashboard/src/app/* |
| 4 | `feat(dashboard): add animations, responsive polish, theme refinement` | dashboard/src/* |
| 5 | `test(dashboard): add component and e2e tests` | dashboard/src/**/*.test.*, dashboard/e2e/* |

---

## Success Criteria

### Verification Commands
```bash
cd dashboard && npm run build  # Expected: Build succeeds, zero errors
cd dashboard && npm run test   # Expected: All tests pass
cd dashboard && npm run lint   # Expected: Zero lint errors
curl http://localhost:4141/api/stats/requests?period=24h  # Expected: 200 with time-series JSON
curl http://localhost:3000/api/overview  # Expected: 200 with proxied data from Express
```

### Final Checklist
- [ ] All 9 pages functional and styled
- [ ] Dark/Light theme toggle works globally
- [ ] Sidebar navigation with active states
- [ ] Charts render real data from new endpoints
- [ ] Responsive on mobile (375px) through desktop (1440px)
- [ ] Skeleton loading on all data-fetching views
- [ ] Toast notifications working
- [ ] No indigo/violet/teal colors
- [ ] No emoji icons
- [ ] No existing API endpoints modified
- [ ] Build passes, tests pass, lint clean
- [ ] Lighthouse accessibility ≥ 90
