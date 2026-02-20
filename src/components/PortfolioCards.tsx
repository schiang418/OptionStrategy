import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
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
    ? 'bg-green-600/20 text-green-400 animate-pulse-slow'
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
// Formula Tooltip -- shows actual calculation breakdown on hover
// ---------------------------------------------------------------------------

interface TradeBreakdownLine {
  ticker: string;
  value: string;
}

interface FormulaTooltipProps {
  /** Tooltip title */
  title: string;
  /** Description of the formula */
  formulaDesc: string;
  /** Per-trade breakdown lines (ticker + value) */
  breakdown?: TradeBreakdownLine[];
  /** Final result line */
  result: string;
  /** Raw formula at the bottom */
  formulaRaw?: string;
}

function FormulaTooltip({ title, formulaDesc, breakdown, result, formulaRaw }: FormulaTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.top + window.scrollY,
      left: rect.left + rect.width / 2 + window.scrollX,
    });
  }, []);

  const showTip = () => {
    clearTimeout(timeoutRef.current);
    updatePos();
    setOpen(true);
  };
  const hideTip = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  // Clamp tooltip horizontally so it never overflows the viewport
  useLayoutEffect(() => {
    if (open && tooltipRef.current && pos) {
      const el = tooltipRef.current;
      const rect = el.getBoundingClientRect();
      const pad = 8;
      if (rect.left < pad) {
        el.style.left = `${pos.left + (pad - rect.left)}px`;
      } else if (rect.right > window.innerWidth - pad) {
        el.style.left = `${pos.left - (rect.right - (window.innerWidth - pad))}px`;
      }
    }
  }, [open, pos]);

  const tooltip = open && pos ? ReactDOM.createPortal(
    <div
      ref={tooltipRef}
      style={{ position: 'absolute', top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)', marginTop: -8 }}
      className="z-[9999] bg-[#242836] border border-[#3a3e4a] rounded-lg p-3 shadow-xl text-xs leading-relaxed
        min-w-[240px] max-w-[320px]"
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
    >
      <div className="text-white font-semibold mb-1">{title}</div>
      <div className="text-[#8b8fa3] mb-1.5">{formulaDesc}</div>

      {breakdown && breakdown.length > 0 && (
        <div className="font-mono text-[11px] space-y-0.5 mb-1.5">
          {breakdown.map((b, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className="text-[#8b8fa3]">{b.ticker}:</span>
              <span className={
                b.value.startsWith('+') ? 'text-green-400' :
                b.value.startsWith('-') ? 'text-red-400' : 'text-white'
              }>{b.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-[#3a3e4a] pt-1.5 mt-1">
        <div className="flex items-center justify-between font-mono font-bold">
          <span className="text-[#8b8fa3]">Total:</span>
          <span className={
            result.startsWith('+') ? 'text-green-400' :
            result.startsWith('-') ? 'text-red-400' : 'text-white'
          }>{result}</span>
        </div>
      </div>

      {formulaRaw && (
        <div className="text-[10px] text-[#666b7a] font-mono mt-1.5 italic">
          {formulaRaw}
        </div>
      )}

      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2
        w-2 h-2 bg-[#242836] border-r border-b border-[#3a3e4a] rotate-45" />
    </div>,
    document.body,
  ) : null;

  return (
    <span
      ref={triggerRef}
      className="inline-block"
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
    >
      <HelpCircle className="w-3 h-3 text-[#8b8fa3] cursor-help hover:text-white transition-colors" />
      {tooltip}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cell Tooltip -- shows calculation on hover for individual table values
// ---------------------------------------------------------------------------

function CellTooltip({
  children,
  lines,
}: {
  children: React.ReactNode;
  lines: string[];
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cellTooltipRef = useRef<HTMLDivElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout>>();

  const onEnter = () => {
    clearTimeout(timeout.current);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.top + window.scrollY,
        left: rect.left + rect.width / 2 + window.scrollX,
      });
    }
    timeout.current = setTimeout(() => setShow(true), 300);
  };
  const onLeave = () => {
    clearTimeout(timeout.current);
    setShow(false);
  };

  useEffect(() => () => clearTimeout(timeout.current), []);

  // Clamp tooltip horizontally so it never overflows the viewport
  useLayoutEffect(() => {
    if (show && cellTooltipRef.current && pos) {
      const el = cellTooltipRef.current;
      const rect = el.getBoundingClientRect();
      const pad = 8;
      if (rect.left < pad) {
        el.style.left = `${pos.left + (pad - rect.left)}px`;
      } else if (rect.right > window.innerWidth - pad) {
        el.style.left = `${pos.left - (rect.right - (window.innerWidth - pad))}px`;
      }
    }
  }, [show, pos]);

  const tooltip = show && pos ? ReactDOM.createPortal(
    <div
      ref={cellTooltipRef}
      style={{ position: 'absolute', top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)', marginTop: -8 }}
      className="z-[9999] bg-[#242836] border border-[#3a3e4a] rounded-lg px-3 py-2 shadow-xl
        text-[11px] font-mono leading-relaxed whitespace-nowrap pointer-events-none"
    >
      {lines.map((l, i) => (
        <div key={i} className={i === lines.length - 1 ? 'text-white font-bold border-t border-[#3a3e4a] pt-1 mt-1' : 'text-[#8b8fa3]'}>
          {l}
        </div>
      ))}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2
        w-2 h-2 bg-[#242836] border-r border-b border-[#3a3e4a] rotate-45" />
    </div>,
    document.body,
  ) : null;

  return (
    <span
      ref={triggerRef}
      className="cursor-default"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {children}
      {tooltip}
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
  tooltipProps?: FormulaTooltipProps;
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
    <div className="bg-[#1a1d27] rounded-xl border border-[#2a2e3a]">
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
              title: 'Initial Capital',
              formulaDesc: 'Sum of max loss (capital at risk) across all trades:',
              breakdown: trades.map((t) => ({
                ticker: t.ticker,
                value: fmtMoneyShort(t.maxLossPerContract * t.contracts),
              })),
              result: initialCapitalDollars,
              formulaRaw: 'maxLoss = (sellStrike − buyStrike) × 100 × contracts',
            }}
          />
          <SummaryCard
            label="Current Value"
            value={fmtMoney(portfolio.currentValue)}
            valueColor={pnlColor(portfolio.netPnl)}
            tooltipProps={{
              title: 'Current Value',
              formulaDesc: 'Initial Capital + Net P&L:',
              breakdown: [
                { ticker: 'Initial Capital', value: initialCapitalDollars },
                { ticker: 'Net P&L', value: (portfolio.netPnl >= 0 ? '+' : '') + netPnlDollars },
              ],
              result: currentValueDollars,
              formulaRaw: 'currentValue = initialCapital + netPnl',
            }}
          />
          <SummaryCard
            label="Net Gain/Loss"
            value={fmtMoney(portfolio.netPnl)}
            valueColor={pnlColor(portfolio.netPnl)}
            tooltipProps={{
              title: 'Net Gain/Loss',
              formulaDesc: 'Sum of P&L across all trades:',
              breakdown: trades.map((t) => ({
                ticker: t.ticker,
                value: t.currentPnl != null
                  ? (t.currentPnl >= 0 ? '+' : '') + fmtMoneyShort(t.currentPnl)
                  : '$0',
              })),
              result: (portfolio.netPnl >= 0 ? '+' : '') + netPnlDollars,
              formulaRaw: 'pnl = (premium − spreadValue) × contracts',
            }}
          />
          <SummaryCard
            label="ROI"
            value={`${roiStr}%`}
            valueColor={pnlColor(portfolio.netPnl)}
            tooltipProps={{
              title: 'Return on Investment',
              formulaDesc: 'Net P&L / Initial Capital × 100:',
              breakdown: [
                { ticker: 'Net P&L', value: (portfolio.netPnl >= 0 ? '+' : '') + netPnlDollars },
                { ticker: 'Initial Capital', value: initialCapitalDollars },
              ],
              result: `${roiStr}%`,
              formulaRaw: 'ROI = netPnl / initialCapital × 100',
            }}
          />
          <SummaryCard
            label="Total Premium Collected"
            value={fmtMoney(portfolio.totalPremiumCollected)}
            valueColor="text-green-400"
            tooltipProps={{
              title: 'Total Premium Collected',
              formulaDesc: 'Sum of credit received across all trades:',
              breakdown: trades.map((t) => ({
                ticker: t.ticker,
                value: '+' + fmtMoneyShort(t.premiumCollected * t.contracts),
              })),
              result: '+' + premiumDollars,
              formulaRaw: 'premium = creditReceived × contracts',
            }}
          />
          <SummaryCard
            label="Premium Yield"
            value={`${premiumYieldStr}%`}
            valueColor="text-green-400"
            tooltipProps={{
              title: 'Premium Yield',
              formulaDesc: 'Total Premium / Initial Capital × 100:',
              breakdown: [
                { ticker: 'Total Premium', value: '+' + premiumDollars },
                { ticker: 'Initial Capital', value: initialCapitalDollars },
              ],
              result: `${premiumYieldStr}%`,
              formulaRaw: 'yield = totalPremium / initialCapital × 100',
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
                    title="Current stock price (entry price in parentheses)">Stock Price</th>
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
                    {t.currentStockPrice != null && t.currentStockPrice > 0
                      ? fmtMoney(t.currentStockPrice)
                      : t.stockPriceAtEntry != null ? fmtMoney(t.stockPriceAtEntry) : '-'}
                    {t.stockPriceAtEntry != null && t.currentStockPrice != null && t.currentStockPrice > 0 && t.currentStockPrice !== t.stockPriceAtEntry && (
                      <span className="text-[10px] text-[#5a5e6e] ml-1">({fmtMoney(t.stockPriceAtEntry)})</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[#8b8fa3]">
                    {fmtStrike(t.sellStrike)} / {fmtStrike(t.buyStrike)}
                  </td>
                  <td className="px-3 py-1.5">{t.expirationDate}</td>
                  <td className="px-3 py-1.5 text-right">{t.contracts}</td>
                  <td className="px-3 py-1.5 text-right text-green-400">
                    <CellTooltip lines={[
                      `Premium per contract: ${fmtMoney(t.premiumCollected)}`,
                      `Contracts: ${t.contracts}`,
                      `= ${fmtMoney(t.premiumCollected)} × ${t.contracts} = ${fmtMoney(t.premiumCollected * t.contracts)}`,
                    ]}>
                      {fmtMoney(t.premiumCollected * t.contracts)}
                    </CellTooltip>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {t.currentSpreadValue != null ? (
                      <CellTooltip lines={[
                        `Spread value per contract: ${fmtMoney(t.currentSpreadValue)}`,
                        `Contracts: ${t.contracts}`,
                        `= ${fmtMoney(t.currentSpreadValue)} × ${t.contracts} = ${fmtMoney(t.currentSpreadValue * t.contracts)}`,
                      ]}>
                        {fmtMoney(t.currentSpreadValue * t.contracts)}
                      </CellTooltip>
                    ) : '-'}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-medium ${pnlColor(t.currentPnl)}`}>
                    <CellTooltip lines={[
                      `Premium: ${fmtMoney(t.premiumCollected)} per contract`,
                      `Spread value: ${t.currentSpreadValue != null ? fmtMoney(t.currentSpreadValue) : 'N/A'} per contract`,
                      `Contracts: ${t.contracts}`,
                      `= (${fmtMoney(t.premiumCollected)} − ${t.currentSpreadValue != null ? fmtMoney(t.currentSpreadValue) : '?'}) × ${t.contracts} = ${fmtMoney(t.currentPnl)}`,
                    ]}>
                      {fmtMoney(t.currentPnl)}
                    </CellTooltip>
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
