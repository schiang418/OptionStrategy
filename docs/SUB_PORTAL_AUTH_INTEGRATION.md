# Sub-Portal Authentication Integration Strategy

> **Applies to:** OptionStrategy, SwingTrade, and all future CycleScope premium sub-portals
> **Parent doc:** [CycleScope Authentication & API Architecture](https://github.com/schiang418/cyclescope-member-portal/blob/claude/fix-language-toggle-portal-O5mtJ/docs/AUTHENTICATION_AND_API_ARCHITECTURE.md) (Section 6.5 & 6.9)
> **Status:** Agreed — consensus between OptionStrategy and SwingTrade agents

---

## 1. Overview

Each sub-portal (OptionStrategy, SwingTrade, etc.) is a standalone app that delegates all user authentication to the **CycleScope Member Portal**. Sub-portals never handle passwords, signup, or OAuth. They receive a cryptographic handoff token from the portal and establish their own local session.

### Flow Diagram

```
User clicks "Option Strategy" in Member Portal
        │
        ▼
Member Portal generates a 5-min JWT
signed with PREMIUM_TOKEN_SECRET
        │
        ▼
Browser redirects to:
  https://option-strategy.example.com/auth?token=<jwt>
        │
        ▼
Sub-portal verifies token → sets local session cookie → redirects to dashboard
        │
        ▼
All subsequent API calls include the session cookie
        │
        ▼
requireAuth middleware validates cookie on every /api/* request
```

---

## 2. What to Implement

### 2.1 Dependencies

```bash
npm install jose cookie-parser
```

| Package | Purpose |
|---------|---------|
| `jose` | Decode and verify JWTs (both the portal handoff token and local session tokens) |
| `cookie-parser` | Parse cookies from incoming requests so `req.cookies` is available |

### 2.2 Environment Variables

Add these to `.env` / `.env.example` and the deployment platform:

```env
# Shared secret with CycleScope Member Portal (must match portal's value)
PREMIUM_TOKEN_SECRET=<shared-secret>

# Member Portal URL — used for CORS origin and unauthenticated redirects
MEMBER_PORTAL_URL=https://member-portal.up.railway.app

# Local session signing key — unique to this sub-portal
JWT_SECRET=<random-secret>
```

### 2.3 Token Exchange Endpoint

**Route:** `GET /auth?token=xxx`

This is the entry point from the Member Portal. It:

1. Reads the `token` query parameter
2. Verifies it against `PREMIUM_TOKEN_SECRET` using `jose`
3. Checks expiration (token is valid for 5 minutes)
4. Extracts user info from the payload (e.g., `userId`, `email`, `tier`)
5. Signs a **local session JWT** using `JWT_SECRET` (longer-lived, e.g., 7 days)
6. Sets the session JWT as an **httpOnly cookie**
7. Redirects to the dashboard (`/`)

If the token is invalid or expired, redirect to `MEMBER_PORTAL_URL`.

#### Pseudocode

```ts
import * as jose from 'jose';
import cookieParser from 'cookie-parser';

app.use(cookieParser());

app.get('/auth', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect(process.env.MEMBER_PORTAL_URL!);

  try {
    // Verify the handoff token from Member Portal
    const secret = new TextEncoder().encode(process.env.PREMIUM_TOKEN_SECRET);
    const { payload } = await jose.jwtVerify(token as string, secret);

    // Create a local session token
    const sessionSecret = new TextEncoder().encode(process.env.JWT_SECRET);
    const sessionToken = await new jose.SignJWT({
      userId: payload.userId,
      email: payload.email,
      tier: payload.tier,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(sessionSecret);

    // Set session cookie
    res.cookie('option_strategy_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.redirect('/');
  } catch (err) {
    // Token invalid or expired — send back to portal
    return res.redirect(process.env.MEMBER_PORTAL_URL!);
  }
});
```

> **Note:** Each sub-portal should use its own cookie name to avoid collisions:
> - OptionStrategy: `option_strategy_session`
> - SwingTrade: `swingtrade_session`

### 2.4 Auth Middleware

**Applies to:** All `/api/*` routes **except** `/api/health`

```ts
async function requireAuth(req, res, next) {
  const token = req.cookies?.option_strategy_session; // use your cookie name
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    req.user = payload; // attach user info to request
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}

// Apply to all API routes
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next(); // skip health check
  return requireAuth(req, res, next);
});
```

### 2.5 CORS Lockdown

Replace the open CORS policy with a restricted one:

```ts
import cors from 'cors';

app.use(cors({
  origin: process.env.MEMBER_PORTAL_URL,
  credentials: true, // allow cookies to be sent cross-origin
}));
```

This ensures only the CycleScope portal (and the app's own origin) can call the API. Without `credentials: true`, the browser won't send cookies on cross-origin requests.

### 2.6 Frontend 401 Handling

The React SPA needs to detect expired/missing sessions and redirect:

```ts
// In the API client (e.g., src/api.ts)

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: 'include' });

  if (res.status === 401) {
    // Session expired or missing — redirect to Member Portal
    window.location.href = process.env.MEMBER_PORTAL_URL
      || 'https://member-portal.up.railway.app';
    return;
  }

  return res;
}
```

Wrap all existing `fetch()` calls through this helper so 401 handling is centralized.

---

## 3. What Is NOT Needed

These items from the CycleScope architecture doc do **not** apply to sub-portals:

| Feature | Why Not Needed |
|---------|---------------|
| `user_id` columns in the database | Sub-portal data is shared across all premium users (same scans, same portfolios). No per-user isolation required. |
| Per-user portfolios or strategies | Portfolios are system-generated from market scans, not user-created. |
| Login form / signup page | All authentication UI lives in the Member Portal. |
| Password hashing (bcrypt) | Sub-portals never see passwords. |
| Patreon OAuth integration | Handled entirely by the Member Portal. |
| Admin roles / RBAC | No user-facing admin features in sub-portals currently. |
| Per-user cron job scoping | Scans and P&L updates are global system operations. |

---

## 4. Cookie Naming Convention

To avoid collisions when sub-portals share a parent domain:

| Sub-Portal | Cookie Name |
|------------|-------------|
| OptionStrategy | `option_strategy_session` |
| SwingTrade | `swingtrade_session` |
| StockScope | `stockscope_session` |
| (future) | `{service_name}_session` |

---

## 5. Security Considerations

- **PREMIUM_TOKEN_SECRET** must be identical across the Member Portal and all sub-portals. Rotate it by updating all services simultaneously.
- **JWT_SECRET** is unique per sub-portal. Compromising one doesn't affect others.
- **httpOnly cookies** prevent JavaScript from reading the session token (mitigates XSS).
- **sameSite: 'lax'** prevents the cookie from being sent on cross-site POST requests (mitigates CSRF).
- **secure: true** in production ensures cookies are only sent over HTTPS.
- **5-minute handoff token** limits the window for token interception during the redirect.

---

## 6. Implementation Checklist

For any sub-portal integrating with CycleScope:

- [ ] Install `jose` and `cookie-parser`
- [ ] Add `PREMIUM_TOKEN_SECRET`, `MEMBER_PORTAL_URL`, `JWT_SECRET` to env
- [ ] Add `GET /auth?token=xxx` token exchange endpoint
- [ ] Add `requireAuth` middleware on all `/api/*` routes (except `/api/health`)
- [ ] Replace open CORS with restricted `origin` + `credentials: true`
- [ ] Add frontend 401 detection → redirect to Member Portal
- [ ] Update `.env.example` with the new variables
- [ ] Test: unauthenticated API calls return 401
- [ ] Test: `/auth?token=valid` sets cookie and redirects to dashboard
- [ ] Test: `/auth?token=expired` redirects to Member Portal
- [ ] Test: authenticated API calls work normally with cookie
