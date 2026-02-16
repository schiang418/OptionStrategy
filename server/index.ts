import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './db/migrate.js';
import { startCronJobs } from './cron.js';
import optionAutomationRoutes from './routes/optionAutomation.js';
import optionScansRoutes from './routes/optionScans.js';
import optionPortfoliosRoutes from './routes/optionPortfolios.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/option-automation', optionAutomationRoutes);
app.use('/api/option-scans', optionScansRoutes);
app.use('/api/option-portfolios', optionPortfoliosRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
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
    });
  } catch (error: any) {
    console.error('[Server] Failed to start:', error.message);
    process.exit(1);
  }
}

start();
