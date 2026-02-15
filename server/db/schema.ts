import {
  pgTable,
  serial,
  varchar,
  integer,
  real,
  timestamp,
  date,
  pgEnum,
  text,
} from 'drizzle-orm/pg-core';

// Custom enum types
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
export const optionScanResults = pgTable('option_scan_results', {
  id: serial('id').primaryKey(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  companyName: varchar('company_name', { length: 255 }),
  price: real('price'),
  priceChange: real('price_change'),
  ivRank: real('iv_rank'),
  ivPercentile: real('iv_percentile'),
  strike: varchar('strike', { length: 50 }), // "385/380" format
  moneyness: real('moneyness'),
  expDate: date('exp_date'),
  daysToExp: integer('days_to_exp'),
  totalOptVol: integer('total_opt_vol'),
  probMaxProfit: real('prob_max_profit'),
  maxProfit: real('max_profit'),
  maxLoss: real('max_loss'),
  returnPercent: real('return_percent'),
  scanName: varchar('scan_name', { length: 255 }).notNull(),
  scanDate: date('scan_date').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Portfolios - two per scan (top_return, top_probability)
export const optionPortfolios = pgTable('option_portfolios', {
  id: serial('id').primaryKey(),
  type: optionPortfolioTypeEnum('type').notNull(),
  scanDate: date('scan_date').notNull(),
  scanName: varchar('scan_name', { length: 255 }).default('bi-weekly income all').notNull(),
  status: optionPortfolioStatusEnum('status').default('active').notNull(),
  initialCapital: real('initial_capital').default(100000).notNull(),
  totalPremiumCollected: real('total_premium_collected').default(0).notNull(),
  currentValue: real('current_value').default(100000).notNull(),
  netPnl: real('net_pnl').default(0).notNull(),
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
  stockPriceAtEntry: real('stock_price_at_entry'),
  sellStrike: real('sell_strike').notNull(),
  buyStrike: real('buy_strike').notNull(),
  expirationDate: date('expiration_date').notNull(),
  contracts: integer('contracts').default(4).notNull(),
  premiumCollected: real('premium_collected').default(0).notNull(),
  spreadWidth: real('spread_width').notNull(),
  maxLossPerContract: real('max_loss_per_contract').notNull(),
  currentSpreadValue: real('current_spread_value').default(0),
  currentStockPrice: real('current_stock_price'),
  currentPnl: real('current_pnl').default(0),
  status: optionTradeStatusEnum('status').default('open').notNull(),
  isItm: integer('is_itm').default(0), // 0 = false, 1 = true
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
  portfolioValue: real('portfolio_value').notNull(),
  netPnl: real('net_pnl').notNull(),
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
