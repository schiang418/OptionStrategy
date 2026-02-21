# OptionStrategy — Development Plan & Progress Tracker

> **Source documents:**
> - [Implementation Spec](../option-strategy-reference/README.md) — Full feature specification
> - [Golden Truth: UNIFIED_AUTH_STRATEGY.md](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md) — Cross-project auth strategy
> - [Sub-Portal Auth Guide](./SUB_PORTAL_AUTH_IMPLEMENTATION.md) — OptionStrategy-specific auth implementation
>
> **Last updated:** 2026-02-21
> **Branch:** `claude/option-income-strategy-app-xtFx9`

---

## Project Overview

Automated option income strategy tracking app. Scrapes Option Samurai for credit put spread scans, creates portfolios (Top Return / Top Probability), tracks P&L through expiration using Polygon.io market data.

**Stack:** Express.js, PostgreSQL, Drizzle ORM, React 18, TypeScript, Vite, Tailwind CSS, Playwright, Railway

---

## Current Status Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Core Infrastructure | COMPLETE | DB, server, build, Docker |
| Phase 2: Data Pipeline | COMPLETE | Scraper, Polygon API, portfolio logic |
| Phase 3: API Layer | COMPLETE | All 14 endpoints |
| Phase 4: Frontend | COMPLETE | All views, charts, dark theme |
| Phase 5: Cron & Automation | COMPLETE | Monday scan, daily P&L, holidays |
| Phase 6: Authentication | COMPLETE | Portal handoff, JWT sessions, cron refactored |
| Phase 7: Staging Environment | NOT STARTED | Railway staging service |
| Phase 8: Testing & Hardening | NOT STARTED | Unit tests, integration tests |
| Phase 9: Production Deploy | NOT STARTED | Final deployment + monitoring |

---

## Phase 1: Core Infrastructure — COMPLETE

### 1.1 Project Setup
- [x] Initialize Node.js/TypeScript project
- [x] Configure Vite for React frontend (`vite.config.ts`)
- [x] Configure Tailwind CSS dark theme (`tailwind.config.js`)
- [x] Configure PostCSS (`postcss.config.js`)
- [x] Configure TypeScript (`tsconfig.json`, `tsconfig.server.json`)
- [x] Set up `package.json` with all dependencies and scripts

### 1.2 Database Schema
- [x] `option_scan_results` — raw scan data (cents/basis points storage)
- [x] `option_portfolios` — portfolio containers with status tracking
- [x] `option_portfolio_trades` — individual credit put spreads
- [x] `option_portfolio_value_history` — daily snapshots for charting
- [x] Custom enums: `option_portfolio_type`, `option_portfolio_status`, `option_trade_status`
- [x] Drizzle ORM config (`drizzle.config.ts`)

### 1.3 Server Setup
- [x] Express app with CORS + JSON middleware (`server/index.ts`)
- [x] Route mounting pattern
- [x] Database migrations on startup
- [x] Static file serving for React build (production)
- [x] Health check endpoint (`/api/health`)

### 1.4 Docker & Deployment Config
- [x] Dockerfile: Node 22-slim + Playwright + Chromium dependencies
- [x] Build scripts (`npm run build`)
- [x] Dev scripts (`npm run dev` — concurrent server + client)
- [x] DB scripts (drizzle-kit generate, push, migrate, studio)

---

## Phase 2: Data Pipeline — COMPLETE

