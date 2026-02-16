import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, HelpCircle } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  updatePortfolioPnl,
  fetchPortfolioHistory,
  type Portfolio,
  type PortfolioWithTrades,
  type ValueHistoryPoint,
} from '../api';

interface PortfolioCardsProps {
  portfolios: Portfolio[];
  portfolioDetails: Record<number, PortfolioWithTrades>;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return '$0.00';
  const dollars = cents / 100;
  return dollars < 0
    ? `-$${Math.abs(dollars).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMoneyShort(cents: number | null | undefined): string {
  if (cents == null) return '$0';
  const dollars = Math.round(cents / 100);
  return dollars < 0
    ? `-$${Math.abs(dollars).toLocaleString()}`
    : `$${dollars.toLocaleString()}`;
}

function fmtStrike(cents: number): string {
  return (cents / 100).toFixed(0);
}

function pnlColor(val: number | null | undefined): string {
  if (val == null || val === 0) return 'text-gray-300';
  return val > 0 ? 'text-green-400' : 'text-red-400';
}

function statusBadge(status: string) {
  const colors = status === 'active'
    ? 'bg-green-600/20 text-green-400'
    : 'bg-gray-600/20 text-gray-400';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors}`}>
      {status}
    </span>
  );
}

function tradeStatusBadge(status: string) {
  const map: Record<string, string> = {
    open: 'bg-blue-600/20 text-blue-400',
    expired_profit: 'bg-green-600/20 text-green-400',
    expired_loss: 'bg-red-600/20 text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] || 'bg-gray-600/20 text-gray-400'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Formula Tooltip -- shows calculation breakdown like OptionScope
// ---------------------------------------------------------------------------

function FormulaTooltip({
  label,
  formula,
  values,
  result,
}: {
  label: string;
  formula: string;
  values: string;
  result: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="focus:outline-none"
        aria-label={`${label} formula`}
      >
        <HelpCircle className="w-3 h-3 text-[#8b8fa3] cursor-help hover:text-white transition-colors" />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56
          bg-[#242836] border border-[#3a3e4a] rounded-lg p-3 shadow-xl text-xs leading-relaxed">
          <div className="text-[#8b8fa3] mb-1">{label}</div>
          <div className="text-white font-mono">{formula}</div>
          <div className="text-[#8b8fa3] font-mono mt-0.5">{values}</div>
          <div className="text-white font-bold font-mono mt-0.5">= {result}</div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2
            w-2 h-2 bg-[#242836] border-r border-b border-[#3a3e4a] rotate-45" />
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  valueColor,
  tooltipProps,
}: {
  label: string;
  value: string;
  valueColor?: string;
  tooltipProps?: {
    label: string;
    formula: string;
    values: string;
    result: string;
  };
}) {
  return (
    <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-3">
      <div className="flex items-center gap-1 mb-1">
        <div className="text-xs text-[#8b8fa3]">{label}</div>
        {tooltipProps && <FormulaTooltip {...tooltipProps} />}
      </div>
      <div className={`text-sm font-bold ${valueColor || ''}`}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Value Over Time Chart
// ---------------------------------------------------------------------------

function ValueChart({ history }: { history: ValueHistoryPoint[] }) {
  if (history.length < 2) return null;

  const data = history.map(h => ({
    date: h.date,
    value: h.portfolioValue / 100,
  }));

  return (
    <div className="mt-3 mb-1 px-2">
      <div className="text-xs text-[#8b8fa3] mb-2 font-semibold">Portfolio Value Over Time</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3a" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#8b8fa3' }}
            tickFormatter={(d: string) => {
              const parts = d.split('-');
              return `${parts[1]}/${parts[2]}`;
            }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#8b8fa3' }}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            width={50}
          />
          <RechartsTooltip
            contentStyle={{ background: '#242836', border: '1px solid #3a3e4a', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#8b8fa3' }}
            formatter={(value: number) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Value']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: '#6366f1' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portfolio Card
// ---------------------------------------------------------------------------

function PortfolioCard({
  portfolio,
  detail,
  onRefresh,
}: {
  portfolio: Portfolio;
  detail: PortfolioWithTrades | undefined;
  onRefresh: () => void;
}) {
  const trades = detail?.trades || [];
  const typeLabel = portfolio.type === 'top_return' ? 'Top Return' : 'Top Probability';

  // Derived metrics
  const initialCapitalDollars = fmtMoneyShort(portfolio.initialCapital);
  const currentValueDollars = fmtMoneyShort(portfolio.currentValue);
  const netPnlDollars = fmtMoneyShort(portfolio.netPnl);
  const premiumDollars = fmtMoneyShort(portfolio.totalPremiumCollected);

  const roi = portfolio.initialCapital
    ? ((portfolio.netPnl / portfolio.initialCapital) * 100)
    : 0;
  const roiStr = roi.toFixed(2);

  const premiumYield = portfolio.initialCapital
    ? ((portfolio.totalPremiumCollected / portfolio.initialCapital) * 100)
    : 0;
  const premiumYieldStr = premiumYield.toFixed(2);

  const [updating, setUpdating] = useState(false);
  const [history, setHistory] = useState<ValueHistoryPoint[]>([]);

  // Fetch value history for this portfolio's chart
  useEffect(() => {
    fetchPortfolioHistory(portfolio.id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [portfolio.id]);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await updatePortfolioPnl(portfolio.id);
      onRefresh();
    } catch {}
    setUpdating(false);
  };

  const lastUpdatedStr = portfolio.lastUpdated
    ? new Date(portfolio.lastUpdated).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : null;

  return (
    <div className="bg-[#1a1d27] rounded-xl border border-[#2a2e3a] overflow-hidden">
      <div className="p-4 border-b border-[#2a2e3a]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">{typeLabel}</h3>
          <div className="flex items-center gap-2">
            {lastUpdatedStr && (
              <span className="text-[10px] text-[#8b8fa3]">Updated {lastUpdatedStr}</span>
            )}
            {statusBadge(portfolio.status)}
            {portfolio.status === 'active' && (
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="p-1 rounded hover:bg-[#242836] transition-colors disabled:opacity-50"
                title="Update P&L"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#8b8fa3] ${updating ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* 6 Summary Cards -- 3 cols x 2 rows matching OptionScope */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SummaryCard
            label="Initial Capital"
            value={fmtMoney(portfolio.initialCapital)}
            tooltipProps={{
              label: 'Initial Capital',
              formula: 'Sum of max losses across all positions',
              values: `${trades.length} trades × max loss per trade`,
              result: initialCapitalDollars,
            }}
          />
          <SummaryCard
            label="Current Value"
            value={fmtMoney(portfolio.currentValue)}
            valueColor={pnlColor(portfolio.netPnl)}
            tooltipProps={{
              label: 'Current Value',
              formula: 'Initial Capital + Net P&L',
              values: `${initialCapitalDollars} + ${netPnlDollars}`,
              result: currentValueDollars,
            }}
          />
          <SummaryCard
            label="Net Gain/Loss"
            value={fmtMoney(portfolio.netPnl)}
            valueColor={pnlColor(portfolio.netPnl)}
            tooltipProps={{
              label: 'Net Gain/Loss',
              formula: 'Sum of (Premium - Spread Value) × Contracts',
              values: `across ${trades.length} trades`,
              result: netPnlDollars,
            }}
          />
          <SummaryCard
            label="ROI"
            value={`${roiStr}%`}
            valueColor={pnlColor(portfolio.netPnl)}
            tooltipProps={{
              label: 'Return on Investment',
              formula: 'Net P&L / Initial Capital × 100',
              values: `${netPnlDollars} / ${initialCapitalDollars} × 100`,
              result: `${roiStr}%`,
            }}
          />
          <SummaryCard
            label="Total Premium Collected"
            value={fmtMoney(portfolio.totalPremiumCollected)}
            valueColor="text-green-400"
            tooltipProps={{
              label: 'Total Premium Collected',
              formula: 'Sum of premium × contracts for all trades',
              values: `${trades.length} trades, max profit if all expire OTM`,
              result: premiumDollars,
            }}
          />
          <SummaryCard
            label="Premium Yield"
            value={`${premiumYieldStr}%`}
            valueColor="text-green-400"
            tooltipProps={{
              label: 'Premium Yield',
              formula: 'Total Premium / Initial Capital × 100',
              values: `${premiumDollars} / ${initialCapitalDollars} × 100`,
              result: `${premiumYieldStr}%`,
            }}
          />
        </div>
      </div>

      {/* Portfolio Value Over Time Chart */}
      <ValueChart history={history} />

      {/* Holdings Table */}
      {trades.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#2a2e3a]">
                <th className="px-3 py-2 text-left text-xs text-[#8b8fa3] font-semibold">Ticker</th>
                <th className="px-3 py-2 text-right text-xs text-[#8b8fa3] font-semibold"
                    title="Stock price at time of entry">Stock Price</th>
                <th className="px-3 py-2 text-left text-xs text-[#8b8fa3] font-semibold"
                    title="Sell strike / Buy strike for the put credit spread">Sell / Buy Strike</th>
                <th className="px-3 py-2 text-left text-xs text-[#8b8fa3] font-semibold">Expiration</th>
                <th className="px-3 py-2 text-right text-xs text-[#8b8fa3] font-semibold"
                    title="Number of contracts for this trade">Contracts</th>
                <th className="px-3 py-2 text-right text-xs text-[#8b8fa3] font-semibold"
                    title="Credit received from selling the spread (total, all contracts)">Premium</th>
                <th className="px-3 py-2 text-right text-xs text-[#8b8fa3] font-semibold"
                    title="Current market value of the spread (total, all contracts). Lower is better.">Spread Value</th>
                <th className="px-3 py-2 text-right text-xs text-[#8b8fa3] font-semibold"
                    title="Current profit or loss: (Premium - Spread Value) × Contracts">P&L</th>
                <th className="px-3 py-2 text-center text-xs text-[#8b8fa3] font-semibold"
                    title="Trade status: open, expired_profit, or expired_loss">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-[#2a2e3a]/50 hover:bg-[#242836] ${
                    t.isItm ? 'bg-yellow-900/10' : ''
                  }`}
                >
                  <td className="px-3 py-1.5 font-bold font-mono">
                    {t.ticker}
                    {t.isItm && (
                      <span className="ml-1 text-yellow-400 text-[10px]">ITM</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-[#8b8fa3]">
                    {t.stockPriceAtEntry != null ? fmtMoney(t.stockPriceAtEntry) : '-'}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[#8b8fa3]">
                    {fmtStrike(t.sellStrike)} / {fmtStrike(t.buyStrike)}
                  </td>
                  <td className="px-3 py-1.5">{t.expirationDate}</td>
                  <td className="px-3 py-1.5 text-right">{t.contracts}</td>
                  <td className="px-3 py-1.5 text-right text-green-400">
                    {fmtMoney(t.premiumCollected * t.contracts)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {t.currentSpreadValue != null
                      ? fmtMoney(t.currentSpreadValue * t.contracts)
                      : '-'}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-medium ${pnlColor(t.currentPnl)}`}>
                    {fmtMoney(t.currentPnl)}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {tradeStatusBadge(t.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PortfolioCards({ portfolios, portfolioDetails, onRefresh }: PortfolioCardsProps) {
  if (portfolios.length === 0) {
    return (
      <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-6 text-center mb-6">
        <p className="text-[#8b8fa3]">
          No portfolios for this scan date. Portfolios are created automatically when a scan runs.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {portfolios.map((p) => (
        <PortfolioCard
          key={p.id}
          portfolio={p}
          detail={portfolioDetails[p.id]}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}
