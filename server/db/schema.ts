import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  date,
  pgEnum,
  boolean,
} from 'drizzle-orm/pg-core';

// Custom enum types (matching OptionScope patterns)
export const optionPortfolioTypeEnum = pgEnum('option_portfolio_type', [
  'top_return',
  'top_probability',
]);

export const optionPortfolioStatusEnum = pgEnum('option_portfolio_status', [
  'active',
  'closed',
]);

export const optionTradeStatusEnum = pgEnum('option_trade_status', [
  'open',
  'expired_profit',
  'expired_loss',
]);

// Raw scan data from Option Samurai
// Monetary values stored as integers (cents) to avoid floating-point issues
// Percentages stored as basis points (×10000) — e.g., 13.57% → 1357
export const optionScanResults = pgTable('option_scan_results', {
  id: serial('id').primaryKey(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  companyName: varchar('company_name', { length: 255 }),
  price: integer('price'), // cents (stock price × 100)
  priceChange: integer('price_change'), // cents
  ivRank: integer('iv_rank'), // basis points (×10000)
  ivPercentile: integer('iv_percentile'), // basis points
  strike: varchar('strike', { length: 50 }), // "385/380" string
  moneyness: integer('moneyness'), // basis points
  expDate: date('exp_date'),
  daysToExp: integer('days_to_exp'),
  totalOptVol: integer('total_opt_vol'),
  probMaxProfit: integer('prob_max_profit'), // basis points (e.g. 8131 = 81.31%)
  maxProfit: integer('max_profit'), // cents per contract
  maxLoss: integer('max_loss'), // cents per contract
  returnPercent: integer('return_percent'), // basis points (e.g. 1357 = 13.57%)
  scanName: varchar('scan_name', { length: 255 }).notNull(),
  scanDate: date('scan_date').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Portfolios — two per scan (top_return, top_probability)
export const optionPortfolios = pgTable('option_portfolios', {
  id: serial('id').primaryKey(),
  type: optionPortfolioTypeEnum('type').notNull(),
  scanDate: date('scan_date').notNull(),
  scanName: varchar('scan_name', { length: 255 }).default('bi-weekly income all').notNull(),
  status: optionPortfolioStatusEnum('status').default('active').notNull(),
  initialCapital: integer('initial_capital').default(10000000).notNull(), // cents ($100,000)
  totalPremiumCollected: integer('total_premium_collected').default(0).notNull(), // cents
  currentValue: integer('current_value').default(10000000).notNull(), // cents
  netPnl: integer('net_pnl').default(0).notNull(), // cents (can be negative)
  lastUpdated: timestamp('last_updated').defaultNow(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Individual spreads in each portfolio
export const optionPortfolioTrades = pgTable('option_portfolio_trades', {
  id: serial('id').primaryKey(),
  portfolioId: integer('portfolio_id')
    .references(() => optionPortfolios.id, { onDelete: 'cascade' })
    .notNull(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  stockPriceAtEntry: integer('stock_price_at_entry'), // cents
  sellStrike: integer('sell_strike').notNull(), // dollars × 100 (cents)
  buyStrike: integer('buy_strike').notNull(), // dollars × 100 (cents)
  expirationDate: date('expiration_date').notNull(),
  contracts: integer('contracts').default(4).notNull(),
  premiumCollected: integer('premium_collected').default(0).notNull(), // cents per contract
  spreadWidth: integer('spread_width').notNull(), // (sell - buy) × 100 in cents
  maxLossPerContract: integer('max_loss_per_contract').notNull(), // cents
  currentSpreadValue: integer('current_spread_value').default(0), // cents per contract
  currentStockPrice: integer('current_stock_price'), // cents
  currentPnl: integer('current_pnl').default(0), // cents (total, all contracts)
  status: optionTradeStatusEnum('status').default('open').notNull(),
  isItm: boolean('is_itm').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Daily snapshots for charting
export const optionPortfolioValueHistory = pgTable('option_portfolio_value_history', {
  id: serial('id').primaryKey(),
  portfolioId: integer('portfolio_id')
    .references(() => optionPortfolios.id, { onDelete: 'cascade' })
    .notNull(),
  date: date('date').notNull(),
  portfolioValue: integer('portfolio_value').notNull(), // cents
  netPnl: integer('net_pnl').notNull(), // cents
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Type exports
export type OptionScanResult = typeof optionScanResults.$inferSelect;
export type NewOptionScanResult = typeof optionScanResults.$inferInsert;
export type OptionPortfolio = typeof optionPortfolios.$inferSelect;
export type NewOptionPortfolio = typeof optionPortfolios.$inferInsert;
export type OptionPortfolioTrade = typeof optionPortfolioTrades.$inferSelect;
export type NewOptionPortfolioTrade = typeof optionPortfolioTrades.$inferInsert;
export type OptionPortfolioValueHistory = typeof optionPortfolioValueHistory.$inferSelect;
