# OptionStrategy — Sub-Portal Authentication Implementation Guide

> **Golden truth:** [cyclescope-doc/docs/UNIFIED_AUTH_STRATEGY.md](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md)
> **This document:** OptionStrategy-specific implementation derived from the unified strategy.
> SwingTrade uses an identical implementation with different constants (see Section 2).
> **Last updated:** 2026-02-20
> **Status:** Aligned with UNIFIED_AUTH_STRATEGY.md — any conflict, the golden truth wins.

---

## 1. Architecture Overview

```
User clicks "Launch Option Strategy" in Member Portal
        │
        ▼
Portal verifies session + tier access
        │
        ▼
Portal generates 5-min handoff JWT
  signed with OPTION_STRATEGY_TOKEN_SECRET
        │
        ▼
Browser redirects to:
  https://option-strategy.up.railway.app/auth/handoff?token=<jwt>
        │
        ▼
OptionStrategy verifies handoff token
  → validates `service` claim (if present) matches 'option_strategy'
  → checks tier is in ALLOWED_TIERS
  → creates local 7-day session JWT (signed with own JWT_SECRET)
  → sets httpOnly cookie 'option_strategy_session'
  → redirects to /
        │
        ▼
All subsequent API calls include session cookie
        │
        ▼
requireAuth middleware validates cookie on every /api/* request (except /api/health)
```

**Key principles** (from unified strategy Section 1):
- Sub-portals **never** handle passwords, signup, or OAuth
- All user authentication UI lives **exclusively** in the Member Portal
- Patreon is a **subscription data source only** — managed entirely by the Portal
- Sub-portals verify tokens and check tiers — that's it
- Sub-portal data is shared across all premium users (no per-user data isolation)

---

## 2. Service-Specific Constants

Each sub-portal uses the **identical** implementation pattern, differing only in these constants.

| Constant | OptionStrategy | SwingTrade |
|----------|---------------|------------|
| `SERVICE_ID` | `'option_strategy'` | `'swingtrade'` |
| `SESSION_COOKIE_NAME` | `'option_strategy_session'` | `'swingtrade_session'` |
| `ALLOWED_TIERS` | `['basic', 'stocks_and_options']` | `['basic', 'stocks_and_options']` |
| Portal secret env var | `OPTION_STRATEGY_TOKEN_SECRET` | `SWINGTRADE_TOKEN_SECRET` |
| Sub-portal secret env var | `PREMIUM_TOKEN_SECRET` | `PREMIUM_TOKEN_SECRET` |
| Portal launch endpoint | `POST /api/launch/option-strategy` | `POST /api/launch/swingtrade` |
| Auth module file | `server/auth.ts` | `server/auth.js` |
| Frontend API file | `src/api.ts` | `client/src/api.ts` |

> **Current business policy:** Both services are **premium services** that nominally belong to `stocks_and_options`. However, all `basic` members currently receive promotional access. To restrict later, change `ALLOWED_TIERS` to `['stocks_and_options']` — one-line change, no DB migration.

---

## 3. Subscription Tiers

Only two canonical tier values exist across all CycleScope services:

| Internal Key | Tier Name | Nominal Access |
|-------------|-----------|----------------|
| `'basic'` | Basic | Portal only |
| `'stocks_and_options'` | Stocks + Options | Portal + SwingTrade + OptionStrategy |

**There is no `'free'`, `'premium'`, or `'stocks'` tier.** Use these exact string values verbatim.

```typescript
type SubscriptionTier = 'basic' | 'stocks_and_options';
```

Patreon tier mapping (portal-side only — sub-portals never do this):
- `'Basic'` / `'Basic Tier'` → `'basic'`
- `'Premium'` / `'Premium Tier'` / `'Stocks + Options'` → `'stocks_and_options'`
- Unmapped / null → `'basic'` (default)

---

## 4. Dependencies

```bash
npm install jose cookie-parser
npm install -D @types/cookie-parser
```

| Package | Version | Purpose |
|---------|---------|---------|
| `jose` | `^5.2.0` | JWT signing and verification (HS256) |
| `cookie-parser` | `^1.4.6` | Parse cookies from incoming requests (`req.cookies`) |

---

## 5. Environment Variables

### Backend (.env)

