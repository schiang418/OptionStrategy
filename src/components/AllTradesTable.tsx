import React, { useState, useMemo } from 'react';
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

  const SortHeader = ({ label, sortKey, className }: { label: string; sortKey: SortKey; className?: string }) => (
    <th
      onClick={() => handleSort(sortKey)}
      className={`px-3 py-3 text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide
        cursor-pointer hover:text-[#4f8ff7] whitespace-nowrap border-b border-[#2a2e3a] select-none ${className || 'text-left'}`}
    >
      {label}
      {sort.key === sortKey && (sort.dir === 'asc' ? ' \u25B2' : ' \u25BC')}
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
              <SortHeader label="Ticker" sortKey="ticker" />
              <th className="px-3 py-3 text-left text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide border-b border-[#2a2e3a]">
                Portfolio
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide border-b border-[#2a2e3a]">
                Strikes
              </th>
              <SortHeader label="Expiration" sortKey="expirationDate" />
              <th className="px-3 py-3 text-right text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide border-b border-[#2a2e3a]">
                Ctrs
              </th>
              <SortHeader label="Premium" sortKey="premiumCollected" className="text-right" />
              <th className="px-3 py-3 text-right text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide border-b border-[#2a2e3a]">
                Entry
              </th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide border-b border-[#2a2e3a]">
                Current
              </th>
              <SortHeader label="P&L" sortKey="currentPnl" className="text-right" />
              <SortHeader label="Status" sortKey="status" className="text-center" />
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
                  {fmtStrike(t.sellStrike)}/{fmtStrike(t.buyStrike)}
                </td>
                <td className="px-3 py-2">{t.expirationDate}</td>
                <td className="px-3 py-2 text-right">{t.contracts}</td>
                <td className="px-3 py-2 text-right text-green-400">
                  {fmtMoney(t.premiumCollected * t.contracts)}
                </td>
                <td className="px-3 py-2 text-right">
                  {t.stockPriceAtEntry ? fmtMoney(t.stockPriceAtEntry) : '-'}
                </td>
                <td className="px-3 py-2 text-right">
                  {t.currentStockPrice ? fmtMoney(t.currentStockPrice) : '-'}
                </td>
                <td className={`px-3 py-2 text-right font-medium ${pnlColor(t.currentPnl)}`}>
                  {fmtMoney(t.currentPnl)}
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
