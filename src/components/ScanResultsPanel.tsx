import React, { useState, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteScanData, type ScanResult } from '../api';

interface ScanResultsPanelProps {
  results: ScanResult[];
  scanDate: string;
  onDataChange: () => void;
}

type SortKey =
  | 'ticker'
  | 'price'
  | 'strike'
  | 'expDate'
  | 'daysToExp'
  | 'probMaxProfit'
  | 'maxProfit'
  | 'maxLoss'
  | 'returnPercent'
  | 'totalOptVol';

const TOOLTIPS: Record<SortKey, string> = {
  ticker: 'Stock ticker symbol',
  price: 'Current stock price',
  strike: 'Strike prices for the put spread (sell/buy). Example: 385/335 means sell 385 put, buy 335 put.',
  expDate: 'Option expiration date',
  daysToExp: 'Days until option expiration',
  probMaxProfit: 'Probability of max profit at expiration. Derived from current options prices and implied volatility.',
  maxProfit: 'Maximum profit if stock stays above the short strike. This is the credit received when selling the spread.',
  maxLoss: 'Maximum loss if stock falls below the long strike. Formula: (Sell Strike - Buy Strike) \u00d7 100 - Credit Received.',
  returnPercent: 'Return on investment (ROI) if the trade expires at max profit. Calculated as credit received / max loss.',
  totalOptVol: 'Total option volume traded today',
};

function returnBarColor(ret: number | null): string {
  if (ret == null) return '#ef4444';
  const pct = ret * 100;
  if (pct >= 10) return '#22c55e';
  if (pct >= 5) return '#4f8ff7';
  if (pct >= 2) return '#eab308';
  return '#ef4444';
}

function parseSellStrike(strike: string | null): number {
  if (!strike) return 0;
  const parts = strike.split('/');
  return parseFloat(parts[0]) || 0;
}

export default function ScanResultsPanel({ results, scanDate, onDataChange }: ScanResultsPanelProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'returnPercent',
    dir: 'desc',
  });

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      let va: any;
      let vb: any;

      if (sort.key === 'strike') {
        va = parseSellStrike(a.strike);
        vb = parseSellStrike(b.strike);
      } else {
        va = (a as any)[sort.key] ?? 0;
        vb = (b as any)[sort.key] ?? 0;
      }

      if (typeof va === 'string') {
        return sort.dir === 'asc'
          ? va.localeCompare(vb)
          : vb.localeCompare(va);
      }
      return sort.dir === 'asc' ? va - vb : vb - va;
    });
  }, [results, sort]);

  const handleSort = (key: SortKey) => {
    if (sort.key === key) {
      setSort({ key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ key, dir: key === 'ticker' ? 'asc' : 'desc' });
    }
  };

  async function handleDelete() {
    if (!confirm(`Delete all scan data for ${scanDate}? This also removes associated portfolios.`)) return;
    try {
      await deleteScanData(scanDate);
      onDataChange();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  const SortHeader = ({
    label,
    sortKey,
    className,
  }: {
    label: string;
    sortKey: SortKey;
    className?: string;
  }) => (
    <th
      onClick={() => handleSort(sortKey)}
      title={TOOLTIPS[sortKey]}
      className={`px-3 py-3 text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide
        cursor-pointer hover:text-[#4f8ff7] whitespace-nowrap border-b border-[#2a2e3a] select-none ${className || 'text-left'}`}
    >
      {label}
      {sort.key === sortKey && (sort.dir === 'asc' ? ' ▲' : ' ▼')}
    </th>
  );

  if (results.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">
          Scan Results
          <span className="text-sm text-[#8b8fa3] font-normal ml-2">
            {results.length} options
          </span>
        </h2>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20
            text-red-400 rounded-lg text-xs font-medium transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Scan
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#2a2e3a]">
        <table className="w-full text-[13px] border-collapse">
          <thead className="bg-[#1a1d27] sticky top-0 z-10">
            <tr>
              <SortHeader label="Ticker" sortKey="ticker" />
              <SortHeader label="Price" sortKey="price" />
              <SortHeader label="Strike" sortKey="strike" />
              <SortHeader label="Exp Date" sortKey="expDate" />
              <SortHeader label="DTE" sortKey="daysToExp" />
              <SortHeader label="Volume" sortKey="totalOptVol" className="text-right" />
              <SortHeader label="Prob Profit" sortKey="probMaxProfit" className="text-right" />
              <SortHeader label="Max Profit" sortKey="maxProfit" className="text-right" />
              <SortHeader label="Max Loss" sortKey="maxLoss" className="text-right" />
              <SortHeader label="Return" sortKey="returnPercent" className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const retPct = r.returnPercent != null ? (r.returnPercent * 100).toFixed(2) : '0.00';
              const probPct = r.probMaxProfit != null ? (r.probMaxProfit * 100).toFixed(1) : '0.0';

              return (
                <tr
                  key={r.id}
                  className="cursor-default hover:bg-[#242836] transition-colors border-b border-[#2a2e3a]/50"
                >
                  <td className="px-3 py-2 font-bold font-mono">{r.ticker}</td>
                  <td className="px-3 py-2">${r.price?.toFixed(2) ?? '-'}</td>
                  <td className="px-3 py-2 font-mono text-[#8b8fa3]">{r.strike}</td>
                  <td className="px-3 py-2">{r.expDate}</td>
                  <td className="px-3 py-2">{r.daysToExp}</td>
                  <td className="px-3 py-2 text-right text-[#8b8fa3]">
                    {r.totalOptVol != null ? r.totalOptVol.toLocaleString() : '-'}
                  </td>
                  <td className="px-3 py-2 text-right">{probPct}%</td>
                  <td className="px-3 py-2 text-right text-green-400">
                    ${r.maxProfit?.toFixed(0) ?? '-'}
                  </td>
                  <td className="px-3 py-2 text-right text-red-400">
                    ${r.maxLoss?.toFixed(0) ?? '-'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-medium">{retPct}%</span>
                      <div className="w-16 h-1.5 bg-[#2a2e3a] rounded-full">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(parseFloat(retPct), 30) / 30 * 100}%`,
                            background: returnBarColor(r.returnPercent),
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