```env
# Shared secret with Member Portal
# MUST match portal's OPTION_STRATEGY_TOKEN_SECRET
PREMIUM_TOKEN_SECRET=<same-value-as-portals-OPTION_STRATEGY_TOKEN_SECRET>

# Local session signing key — unique to OptionStrategy, never shared
# Generate with: openssl rand -base64 32
JWT_SECRET=<unique-random-secret>

# Member Portal URL — used for CORS origin and unauthenticated redirects
MEMBER_PORTAL_URL=https://portal.cyclescope.com
```

### Frontend (.env)

```env
# Member Portal URL — used for 401 redirect
VITE_MEMBER_PORTAL_URL=https://portal.cyclescope.com
```

### Cross-Reference (from golden truth Section 3)

| Variable | Portal | This Service (OptionStrategy) | SwingTrade |
|----------|--------|-------------------------------|------------|
| `JWT_SECRET` | unique | unique | unique |
| `OPTION_STRATEGY_TOKEN_SECRET` | yes | — | — |
| `PREMIUM_TOKEN_SECRET` | — | yes (= portal's `OPTION_STRATEGY_TOKEN_SECRET`) | yes (= portal's `SWINGTRADE_TOKEN_SECRET`) |
| `MEMBER_PORTAL_URL` | — | yes | yes |

**Critical rules:**
- `PREMIUM_TOKEN_SECRET` and `JWT_SECRET` MUST be different values — compromise of the shared handoff secret should not compromise local sessions
- Each sub-portal's `PREMIUM_TOKEN_SECRET` matches a **different** portal secret (per-service isolation)
- Compromising one service's secret does not affect the other

### Startup Validation

Services MUST fail fast if required auth vars are missing:

```typescript
const REQUIRED_ENV_VARS = ['PREMIUM_TOKEN_SECRET', 'JWT_SECRET', 'MEMBER_PORTAL_URL'];

for (const varName of REQUIRED_ENV_VARS) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}
```

---

## 6. JWT Specifications

### 6.1 Handoff Token (Portal → OptionStrategy)

Issued by the Member Portal, verified by this service.

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Library | `jose` |
| Secret | Portal's `OPTION_STRATEGY_TOKEN_SECRET` (verified with our `PREMIUM_TOKEN_SECRET`) |
| Expiration | 5 minutes |

**Canonical payload (from golden truth Section 5.2):**

```json
{
  "sub": "<userId as string>",
  "email": "<user email>",
  "tier": "basic | stocks_and_options",
  "service": "option_strategy",
  "iat": 1234567890,
  "exp": 1234568190
}
```

> **Important:** `sub` is set via `.setSubject()` on the portal side — NOT as a payload field.
> Do NOT expect `userId` or `patreonId` — always use `payload.sub`.

### 6.2 Local Session Token (OptionStrategy)

Created after successful handoff, stored as httpOnly cookie.

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Library | `jose` |
| Secret | This service's own `JWT_SECRET` |
| Expiration | 7 days |

**Canonical payload (from golden truth Section 5.3):**

```json
{
  "sub": "<userId from handoff>",
  "email": "<email from handoff>",
  "tier": "basic | stocks_and_options",
  "iat": 1234567890,
  "exp": 1235172690
}
```

> **Important:** Use `.setSubject(payload.sub)` — do NOT put user ID in the payload body.

---

## 7. Cookie Specifications

From golden truth Section 6:

| Property | Value |
|----------|-------|
| Name | `option_strategy_session` |
| `httpOnly` | `true` (prevents XSS JavaScript access) |
| `secure` | `process.env.NODE_ENV === 'production'` |
| `sameSite` | `'lax'` (CSRF protection) |
| `path` | `'/'` |
| `maxAge` | `7 * 24 * 60 * 60 * 1000` (7 days in ms) |

> **Railway note:** Behind Railway proxy, the `secure` flag may need to check `X-Forwarded-Proto` header. The portal has a utility for this at `server/_core/cookies.ts`.

---

## 8. Implementation

### 8.1 Auth Module (`server/auth.ts`)

This is the canonical implementation from golden truth Section 8, with OptionStrategy constants.