### 2.1 Option Samurai Scraper (`server/services/scraper.ts`)
- [x] Playwright-based scraper (adapted from Puppeteer spec to Playwright)
- [x] Login handling with multiple selector fallbacks
- [x] Scan navigation — find saved scan by name
- [x] CSV export + parsing for scan results
- [x] Retry logic (3 attempts with fresh browser each time)
- [x] Screenshot debug capability on failures
- [x] Support for custom scan names
- [x] Date parsing for multiple formats (Feb 21 '25, ISO, US date, long format)

### 2.2 Polygon.io API Client (`server/services/polygon.ts`)
- [x] Two API key support (MASSIVE_API_KEY for options, MASSIVE_STOCK_API_KEY for stocks)
- [x] Option snapshot fetching with midpoint fallback chain
- [x] Credit put spread value calculation
- [x] Stock close price (3-endpoint fallback: daily → aggregate → real-time)
- [x] Current stock price
- [x] Expired P&L calculation for credit put spreads
- [x] Market open/closed checking via Polygon API
- [x] Trading day validation (weekends + market holidays)
- [x] Next trading day calculation
- [x] 200ms rate limiting between API calls

### 2.3 Portfolio Service (`server/services/portfolio.ts`)
- [x] Save scan results with cents/basis points conversion
- [x] Portfolio creation: Top Return (sort by return_percent) + Top Probability (sort by prob_max_profit)
- [x] Top N trade selection (configurable, default 5)
- [x] Filtering logic per strategy type (bi-weekly vs yearly)
- [x] Trade insertion with entry prices from Polygon
- [x] Same-day overwrite (delete and recreate portfolios)
- [x] Live P&L updates for all active portfolios
- [x] Expiration detection (4 PM ET on expiration date)
- [x] Expired trade handling with max profit/loss calculations
- [x] ITM/OTM status tracking
- [x] Value history snapshots (upsert on same date)

---

## Phase 3: API Layer — COMPLETE

### 3.1 Automation Routes (`server/routes/optionAutomation.ts`)
- [x] `POST /api/option-automation/test-login` — verify Option Samurai credentials
- [x] `POST /api/option-automation/scan` — run scan manually
- [x] `POST /api/option-automation/monday-workflow` — full scan + portfolio workflow
- [x] `GET /api/option-automation/market-status` — check trading day status

### 3.2 Scan Routes (`server/routes/optionScans.ts`)
- [x] `GET /api/option-scans/dates` — list scan dates with result counts (filterable by scanName)
- [x] `GET /api/option-scans/:date` — scan results for specific date (cents → dollars conversion)
- [x] `DELETE /api/option-scans/:date` — delete scan + cascading portfolio cleanup

### 3.3 Portfolio Routes (`server/routes/optionPortfolios.ts`)
- [x] `GET /api/option-portfolios` — list all portfolios (with date + scanName filters)
- [x] `GET /api/option-portfolios/:id` — portfolio detail with trades
- [x] `POST /api/option-portfolios/update-pnl` — update all active portfolios
- [x] `POST /api/option-portfolios/:id/update-pnl` — update single portfolio
- [x] `GET /api/option-portfolios/:id/history` — value history for charts
- [x] `GET /api/option-portfolios/comparison` — performance comparison data
- [x] `GET /api/option-portfolios/trades` — all trades across portfolios

---

## Phase 4: Frontend — COMPLETE

### 4.1 Core App (`src/App.tsx`)
- [x] Tab navigation (Overview, All Trades, Performance)
- [x] Strategy switching (Bi-Weekly Income, Yearly Income)
- [x] Date navigation with prev/next
- [x] Toast notification system
- [x] Loading/error states

### 4.2 Components
- [x] `ScanResultsPanel.tsx` — sortable scan results table, delete capability
- [x] `PortfolioCards.tsx` — portfolio cards with status, premium, P&L, embedded line charts, modal details
- [x] `PerformanceChart.tsx` — multi-strategy line chart + bar chart with recharts
- [x] `AllTradesTable.tsx` — all trades across portfolios with sorting, status badges, ITM indicators

### 4.3 API Client (`src/api.ts`)
- [x] Typed fetch functions for all endpoints
- [x] TypeScript interfaces for all data types
- [x] Money formatting utilities

### 4.4 Styling
- [x] Dark theme (bg-[#0f1117])
- [x] Tailwind CSS custom color palette
- [x] Responsive design

---

## Phase 5: Cron & Automation — COMPLETE

### 5.1 Cron Jobs (`server/cron.ts`)
- [x] Monday 10:00 AM ET: Run scan workflow for all enabled strategies
- [x] Daily 5:15 PM ET Mon-Fri: Update P&L for all active portfolios
- [x] Market holiday detection via Polygon API
- [x] Auto-reschedule to next trading day on holidays
- [x] Multiple strategy support (Bi-Weekly + Yearly)
- [x] Timezone handling (America/New_York)

### 5.2 Utilities (`server/utils/dates.ts`)
- [x] `getEasternDate()` — Eastern Time date formatting
- [x] Expiration date parsing (multiple formats)
- [x] Option ticker builder (O:AAPL260227P00385000 format)
- [x] Cents/basis points conversion utilities

---

## Phase 6: Authentication — COMPLETE

> **Reference:** [SUB_PORTAL_AUTH_IMPLEMENTATION.md](./SUB_PORTAL_AUTH_IMPLEMENTATION.md)
> **Golden truth:** [UNIFIED_AUTH_STRATEGY.md](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md)

### 6.1 Dependencies & Config
- [x] Install `jose` and `cookie-parser` (+ `@types/cookie-parser`)
- [x] Add env vars: `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, `MEMBER_PORTAL_URL`
- [x] Add frontend env var: `VITE_MEMBER_PORTAL_URL`
- [x] Update `.env.example` with auth variables
- [x] Add startup env var validation (fail-fast always — matches SwingTrade)

### 6.2 Backend Auth
- [x] Create `server/auth.ts` with `handleAuthHandoff()` and `requireAuth()`
- [x] Add `cookie-parser` middleware to `server/index.ts`
- [x] Mount `GET /auth/handoff` route (before auth middleware)
- [x] Apply `requireAuth` middleware to `/api/*` (excluding `/api/health`)
- [x] Replace open `cors()` with restricted CORS (portal origin always)
- [x] Resolve cron job auth conflict — refactored to call service functions directly (no HTTP)

### 6.3 Frontend Auth
- [x] Add `credentials: 'include'` to `fetchJSON` in `src/api.ts`
- [x] Add 401 detection → redirect to Member Portal
- [x] Wire `VITE_MEMBER_PORTAL_URL` env var
- [x] Add `src/vite-env.d.ts` for Vite type support

### 6.4 Validation (to test on staging)
- [ ] Unauthenticated API calls return `401 { error: 'unauthorized' }`
- [ ] `GET /auth/handoff?token=valid` sets cookie and redirects to `/`
- [ ] `GET /auth/handoff?token=expired` redirects to portal with `?error=invalid_token`
- [ ] `GET /auth/handoff?token=wrong_service` redirects with `?error=invalid_service`
- [ ] Authenticated API calls work normally with session cookie
- [ ] `/api/health` returns 200 without authentication
- [ ] Cron jobs still run correctly after auth is added

### 6.5 Implementation Notes
- Auth is **required always** — server fails to start if `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, or `MEMBER_PORTAL_URL` are missing (matches SwingTrade behavior)
- Cron jobs call service functions directly (`saveScanResults`, `createPortfoliosFromScan`, `updateAllPortfolioPnl`) — completely bypasses HTTP/auth layer
- CORS is always restricted to portal origin (no open CORS in dev)

---

## Phase 7: Staging Environment — NOT STARTED

> **Reference:** Golden truth Section 17, SUB_PORTAL_AUTH doc Section 14

### 7.1 Railway Staging Setup
- [ ] Create `cyclescope-option-strategy-staging` project in Railway
- [ ] Configure staging PostgreSQL database
- [ ] Set deployment source to `staging` branch
- [ ] Configure staging-specific env vars (separate secrets from production)

### 7.2 Staging Validation
- [ ] Deploy to staging successfully
- [ ] Verify database migrations run
- [ ] Verify health check endpoint
- [ ] Verify cron jobs execute (or disable with `DISABLE_CRON` if API quota is a concern)
- [ ] Test full workflow: scan → portfolio creation → P&L update
- [ ] Test auth handoff flow with staging portal

### 7.3 Branch Strategy
```
feature branches → staging branch → staging deploy → test → main → production
```

---

## Phase 8: Testing & Hardening — NOT STARTED

### 8.1 Unit Tests
- [ ] Portfolio math: spread P&L calculations, premium calculations
- [ ] Date utilities: expiration parsing, Eastern Time, option ticker formatting
- [ ] Cents/basis points conversion round-trip accuracy
- [ ] Auth token verification logic

### 8.2 Integration Tests
- [ ] API route tests with mock database
- [ ] Polygon API client with mock responses
- [ ] Portfolio creation workflow end-to-end
- [ ] P&L update workflow end-to-end
- [ ] Auth handoff flow

### 8.3 Edge Cases
- [ ] Trades expiring on market holidays
- [ ] Scan with fewer than 5 results
- [ ] Polygon API rate limit / quota exceeded handling
- [ ] Option Samurai login failure / site changes
- [ ] Network timeout during portfolio creation
- [ ] Partial trade failures during P&L updates

### 8.4 Error Handling
- [ ] Frontend error boundary for API failures
- [ ] Graceful degradation when Polygon API is unavailable
- [ ] Logging and monitoring for cron job failures

---

## Phase 9: Production Deploy — NOT STARTED

### 9.1 Pre-Production Checklist
- [ ] All staging tests pass
- [ ] Auth flow tested with production portal
- [ ] Environment variables configured in Railway production
- [ ] Database migrations verified
- [ ] Cron job schedule confirmed

### 9.2 Deploy
- [ ] Merge staging → main
- [ ] Verify production deployment
- [ ] Monitor first Monday scan workflow
- [ ] Monitor first daily P&L update
- [ ] Verify frontend loads and displays data correctly

### 9.3 Post-Deploy
- [ ] Monitor for 1 full week (scan + 5 P&L updates)
- [ ] Check Polygon API usage / quota
- [ ] Verify expiration handling on first trade expiration
- [ ] Performance check: P&L update duration with 10+ active trades

---

## Development Log

### 2026-02-21 — Project Assessment
- **Status:** Phases 1-5 complete (~97% of core functionality)
- **Codebase:** All 14 API endpoints, 4 frontend views, scraper, Polygon client, cron jobs
- **What works:** Full data pipeline from Option Samurai → DB → Portfolio → P&L tracking → Frontend display
- **What's missing:** Authentication (Phase 6), staging environment (Phase 7), tests (Phase 8)
- **Key files:**
  - Schema: `server/db/schema.ts`
  - Scraper: `server/services/scraper.ts`
  - Polygon: `server/services/polygon.ts`
  - Portfolio: `server/services/portfolio.ts`
  - Cron: `server/cron.ts`
  - Frontend: `src/App.tsx`, `src/api.ts`, `src/*.tsx`

### 2026-02-21 — Phase 6: Authentication Implemented
- **Installed** `jose` + `cookie-parser` dependencies
- **Created** `server/auth.ts` — `handleAuthCallback()` (portal JWT handoff) + `requireAuth()` (session middleware)
- **Updated** `server/index.ts` — cookie-parser, restricted CORS, auth handoff route, auth middleware on `/api/*`
- **Refactored** `server/cron.ts` — removed `localPost()` HTTP calls, now calls service functions directly (scraper, portfolio, P&L)
- **Updated** `src/api.ts` — `credentials: 'include'` + 401 → portal redirect
- **Added** `src/vite-env.d.ts` for Vite `import.meta.env` type support
- **Updated** `.env.example` with auth variables
- **Design decision:** Auth optional in dev (warn only), required in production (fail-fast)
- TypeScript compilation verified clean (both server and frontend)

### 2026-02-21 — Auth Aligned with SwingTrade
- **Renamed** `handleAuthCallback()` → `handleAuthHandoff()` to match golden doc terminology
- **Removed** optional dev mode — server now fails fast if auth env vars are missing in all environments, matching SwingTrade's approach
- **CORS** always restricted to portal origin (no more open CORS in dev)
- **Files changed:** `server/auth.ts`, `server/index.ts`
- **Code pushed to `staging` branch** — ready for Railway staging deployment

### Next Steps
1. **Phase 7 (Staging)** — Configure Railway staging service, deploy from `staging` branch, validate auth handoff flow.
2. **Phase 8 (Tests)** — Add unit tests for critical math (P&L, conversions) and auth flow.
3. **Phase 9 (Deploy)** — Production deploy after staging validation.

---

## Architecture Notes

### Data Flow
```
Option Samurai → Scraper (Playwright) → DB (option_scan_results)
                                            ↓
                                     Portfolio Service
                                            ↓
                              DB (option_portfolios + trades)
                                            ↓
                         Polygon API → P&L Updates → DB (value_history)
                                            ↓
                                    React Frontend
```

### Storage Convention
- All monetary values stored as **integers (cents)** in the database
- All percentage values stored as **integers (basis points)** in the database
- API layer converts cents → dollars and basis points → percentages for frontend consumption

### Strategy Support
Two strategies currently configured:
1. **Bi-Weekly Income** (`bi-weekly income all`) — primary strategy
2. **Yearly Income** (`yearly income all`) — secondary strategy

Each strategy runs independently with its own scan results, portfolios, and P&L tracking.
