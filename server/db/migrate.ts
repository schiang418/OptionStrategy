import { pool } from './index.js';

/**
 * Run database migrations to create tables and enum types.
 * All monetary values are stored as INTEGER (cents).
 * All percentages are stored as INTEGER (basis points × 10000).
 */
export async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('[DB] Running migrations...');

    // Create enum types (IF NOT EXISTS requires PG 9.1+)
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE option_portfolio_type AS ENUM ('top_return', 'top_probability');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE option_portfolio_status AS ENUM ('active', 'closed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE option_trade_status AS ENUM ('open', 'expired_profit', 'expired_loss');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create tables — all monetary columns are INTEGER (cents), percentages are INTEGER (basis points)
    await client.query(`
      CREATE TABLE IF NOT EXISTS option_scan_results (
        id SERIAL PRIMARY KEY,
        ticker VARCHAR(20) NOT NULL,
        company_name VARCHAR(255),
        price INTEGER,
        price_change INTEGER,
        iv_rank INTEGER,
        iv_percentile INTEGER,
        strike VARCHAR(50),
        moneyness INTEGER,
        exp_date DATE,
        days_to_exp INTEGER,
        total_opt_vol INTEGER,
        prob_max_profit INTEGER,
        max_profit INTEGER,
        max_loss INTEGER,
        return_percent INTEGER,
        scan_name VARCHAR(255) NOT NULL,
        scan_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS option_portfolios (
        id SERIAL PRIMARY KEY,
        type option_portfolio_type NOT NULL,
        scan_date DATE NOT NULL,
        scan_name VARCHAR(255) DEFAULT 'bi-weekly income all' NOT NULL,
        status option_portfolio_status DEFAULT 'active' NOT NULL,
        initial_capital INTEGER DEFAULT 10000000 NOT NULL,
        total_premium_collected INTEGER DEFAULT 0 NOT NULL,
        current_value INTEGER DEFAULT 10000000 NOT NULL,
        net_pnl INTEGER DEFAULT 0 NOT NULL,
        last_updated TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS option_portfolio_trades (
        id SERIAL PRIMARY KEY,
        portfolio_id INTEGER NOT NULL REFERENCES option_portfolios(id) ON DELETE CASCADE,
        ticker VARCHAR(20) NOT NULL,
        stock_price_at_entry INTEGER,
        sell_strike INTEGER NOT NULL,
        buy_strike INTEGER NOT NULL,
        expiration_date DATE NOT NULL,
        contracts INTEGER DEFAULT 4 NOT NULL,
        premium_collected INTEGER DEFAULT 0 NOT NULL,
        spread_width INTEGER NOT NULL,
        max_loss_per_contract INTEGER NOT NULL,
        current_spread_value INTEGER DEFAULT 0,
        current_stock_price INTEGER,
        current_pnl INTEGER DEFAULT 0,
        status option_trade_status DEFAULT 'open' NOT NULL,
        is_itm BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS option_portfolio_value_history (
        id SERIAL PRIMARY KEY,
        portfolio_id INTEGER NOT NULL REFERENCES option_portfolios(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        portfolio_value INTEGER NOT NULL,
        net_pnl INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scan_results_date ON option_scan_results(scan_date);
      CREATE INDEX IF NOT EXISTS idx_scan_results_name_date ON option_scan_results(scan_name, scan_date);
      CREATE INDEX IF NOT EXISTS idx_portfolios_scan_date ON option_portfolios(scan_date);
      CREATE INDEX IF NOT EXISTS idx_portfolios_status ON option_portfolios(status);
      CREATE INDEX IF NOT EXISTS idx_trades_portfolio ON option_portfolio_trades(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_trades_status ON option_portfolio_trades(status);
      CREATE INDEX IF NOT EXISTS idx_history_portfolio ON option_portfolio_value_history(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_history_date ON option_portfolio_value_history(date);
    `);

    console.log('[DB] Migrations complete');
  } catch (error: any) {
    console.error('[DB] Migration error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}