```typescript
// server/auth.ts
import { jwtVerify, SignJWT } from 'jose';
import { Request, Response, NextFunction } from 'express';

// ── Service-specific constants ──
export const SESSION_COOKIE_NAME = 'option_strategy_session';
const SERVICE_ID = 'option_strategy';

// Premium service — nominally stocks_and_options only.
// Currently all tiers get access (business decision). To restrict: ['stocks_and_options']
const ALLOWED_TIERS: string[] = ['basic', 'stocks_and_options'];

// ── Handoff Endpoint ──
export async function handleAuthHandoff(req: Request, res: Response) {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=missing_token`);
  }

  try {
    // 1. Verify handoff token from Member Portal
    const premiumSecret = new TextEncoder().encode(process.env.PREMIUM_TOKEN_SECRET);
    const { payload } = await jwtVerify(token, premiumSecret);

    // 2. Validate the token is intended for this service (if claim present)
    if (payload.service && payload.service !== SERVICE_ID) {
      console.error(`[Auth] Token service mismatch: expected ${SERVICE_ID}, got ${payload.service}`);
      return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=invalid_service`);
    }

    // 3. Check tier authorization
    if (!ALLOWED_TIERS.includes(payload.tier as string)) {
      return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=upgrade_required`);
    }

    // 4. Create local session token
    const sessionSecret = new TextEncoder().encode(process.env.JWT_SECRET);
    const sessionToken = await new SignJWT({
      email: payload.email as string,
      tier: payload.tier as string,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub as string)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(sessionSecret);

    // 5. Set session cookie
    res.cookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // 6. Redirect to app root
    return res.redirect('/');

  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=invalid_token`);
  }
}

// ── Auth Middleware ──
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    (req as any).user = payload;  // { sub, email, tier, iat, exp }
    next();
  } catch {
    return res.status(401).json({ error: 'session_expired' });
  }
}
```

**Key alignment points with golden truth:**
- Service claim check uses `payload.service && payload.service !== SERVICE_ID` (tolerates missing claim)
- `(req as any).user = payload` matches golden truth Section 8.2 exactly
- Error logging with `[Auth]` prefix matches golden truth
- Error responses use lowercase snake_case: `unauthorized`, `session_expired`

### 8.2 Server Setup (`server/index.ts`)

The middleware order matters. Changes to the existing `server/index.ts`:

```typescript
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { handleAuthHandoff, requireAuth } from './auth';

// ── Env var validation (before anything else) ──
const REQUIRED_ENV_VARS = ['PREMIUM_TOKEN_SECRET', 'JWT_SECRET', 'MEMBER_PORTAL_URL'];
for (const varName of REQUIRED_ENV_VARS) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}

// 1. CORS — restricted to portal origin (replaces open cors())
app.use(cors({
  origin: process.env.MEMBER_PORTAL_URL,
  credentials: true,
}));

// 2. Cookie parser (before auth middleware)
app.use(cookieParser());

// 3. JSON body parser
app.use(express.json());

// 4. Auth handoff endpoint (no auth required)
app.get('/auth/handoff', handleAuthHandoff);

// 5. Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 6. Auth middleware (protects all /api/* routes below)
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  return requireAuth(req, res, next);
});

// 7. Protected API routes
app.use('/api/option-scans', optionScansRoutes);
app.use('/api/option-portfolios', optionPortfoliosRoutes);
app.use('/api/option-automation', optionAutomationRoutes);
```

> **Note on CORS:** CORS only restricts browsers. The `requireAuth` middleware is the real security layer.

### 8.3 Frontend 401 Handling (`src/api.ts`)

Update the existing `fetchJSON` wrapper. From golden truth Section 11, adapted to OptionStrategy's existing `api.ts` pattern:

```typescript
const MEMBER_PORTAL_URL = import.meta.env.VITE_MEMBER_PORTAL_URL
  || 'https://portal.cyclescope.com';

const BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    credentials: 'include',  // MUST include cookies
  });

  if (res.status === 401) {
    window.location.href = MEMBER_PORTAL_URL;
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}
```

**Changes from current `src/api.ts`:**
1. Add `credentials: 'include'` to all fetch calls
2. Check for `401` before the generic `!res.ok` check
3. Redirect to Member Portal on 401
4. Add `VITE_MEMBER_PORTAL_URL` env var

> **Note:** The golden truth (Section 11) uses `apiFetch()` returning raw `Response`. OptionStrategy already has `fetchJSON<T>()` returning parsed JSON. We keep `fetchJSON` to match existing call sites, but add the auth behavior. SwingTrade should use the same pattern adapted to their `client/src/api.ts`.

### 8.4 Cron Jobs

Both OptionStrategy and SwingTrade have server-side cron jobs (via `node-cron`) that call internal `localhost` endpoints for scans and price updates. These are **server-to-server calls within the same process** — they do NOT go through the browser and are NOT subject to CORS or cookie auth.

**Current approach (both projects):** Cron handlers call internal functions directly or hit `localhost` endpoints. Since `requireAuth` only applies to `/api/*` routes and cron calls originate from the server process itself, they bypass auth naturally.

**If cron jobs call `localhost/api/*` via HTTP:** They will hit the auth middleware and fail. Options:
1. **(Recommended)** Refactor cron to call service functions directly instead of HTTP endpoints
2. Add a health-check-style exclusion for cron-triggered paths
3. Use a server-side auth bypass token (adds complexity)

---

## 9. Error Handling

### Sub-Portal API Errors (from golden truth Section 14.1)

```typescript
// Missing session cookie
res.status(401).json({ error: 'unauthorized' });

// Expired or invalid session token
res.status(401).json({ error: 'session_expired' });
```

### Auth Redirect Error Parameters (from golden truth Section 14.3)

| Query Parameter | Meaning |
|----------------|---------|
| `?error=missing_token` | No token provided in handoff request |
| `?error=invalid_token` | Token verification failed (expired, bad signature) |
| `?error=invalid_service` | Token's `service` claim doesn't match this sub-portal |
| `?error=upgrade_required` | User's tier not in `ALLOWED_TIERS` |

---

## 10. What Sub-Portals Do NOT Implement

From golden truth Section 1 & 8, and cross-project analysis:

| Feature | Reason |
|---------|--------|
| `user_id` columns in database | Data is shared across all premium users, not per-user |
| Login form / signup page | All auth UI lives in the Member Portal |
| Password hashing (bcrypt) | Sub-portals never see passwords |
| Patreon OAuth / webhooks | Handled entirely by the Member Portal |
| Admin roles / RBAC | No admin features in sub-portals |
| Per-user scans or portfolios | Portfolios and scans are system-generated, globally shared |
| Token refresh endpoint | User re-authenticates via Member Portal after 7-day session expires |
| Patreon tier sync | Portal syncs tiers daily; sub-portals read tier from JWT |

---

## 11. Security Summary

From golden truth Section 12, scoped to sub-portal responsibilities:

| Measure | Purpose |
|---------|---------|
| Per-service handoff secrets | Compromise isolation — one leaked secret doesn't expose other services |
| 5-minute handoff JWT | Short-lived, limits interception window |
| `service` claim validation | Rejects tokens meant for other sub-portals (if claim present) |
| Tier embedded in JWT | Authorization without DB call |
| `requireAuth` middleware | Blocks unauthenticated API access |
| 7-day local session cookie | Persistent login within sub-portal |
| `httpOnly` flag | Prevents XSS JavaScript access to cookie |
| `secure` flag (production) | HTTPS-only cookie transmission |
| `sameSite: 'lax'` | CSRF protection |
| CORS lockdown | Restricts browser-originated cross-origin requests |
| Separate `JWT_SECRET` per service | Local session compromise isolated per service |
| `/api/health` excluded from auth | Deployment health probes don't need authentication |
| Env var validation on startup | Fail fast if secrets are missing |

---

## 12. Tier Propagation & Revocation

From golden truth Section 10 (propagation delay note):

1. Portal's daily sync (+ webhooks) updates the user's tier
2. The user's existing sub-portal session cookie remains valid (up to 7 days)
3. On next portal re-auth, the new tier is embedded in the handoff token
4. Sub-portal creates a new session with the updated tier

**Optional future enhancement:** Sub-portals could expose a `POST /api/revoke` endpoint callable by the portal for immediate session invalidation.

---

## 13. Implementation Phases (OptionStrategy-specific)

### Phase 1: Dependencies & Config
- [ ] `npm install jose cookie-parser && npm install -D @types/cookie-parser`
- [ ] Add `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, `MEMBER_PORTAL_URL` to `.env`
- [ ] Add `VITE_MEMBER_PORTAL_URL` to frontend `.env`
- [ ] Update `.env.example` with new variables (no actual secrets)
- [ ] Add startup env var validation to `server/index.ts`

### Phase 2: Backend Auth
- [ ] Create `server/auth.ts` with `handleAuthHandoff()` and `requireAuth()` (Section 8.1)
- [ ] Add `cookie-parser` middleware to `server/index.ts`
- [ ] Mount `GET /auth/handoff` route (before auth middleware)
- [ ] Apply `requireAuth` middleware to `/api/*` (excluding `/api/health`)
- [ ] Replace `app.use(cors())` with restricted CORS (Section 8.2)
- [ ] Verify cron jobs still work after auth is added (Section 8.4)

### Phase 3: Frontend Auth
- [ ] Add `credentials: 'include'` to `fetchJSON` in `src/api.ts`
- [ ] Add 401 detection → redirect to `MEMBER_PORTAL_URL`
- [ ] Wire `VITE_MEMBER_PORTAL_URL` env var

### Phase 4: Validation
- [ ] Unauthenticated API calls return `401 { error: 'unauthorized' }`
- [ ] `GET /auth/handoff?token=valid` sets cookie and redirects to `/`
- [ ] `GET /auth/handoff?token=expired` redirects to portal with `?error=invalid_token`
- [ ] `GET /auth/handoff?token=wrong_service` redirects with `?error=invalid_service`
- [ ] Authenticated API calls work normally with session cookie
- [ ] `/api/health` returns 200 without authentication
- [ ] Cron jobs (scans, P&L updates) still run correctly

---

## 14. Staging & Deployment

From golden truth Section 17:

### Branch Strategy

```
feature/premium-auth → staging branch → Staging deploys → Test → main branch → Production
```

### Staging Environment (Railway)

```
PRODUCTION                          STAGING
cyclescope-option-strategy          cyclescope-option-strategy-staging
  (deploys from: main)                (deploys from: staging)
```

Staging uses separate secrets and URLs — never share production secrets with staging.

---

## 15. Current Codebase Status

**As of 2026-02-20, NO auth code exists yet.** This is the baseline:

| Component | Current State | Action Needed |
|-----------|--------------|---------------|
| `server/index.ts` | `app.use(cors())` — open CORS, no cookie parser, no auth | Restructure per Section 8.2 |
| `server/auth.ts` | Does not exist | Create per Section 8.1 |
| `src/api.ts` | `fetchJSON` — no `credentials: 'include'`, no 401 handling | Update per Section 8.3 |
| `package.json` | Has `cors`, missing `jose` and `cookie-parser` | Install per Section 4 |
| `.env.example` | No auth variables | Add per Section 5 |
| API routes | All unauthenticated | Protected by middleware after Phase 2 |
| Database | No user/auth tables (not needed — sub-portals don't store user data) | No changes needed |
| Cron jobs (`server/cron.ts`) | Call internal endpoints via localhost | Verify still works after auth (Section 8.4) |

---

## Supersedes

This document replaces the previous `SUB_PORTAL_AUTH_INTEGRATION.md`. Key corrections:

| Previous Doc | This Doc (aligned with golden truth) |
|-------------|--------------------------------------|
| `GET /auth?token=xxx` | `GET /auth/handoff?token=xxx` |
| Single shared `PREMIUM_TOKEN_SECRET` | Per-service secrets (blast radius isolation) |
| `userId` in JWT payload | `sub` via `.setSubject()` |
| No `service` claim validation | Validate if `service` claim present |
| Strict `service !== SERVICE_ID` | `payload.service && payload.service !== SERVICE_ID` (tolerant) |
| No tier check on handoff | `ALLOWED_TIERS` check required |
| Title case errors | Lowercase snake_case: `unauthorized`, `session_expired` |
| No error logging | `console.error('[Auth] ...')` on failures |
| `req.user` via global type augmentation | `(req as any).user = payload` per golden truth |
| No `VITE_MEMBER_PORTAL_URL` | Required for frontend 401 redirect |
| No env var startup validation | Fail-fast validation required |
| No cron job guidance | Section 8.4 addresses cron/auth interaction |
| No codebase status section | Section 15 documents current state |
