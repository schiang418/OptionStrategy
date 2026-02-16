import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { Trade } from '../api';

interface AllTradesTableProps {
  trades: Trade[];
}

type SortKey = 'ticker' | 'expirationDate' | 'currentPnl' | 'status' | 'premiumCollected';

function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return '$0.00';
  const dollars = cents / 100;
  return dollars < 0
    ? `-$${Math.abs(dollars).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtStrike(cents: number): string {
  return (cents / 100).toFixed(0);
}

function pnlColor(val: number | null | undefined): string {
  if (val == null || val === 0) return 'text-gray-300';
  return val > 0 ? 'text-green-400' : 'text-red-400';
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

  const tooltip = show && pos ? ReactDOM.createPortal(
    <div
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

export default function AllTradesTable({ trades }: AllTradesTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'expirationDate',
    dir: 'desc',
  });
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTicker, setFilterTicker] = useState('');

  const filtered = useMemo(() => {
    let list = [...trades];
    if (filterStatus !== 'all') {
      list = list.filter(t => t.status === filterStatus);
    }
    if (filterTicker) {
      const q = filterTicker.toLowerCase();
      list = list.filter(t => t.ticker.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let va = (a as any)[sort.key] ?? '';
      let vb = (b as any)[sort.key] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sort.dir === 'asc' ? -1 : 1;
      if (va > vb) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [trades, sort, filterStatus, filterTicker]);

  const handleSort = (key: SortKey) => {
    if (sort.key === key) {
      setSort({ key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ key, dir: key === 'ticker' ? 'asc' : 'desc' });
    }
  };

  const SortHeader = ({ label, sortKey, tooltip, className }: { label: string; sortKey: SortKey; tooltip?: string; className?: string }) => (
    <th
      onClick={() => handleSort(sortKey)}
      title={tooltip}
      className={`px-3 py-3 text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide
        cursor-pointer hover:text-[#4f8ff7] whitespace-nowrap border-b border-[#2a2e3a] select-none ${className || 'text-left'}`}
    >
      {label}
      {sort.key === sortKey && (sort.dir === 'asc' ? ' ▲' : ' ▼')}
      {tooltip && <span className="ml-1 text-[10px] opacity-40">ⓘ</span>}
    </th>
  );

  if (trades.length === 0) {
    return (
      <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-6 text-center">
        <p className="text-[#8b8fa3]">No trades yet. Run a scan to create portfolios with trades.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <input
          type="text"
          placeholder="Filter by ticker..."
          value={filterTicker}
          onChange={(e) => setFilterTicker(e.target.value)}
          className="bg-[#1a1d27] border border-[#2a2e3a] rounded-lg px-3 py-2 text-sm w-48
            focus:outline-none focus:border-[#4f8ff7]"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[#1a1d27] border border-[#2a2e3a] rounded-lg px-3 py-2 text-sm
            focus:outline-none focus:border-[#4f8ff7]"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="expired_profit">Expired Profit</option>
          <option value="expired_loss">Expired Loss</option>
        </select>
        <span className="text-sm text-[#8b8fa3]">{filtered.length} trades</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#2a2e3a]">
        <table className="w-full text-[13px] border-collapse">
          <thead className="bg-[#1a1d27] sticky top-0 z-10">
            <tr>
              <SortHeader label="Ticker" sortKey="ticker" tooltip="Stock ticker symbol for this trade" />
              <th
                title="Which portfolio this trade belongs to (Top Return or Top Probability) and its scan date"
                className="px-3 py-3 text-left text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide border-b border-[#2a2e3a] cursor-help"
              >
                Portfolio <span className="ml-1 text-[10px] opacity-40">ⓘ</span>
              </th>
              <th
                title="Put credit spread strike prices: Sell (higher) / Buy (lower). The difference is the spread width."
                className="px-3 py-3 text-left text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide border-b border-[#2a2e3a] cursor-help"
              >
                Strikes <span className="ml-1 text-[10px] opacity-40">ⓘ</span>
              </th>
              <SortHeader label="Expiration" sortKey="expirationDate" tooltip="Options expiration date. After this date the trade settles as profit or loss." />
              <th
                title="Number of spread contracts for this trade. Each contract represents 100 shares."
                className="px-3 py-3 text-right text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide border-b border-[#2a2e3a] cursor-help"
              >
                Ctrs <span className="ml-1 text-[10px] opacity-40">ⓘ</span>
              </th>
              <SortHeader label="Premium" sortKey="premiumCollected" className="text-right" tooltip="Total credit received from selling the spread (premium per contract × number of contracts)" />
              <th
                title="Stock price at the time this trade was opened"
                className="px-3 py-3 text-right text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide border-b border-[#2a2e3a] cursor-help"
              >
                Entry <span className="ml-1 text-[10px] opacity-40">ⓘ</span>
              </th>
              <th
                title="Current stock price. Compare with entry price to see underlying stock movement."
                className="px-3 py-3 text-right text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide border-b border-[#2a2e3a] cursor-help"
              >
                Current <span className="ml-1 text-[10px] opacity-40">ⓘ</span>
              </th>
              <SortHeader label="P&L" sortKey="currentPnl" className="text-right" tooltip="Current profit or loss: (Premium Collected − Current Spread Value) × Contracts" />
              <SortHeader label="Status" sortKey="status" className="text-center" tooltip="Trade status: Open (active), Expired Profit (expired worthless for buyer), or Expired Loss (assigned)" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr
                key={`${t.id}-${t.portfolioId}`}
                className={`hover:bg-[#242836] transition-colors border-b border-[#2a2e3a]/50 ${
                  t.isItm ? 'bg-yellow-900/10' : ''
                }`}
              >
                <td className="px-3 py-2 font-bold font-mono">
                  {t.ticker}
                  {t.isItm && (
                    <span className="ml-1 text-yellow-400 text-[10px]">ITM</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[#8b8fa3] text-xs">
                  {t.portfolioType === 'top_return' ? 'Return' : 'Prob'}
                  <br />
                  {t.portfolioScanDate}
                </td>
                <td className="px-3 py-2 font-mono text-[#8b8fa3]">
                  <CellTooltip lines={[
                    `Sell strike: ${fmtStrike(t.sellStrike)}`,
                    `Buy strike: ${fmtStrike(t.buyStrike)}`,
                    `Spread width: ${fmtMoney(t.spreadWidth)} per contract`,
                  ]}>
                    {fmtStrike(t.sellStrike)}/{fmtStrike(t.buyStrike)}
                  </CellTooltip>
                </td>
                <td className="px-3 py-2">{t.expirationDate}</td>
                <td className="px-3 py-2 text-right">{t.contracts}</td>
                <td className="px-3 py-2 text-right text-green-400">
                  <CellTooltip lines={[
                    `Premium per contract: ${fmtMoney(t.premiumCollected)}`,
                    `Contracts: ${t.contracts}`,
                    `= ${fmtMoney(t.premiumCollected)} × ${t.contracts} = ${fmtMoney(t.premiumCollected * t.contracts)}`,
                  ]}>
                    {fmtMoney(t.premiumCollected * t.contracts)}
                  </CellTooltip>
                </td>
                <td className="px-3 py-2 text-right">
                  {t.stockPriceAtEntry ? fmtMoney(t.stockPriceAtEntry) : '-'}
                </td>
                <td className="px-3 py-2 text-right">
                  {t.currentStockPrice ? (
                    <CellTooltip lines={[
                      `Entry price: ${t.stockPriceAtEntry ? fmtMoney(t.stockPriceAtEntry) : 'N/A'}`,
                      `Current price: ${fmtMoney(t.currentStockPrice)}`,
                      t.stockPriceAtEntry
                        ? `= Change: ${fmtMoney(t.currentStockPrice - t.stockPriceAtEntry)} (${(((t.currentStockPrice - t.stockPriceAtEntry) / t.stockPriceAtEntry) * 100).toFixed(1)}%)`
                        : '= Change: N/A',
                    ]}>
                      {fmtMoney(t.currentStockPrice)}
                    </CellTooltip>
                  ) : '-'}
                </td>
                <td className={`px-3 py-2 text-right font-medium ${pnlColor(t.currentPnl)}`}>
                  <CellTooltip lines={[
                    `Premium: ${fmtMoney(t.premiumCollected)} per contract`,
                    `Spread value: ${t.currentSpreadValue != null ? fmtMoney(t.currentSpreadValue) : 'N/A'} per contract`,
                    `Contracts: ${t.contracts}`,
                    `= (${fmtMoney(t.premiumCollected)} − ${t.currentSpreadValue != null ? fmtMoney(t.currentSpreadValue) : '?'}) × ${t.contracts} = ${fmtMoney(t.currentPnl)}`,
                  ]}>
                    {fmtMoney(t.currentPnl)}
                  </CellTooltip>
                </td>
                <td className="px-3 py-2 text-center">{tradeStatusBadge(t.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
