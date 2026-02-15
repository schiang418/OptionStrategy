import React, { useState, useMemo } from 'react';

interface AllTradesTableProps {
  trades: any[];
}

type SortField = 'ticker' | 'expirationDate' | 'currentPnl' | 'status' | 'premiumCollected';
type SortDir = 'asc' | 'desc';

function formatMoney(val: number | null | undefined): string {
  if (val == null) return '$0.00';
  return val < 0 ? `-$${Math.abs(val).toFixed(2)}` : `$${val.toFixed(2)}`;
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
      {status.replace('_', ' ')}
    </span>
  );
}

export default function AllTradesTable({ trades }: AllTradesTableProps) {
  const [sortField, setSortField] = useState<SortField>('expirationDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
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
      let va = a[sortField];
      let vb = b[sortField];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [trades, sortField, sortDir, filterStatus, filterTicker]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const sortArrow = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  if (trades.length === 0) return null;

  return (
    <section className="bg-[#161822] rounded-lg p-6 border border-gray-800">
      <h2 className="text-xl font-semibold mb-4">All Trades</h2>

      <div className="flex items-center gap-4 mb-4">
        <input
          type="text"
          placeholder="Filter by ticker..."
          value={filterTicker}
          onChange={e => setFilterTicker(e.target.value)}
          className="bg-[#0f1117] border border-gray-700 rounded px-3 py-1.5 text-sm w-48"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-[#0f1117] border border-gray-700 rounded px-3 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="expired_profit">Expired Profit</option>
          <option value="expired_loss">Expired Loss</option>
        </select>
        <span className="text-sm text-gray-400">{filtered.length} trades</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th
                className="text-left py-2 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('ticker')}
              >
                Ticker{sortArrow('ticker')}
              </th>
              <th className="text-left py-2 px-3">Portfolio</th>
              <th className="text-left py-2 px-3">Strikes</th>
              <th
                className="text-left py-2 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('expirationDate')}
              >
                Expiration{sortArrow('expirationDate')}
              </th>
              <th className="text-right py-2 px-3">Contracts</th>
              <th
                className="text-right py-2 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('premiumCollected')}
              >
                Premium{sortArrow('premiumCollected')}
              </th>
              <th className="text-right py-2 px-3">Entry Price</th>
              <th className="text-right py-2 px-3">Cur Price</th>
              <th
                className="text-right py-2 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('currentPnl')}
              >
                P&L{sortArrow('currentPnl')}
              </th>
              <th
                className="text-center py-2 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('status')}
              >
                Status{sortArrow('status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t: any) => (
              <tr
                key={`${t.id}-${t.portfolioId}`}
                className={`border-b border-gray-800/50 hover:bg-[#1a1c2e] ${
                  t.isItm ? 'bg-yellow-900/10' : ''
                }`}
              >
                <td className="py-2 px-3 font-medium text-white">
                  {t.ticker}
                  {t.isItm ? (
                    <span className="ml-1 text-yellow-400 text-[10px]">ITM</span>
                  ) : null}
                </td>
                <td className="py-2 px-3 text-gray-400 text-xs">
                  {t.portfolioType === 'top_return' ? 'Return' : 'Prob'}
                  <br />
                  {t.portfolioScanDate}
                </td>
                <td className="py-2 px-3">
                  {t.sellStrike}/{t.buyStrike}
                </td>
                <td className="py-2 px-3">{t.expirationDate}</td>
                <td className="py-2 px-3 text-right">{t.contracts}</td>
                <td className="py-2 px-3 text-right text-green-400">
                  {formatMoney(t.premiumCollected)}
                </td>
                <td className="py-2 px-3 text-right">
                  {t.stockPriceAtEntry ? `$${t.stockPriceAtEntry.toFixed(2)}` : '-'}
                </td>
                <td className="py-2 px-3 text-right">
                  {t.currentStockPrice ? `$${t.currentStockPrice.toFixed(2)}` : '-'}
                </td>
                <td className={`py-2 px-3 text-right font-medium ${pnlColor(t.currentPnl)}`}>
                  {formatMoney(t.currentPnl)}
                </td>
                <td className="py-2 px-3 text-center">{tradeStatusBadge(t.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
