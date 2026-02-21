import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './db/migrate.js';
import { startCronJobs } from './cron.js';
import { handleAuthCallback, requireAuth } from './auth.js';
import optionAutomationRoutes from './routes/optionAutomation.js';
import optionScansRoutes from './routes/optionScans.js';
import optionPortfoliosRoutes from './routes/optionPortfolios.js';

// ── Auth env var validation ──
// In production, auth secrets are required. In development, auth is optional
// so the app can run locally without portal integration.
const AUTH_ENV_VARS = ['PREMIUM_TOKEN_SECRET', 'JWT_SECRET', 'MEMBER_PORTAL_URL'];
const authEnabled = AUTH_ENV_VARS.every((v) => !!process.env[v]);

if (process.env.NODE_ENV === 'production' && !authEnabled) {
  const missing = AUTH_ENV_VARS.filter((v) => !process.env[v]);
  throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
}

if (!authEnabled) {
  console.warn('[Server] Auth env vars not set — running WITHOUT authentication (dev mode)');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

// ── Middleware ──

// 1. CORS — restricted to portal origin in production, open in dev
if (authEnabled) {
  app.use(cors({
    origin: process.env.MEMBER_PORTAL_URL,
    credentials: true,
  }));
} else {
  app.use(cors());
}

// 2. Cookie parser (before auth middleware)
app.use(cookieParser());

// 3. JSON body parser
app.use(express.json());

// ── Auth handoff endpoint (no auth required) ──
if (authEnabled) {
  app.get('/auth/handoff', handleAuthCallback);
}

// ── Health check (no auth required) ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Auth middleware (protects all /api/* routes below) ──
if (authEnabled) {
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    return requireAuth(req, res, next);
  });
}

// ── Protected API routes ──
app.use('/api/option-automation', optionAutomationRoutes);
app.use('/api/option-scans', optionScansRoutes);
app.use('/api/option-portfolios', optionPortfoliosRoutes);

// ── Serve static files in production ──
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.resolve(__dirname, '../public');
  app.use(express.static(publicPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

async function start() {
  try {
    // Run database migrations
    if (process.env.DATABASE_URL) {
      await runMigrations();
    } else {
      console.warn('[Server] No DATABASE_URL set, skipping migrations');
    }

    // Start cron jobs
    startCronJobs();

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Running on port ${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[Server] Auth: ${authEnabled ? 'ENABLED' : 'DISABLED (dev mode)'}`);
    });
  } catch (error: any) {
    console.error('[Server] Failed to start:', error.message);
    process.exit(1);
  }
}

start();
