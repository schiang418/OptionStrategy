# Sub-Portal Authentication Implementation Strategy

> **Applies to:** OptionStrategy, SwingTrade, and all future CycleScope sub-portals
> **Single source of truth:** [cyclescope-doc/docs/UNIFIED_AUTH_STRATEGY.md](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md)
> **Related:** [CROSS_PROJECT_DISCREPANCIES.md](https://github.com/schiang418/cyclescope-doc/blob/main/docs/CROSS_PROJECT_DISCREPANCIES.md) | [GAP_ANALYSIS_SUMMARY.md](https://github.com/schiang418/cyclescope-doc/blob/main/docs/GAP_ANALYSIS_SUMMARY.md)
> **Last updated:** 2026-02-20
> **Status:** Canonical — both OptionStrategy and SwingTrade agents MUST follow this spec

---

## 1. Architecture Overview

```
User clicks "Launch [Service]" in Member Portal
        │
        ▼
Portal verifies session + tier access
        │
        ▼
Portal generates 5-min handoff JWT
  signed with per-service secret (OPTION_STRATEGY_TOKEN_SECRET or SWINGTRADE_TOKEN_SECRET)
        │
        ▼
Browser redirects to:
  https://<sub-portal>/auth/handoff?token=<jwt>
        │
        ▼
Sub-portal verifies handoff token
  → validates `service` claim matches this service
  → checks tier is in ALLOWED_TIERS
  → creates local 7-day session JWT (signed with own JWT_SECRET)
  → sets httpOnly session cookie
  → redirects to /
        │
        ▼
All subsequent API calls include session cookie
        │
        ▼
requireAuth middleware validates cookie on every /api/* request (except /api/health)
```

**Key principles:**
- Sub-portals **never** handle passwords, signup, or OAuth
- All user authentication UI lives exclusively in the Member Portal
- Patreon is purely a subscription data source managed by the Portal
- Sub-portals verify tokens and check tiers — that's it

---

## 2. Service-Specific Constants

Each sub-portal uses the same implementation pattern but with different constants:

| Constant | OptionStrategy | SwingTrade |
|----------|---------------|------------|
| `SERVICE_ID` | `'option_strategy'` | `'swingtrade'` |
| `SESSION_COOKIE_NAME` | `'option_strategy_session'` | `'swingtrade_session'` |
| `ALLOWED_TIERS` | `['basic', 'stocks_and_options']` | `['basic', 'stocks_and_options']` |
| Portal secret name | `OPTION_STRATEGY_TOKEN_SECRET` | `SWINGTRADE_TOKEN_SECRET` |
| Local env var for shared secret | `PREMIUM_TOKEN_SECRET` | `PREMIUM_TOKEN_SECRET` |
| Launch endpoint (portal-side) | `POST /api/launch/option-strategy` | `POST /api/launch/swingtrade` |

> **Current business policy:** All `basic` members receive promotional access to premium services. To restrict access later, remove `'basic'` from `ALLOWED_TIERS`.

---

## 3. Subscription Tiers (Canonical)

Only two tier values exist across all CycleScope services:

| Tier | Description |
|------|-------------|
| `'basic'` | Default tier for all portal users |
| `'stocks_and_options'` | Premium tier from Patreon subscription |

**There is no `'free'`, `'premium'`, or `'stocks'` tier.** These were deprecated per the unified strategy.

Patreon tier mapping (portal-side only):
- `'Basic'` / `'Basic Tier'` → `'basic'`
- `'Premium'` / `'Premium Tier'` / `'Stocks + Options'` → `'stocks_and_options'`
- Unmapped / null → `'basic'` (default)

---

## 4. Dependencies

```bash
npm install jose cookie-parser
npm install -D @types/cookie-parser
```

| Package | Purpose |
|---------|---------|
| `jose` | JWT signing and verification (HS256) |
| `cookie-parser` | Parse cookies from incoming requests (`req.cookies`) |

---

## 5. Environment Variables

### Backend (.env)

```env
# Shared secret with Member Portal
# Must match portal's OPTION_STRATEGY_TOKEN_SECRET (or SWINGTRADE_TOKEN_SECRET)
PREMIUM_TOKEN_SECRET=<per-service-secret>

# Member Portal URL — used for CORS origin and unauthenticated redirects
MEMBER_PORTAL_URL=https://portal.cyclescope.com

# Local session signing key — unique to this sub-portal, never shared
# Generate with: openssl rand -base64 32
JWT_SECRET=<unique-random-secret>
```

### Frontend (.env)

```env
# Member Portal URL — used for 401 redirect
VITE_MEMBER_PORTAL_URL=https://portal.cyclescope.com
```

**Critical rules:**
- Each sub-portal's `PREMIUM_TOKEN_SECRET` matches a **different** portal secret (per-service isolation)
- Each sub-portal has its own unique `JWT_SECRET` — never shared between services
- Compromising one service's secret does not affect others

### Startup Validation

Services MUST fail fast if required auth vars are missing:

```typescript
const REQUIRED_AUTH_VARS = ['PREMIUM_TOKEN_SECRET', 'JWT_SECRET', 'MEMBER_PORTAL_URL'];

for (const varName of REQUIRED_AUTH_VARS) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}
```

---

## 6. JWT Specifications

### 6.1 Handoff Token (Portal → Sub-Portal)

Issued by the Member Portal, verified by the sub-portal.

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Library | `jose` |
| Secret | Per-service (`OPTION_STRATEGY_TOKEN_SECRET` or `SWINGTRADE_TOKEN_SECRET`) |
| Expiration | 5 minutes |

**Canonical payload:**

```json
{
  "sub": "<userId>",
  "email": "<user email>",
  "tier": "basic | stocks_and_options",
  "service": "option_strategy | swingtrade",
  "iat": 1234567890,
  "exp": 1234568190
}
```

> **Important:** The `sub` claim MUST be set via `.setSubject()` — NOT as a payload field.
> Do NOT expect `userId` or `patreonId` — use `payload.sub` for user identification.

### 6.2 Local Session Token (Sub-Portal)

Created by the sub-portal after successful handoff, stored as httpOnly cookie.

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Library | `jose` |
| Secret | Sub-portal's own `JWT_SECRET` |
| Expiration | 7 days |

**Canonical payload:**

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

| Property | Value |
|----------|-------|
| Name | `option_strategy_session` or `swingtrade_session` |
| `httpOnly` | `true` (prevents XSS JavaScript access) |
| `secure` | `true` in production (HTTPS only) |
| `sameSite` | `'lax'` (CSRF protection) |
| `path` | `'/'` |
| `maxAge` | 7 days (in milliseconds: `604800000`) |

> **Railway note:** Behind Railway proxy, the `secure` flag may need to check `X-Forwarded-Proto` header instead of just `NODE_ENV`.

---

## 8. Implementation

### 8.1 Token Exchange Endpoint

**Route:** `GET /auth/handoff?token=xxx`

```typescript
import * as jose from 'jose';

// Service-specific constants
const SERVICE_ID = 'option_strategy';  // SwingTrade: 'swingtrade'
const SESSION_COOKIE_NAME = 'option_strategy_session';  // SwingTrade: 'swingtrade_session'
const ALLOWED_TIERS = ['basic', 'stocks_and_options'];
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

app.get('/auth/handoff', async (req, res) => {
  const { token } = req.query;
  const portalUrl = process.env.MEMBER_PORTAL_URL!;

  if (!token || typeof token !== 'string') {
    return res.redirect(`${portalUrl}?error=missing_token`);
  }

  try {
    // 1. Verify handoff token using shared per-service secret
    const handoffSecret = new TextEncoder().encode(process.env.PREMIUM_TOKEN_SECRET);
    const { payload } = await jose.jwtVerify(token, handoffSecret);

    // 2. Validate service claim matches THIS service
    if (payload.service !== SERVICE_ID) {
      return res.redirect(`${portalUrl}?error=invalid_service`);
    }

    // 3. Check tier authorization (defense in depth)
    if (!ALLOWED_TIERS.includes(payload.tier as string)) {
      return res.redirect(`${portalUrl}?error=upgrade_required`);
    }

    // 4. Create local session token using sub-portal's own secret
    const sessionSecret = new TextEncoder().encode(process.env.JWT_SECRET);
    const sessionToken = await new jose.SignJWT({
      email: payload.email as string,
      tier: payload.tier as string,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub!)  // user ID via .setSubject()
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(sessionSecret);

    // 5. Set session cookie
    res.cookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });

    // 6. Redirect to app root
    return res.redirect('/');
  } catch (err) {
    return res.redirect(`${portalUrl}?error=invalid_token`);
  }
});
```

### 8.2 Auth Middleware

**Applies to:** All `/api/*` routes **except** `/api/health`

```typescript
import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';

interface AuthPayload {
  sub: string;
  email: string;
  tier: string;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);

    req.user = {
      sub: payload.sub!,
      email: payload.email as string,
      tier: payload.tier as string,
    };

    next();
  } catch {
    return res.status(401).json({ error: 'session_expired' });
  }
}

// Apply to all /api/* except /api/health
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health') return next();
  return requireAuth(req, res, next);
});
```

> **Error responses use lowercase snake_case:** `unauthorized`, `session_expired` — NOT title case.

### 8.3 CORS Configuration

Replace open CORS with restricted origin:

```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.MEMBER_PORTAL_URL,
  credentials: true,  // required for cross-origin cookies
}));
```

> **Security note:** CORS only restricts browsers. The `requireAuth` middleware is the real security layer.

### 8.4 Server Setup Order

The middleware order in the Express app matters:

```typescript
import cookieParser from 'cookie-parser';

// 1. CORS (must be first)
app.use(cors({
  origin: process.env.MEMBER_PORTAL_URL,
  credentials: true,
}));

// 2. Cookie parser (before auth middleware)
app.use(cookieParser());

// 3. JSON body parser
app.use(express.json());

// 4. Auth handoff endpoint (no auth required)
app.get('/auth/handoff', async (req, res) => { /* ... */ });

// 5. Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 6. Auth middleware (protects all /api/* routes below)
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  return requireAuth(req, res, next);
});

// 7. API routes (all protected)
app.use('/api/option-scans', optionScansRoutes);
app.use('/api/option-portfolios', optionPortfoliosRoutes);
app.use('/api/option-automation', optionAutomationRoutes);
```

### 8.5 Frontend 401 Handling

Update the centralized API client to handle expired sessions:

```typescript
const MEMBER_PORTAL_URL = import.meta.env.VITE_MEMBER_PORTAL_URL
  || 'https://portal.cyclescope.com';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
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

**Key changes from existing `api.ts`:**
1. Add `credentials: 'include'` to all fetch calls
2. Check for `401` before the generic `!res.ok` check
3. Redirect to Member Portal on 401

---

## 9. Error Handling

### Sub-Portal API Errors

```typescript
// Missing session cookie
res.status(401).json({ error: 'unauthorized' });

// Expired or invalid session token
res.status(401).json({ error: 'session_expired' });
```

### Auth Redirect Error Parameters

When redirecting back to Member Portal, append error context:

| Redirect Parameter | Meaning |
|-------------------|---------|
| `?error=missing_token` | No token in handoff request |
| `?error=invalid_token` | Token verification failed (expired, bad signature) |
| `?error=invalid_service` | Token's `service` claim doesn't match this sub-portal |
| `?error=upgrade_required` | User's tier not in `ALLOWED_TIERS` |

---

## 10. What Sub-Portals Do NOT Implement

| Feature | Reason |
|---------|--------|
| `user_id` columns in database | Data is shared across all users, not per-user |
| Login form / signup page | All auth UI lives in the Member Portal |
| Password hashing (bcrypt) | Sub-portals never see passwords |
| Patreon OAuth / webhooks | Handled entirely by the Member Portal |
| Admin roles / RBAC | No admin features in sub-portals |
| Per-user cron job scoping | Scans and P&L updates are global system operations |
| Per-user portfolios | Portfolios are system-generated from market scans |
| Token refresh endpoint | User re-authenticates via Member Portal after session expires |
| Patreon tier sync | Portal syncs tiers daily; sub-portals read tier from JWT |

---

## 11. Security Summary

| Measure | Purpose |
|---------|---------|
| Per-service handoff secrets | Compromise isolation — one leaked secret doesn't expose other services |
| 5-minute handoff JWT | Short-lived, limits interception window |
| `service` claim validation | Rejects tokens meant for other sub-portals |
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

When a user downgrades on Patreon:
1. Portal's daily sync updates the user's tier
2. The user's existing sub-portal session cookie remains valid (up to 7 days)
3. On next portal re-auth, the new lower tier is embedded in the handoff token
4. Sub-portal creates a new session with the lower tier

**Optional future enhancement:** Sub-portals could expose a `POST /api/revoke` endpoint callable by the portal for immediate session invalidation.

---

## 13. Implementation Phases

### Phase 1: Dependencies & Config
- [ ] Install `jose`, `cookie-parser`, `@types/cookie-parser`
- [ ] Add `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, `MEMBER_PORTAL_URL` to `.env`
- [ ] Add `VITE_MEMBER_PORTAL_URL` to frontend `.env`
- [ ] Update `.env.example` with new variables
- [ ] Add startup env var validation

### Phase 2: Backend Auth
- [ ] Add `cookie-parser` middleware
- [ ] Implement `GET /auth/handoff?token=xxx` endpoint
- [ ] Implement `requireAuth` middleware
- [ ] Apply middleware to `/api/*` (excluding `/api/health`)
- [ ] Restrict CORS to `MEMBER_PORTAL_URL` with `credentials: true`

### Phase 3: Frontend Auth
- [ ] Add `credentials: 'include'` to centralized fetch
- [ ] Add 401 detection → redirect to `MEMBER_PORTAL_URL`
- [ ] Wire `VITE_MEMBER_PORTAL_URL` env var

### Phase 4: Validation
- [ ] Test: unauthenticated API calls return `401 { error: 'unauthorized' }`
- [ ] Test: `GET /auth/handoff?token=valid` sets cookie and redirects to `/`
- [ ] Test: `GET /auth/handoff?token=expired` redirects to portal with `?error=invalid_token`
- [ ] Test: `GET /auth/handoff?token=wrong_service` redirects with `?error=invalid_service`
- [ ] Test: authenticated API calls work normally with session cookie
- [ ] Test: `/api/health` returns 200 without authentication
- [ ] Test: cron jobs (scans, P&L updates) still work (server-side, not HTTP)

---

## 14. Staging & Deployment

### Branch Strategy

```
feature/premium-auth → staging → Test → main → Production
```

### Staging Environment

Each sub-portal has a staging project on Railway:

```
PRODUCTION                          STAGING
cyclescope-option-strategy          cyclescope-option-strategy-staging
  (main branch)                       (staging branch)
cyclescope-swingtrade               cyclescope-swingtrade-staging
  (main branch)                       (staging branch)
```

### Staging Env Vars

Staging uses separate secrets and URLs:
- `PREMIUM_TOKEN_SECRET` → staging-specific value (matches staging portal)
- `JWT_SECRET` → unique staging value
- `MEMBER_PORTAL_URL` → staging portal URL
- `VITE_MEMBER_PORTAL_URL` → staging portal URL

---

## 15. Discrepancies Resolved

This document resolves the following discrepancies identified in the [cross-project analysis](https://github.com/schiang418/cyclescope-doc/blob/main/docs/CROSS_PROJECT_DISCREPANCIES.md):

| # | Discrepancy | Resolution in This Doc |
|---|---|---|
| #1 | Tier values mismatch | Canonical: `'basic'`, `'stocks_and_options'` only (Section 3) |
| #2 | Token secret strategy | Per-service secrets via `PREMIUM_TOKEN_SECRET` (Section 5) |
| #6 | Handoff token claims | Canonical: `sub`, `email`, `tier`, `service` (Section 6.1) |
| #7 | Session token claims | Canonical: `sub`, `email`, `tier` via `.setSubject()` (Section 6.2) |
| #10 | Error response casing | Lowercase snake_case: `unauthorized`, `session_expired` (Section 9) |
| #14 | Service identifier values | `'option_strategy'` and `'swingtrade'` (Section 2) |
| #15 | Tier check on handoff | `ALLOWED_TIERS` validation in handoff endpoint (Section 8.1, step 3) |

---

## Supersedes

This document supersedes the previous `SUB_PORTAL_AUTH_INTEGRATION.md`. Key changes from the prior version:

| Previous | Updated |
|----------|---------|
| `GET /auth?token=xxx` | `GET /auth/handoff?token=xxx` |
| Single shared `PREMIUM_TOKEN_SECRET` | Per-service secrets (blast radius isolation) |
| `userId` in JWT payload | `sub` via `.setSubject()` |
| No `service` claim validation | `service` claim MUST match `SERVICE_ID` |
| No tier check on handoff | `ALLOWED_TIERS` check required |
| Title case errors (`Unauthorized`) | snake_case errors (`unauthorized`) |
| No `VITE_MEMBER_PORTAL_URL` | Required for frontend 401 redirect |
| No env var startup validation | Fail-fast validation required |
| No redirect error parameters | Error context appended as query params |
