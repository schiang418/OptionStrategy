import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, SlidersHorizontal, X } from 'lucide-react';
import { deleteScanData, type ScanResult } from '../api';

interface ScanResultsPanelProps {
  results: ScanResult[];
  scanDate: string;
  scanName?: string;
  onDataChange: () => void;
}

type SortKey =
  | 'ticker'
  | 'price'
  | 'priceChange'
  | 'ivRank'
  | 'ivPercentile'
  | 'strike'
  | 'moneyness'
  | 'expDate'
  | 'daysToExp'
  | 'totalOptVol'
  | 'probMaxProfit'
  | 'maxProfit'
  | 'maxLoss'
  | 'returnPercent';

interface ColumnDef {
  key: SortKey;
  label: string;
  shortLabel: string;
  tooltip: string;
  align: 'left' | 'right';
  defaultVisible: boolean;
  render: (r: ScanResult) => React.ReactNode;
}

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

const COLUMNS: ColumnDef[] = [
  {
    key: 'ticker',
    label: 'Ticker',
    shortLabel: 'Ticker',
    tooltip: 'Stock ticker symbol. The underlying equity for the credit put spread.',
    align: 'left',
    defaultVisible: true,
    render: (r) => <span className="font-bold font-mono">{r.ticker}</span>,
  },
  {
    key: 'price',
    label: 'Price',
    shortLabel: 'Price',
    tooltip: 'Current stock price at the time of scan. For the spread to be profitable, this should stay above the sell strike through expiration.',
    align: 'left',
    defaultVisible: true,
    render: (r) => <span>${r.price?.toFixed(2) ?? '-'}</span>,
  },
  {
    key: 'priceChange',
    label: 'Chg %',
    shortLabel: 'Chg %',
    tooltip: 'Stock price change percentage for the day. A large negative move may indicate elevated risk for put spreads.',
    align: 'right',
    defaultVisible: false,
    render: (r) => {
      if (r.priceChange == null) return <span className="text-[#8b8fa3]">-</span>;
      const val = r.priceChange;
      const color = val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-[#8b8fa3]';
      return <span className={color}>{val > 0 ? '+' : ''}{val.toFixed(2)}%</span>;
    },
  },
  {
    key: 'ivRank',
    label: 'IV Rank',
    shortLabel: 'IV Rank',
    tooltip: 'Implied Volatility Rank (0–100%). Measures where current IV sits within its 52-week high/low range. Formula: (Current IV − 52wk Low IV) / (52wk High IV − 52wk Low IV). Higher = better premiums for selling options.',
    align: 'right',
    defaultVisible: false,
    render: (r) => {
      if (r.ivRank == null) return <span className="text-[#8b8fa3]">-</span>;
      return <span>{(r.ivRank * 100).toFixed(1)}%</span>;
    },
  },
  {
    key: 'ivPercentile',
    label: 'IV %ile',
    shortLabel: 'IV %ile',
    tooltip: 'Implied Volatility Percentile (0–100%). The percentage of trading days in the past year where IV was lower than today. E.g., 80% means IV is higher today than 80% of the past year. Higher = richer option premiums.',
    align: 'right',
    defaultVisible: false,
    render: (r) => {
      if (r.ivPercentile == null) return <span className="text-[#8b8fa3]">-</span>;
      return <span>{(r.ivPercentile * 100).toFixed(1)}%</span>;
    },
  },
  {
    key: 'strike',
    label: 'Strike',
    shortLabel: 'Strike',
    tooltip: 'Credit put spread strike prices shown as Sell/Buy. The sell (short) strike is higher; the buy (long) strike is lower. Example: 385/335 means sell the $385 put and buy the $335 put. The spread width (385 − 335 = $50) determines max risk.',
    align: 'left',
    defaultVisible: true,
    render: (r) => <span className="font-mono text-[#8b8fa3]">{r.strike ?? '-'}</span>,
  },
  {
    key: 'moneyness',
    label: 'Moneyness',
    shortLabel: 'OTM %',
    tooltip: 'How far out-of-the-money (OTM) the short put strike is from the current stock price. Formula: (Stock Price − Sell Strike) / Stock Price × 100. Higher % = more downside cushion before the trade loses money.',
    align: 'right',
    defaultVisible: false,
    render: (r) => {
      if (r.moneyness == null) return <span className="text-[#8b8fa3]">-</span>;
      return <span>{(r.moneyness * 100).toFixed(1)}%</span>;
    },
  },
  {
    key: 'expDate',
    label: 'Exp Date',
    shortLabel: 'Exp',
    tooltip: 'Option expiration date. Both legs of the put spread expire on this date. If the stock is above the sell strike at expiration, both puts expire worthless and you keep the full premium.',
    align: 'left',
    defaultVisible: true,
    render: (r) => <span>{r.expDate ?? '-'}</span>,
  },
  {
    key: 'daysToExp',
    label: 'DTE',
    shortLabel: 'DTE',
    tooltip: 'Days To Expiration. Number of calendar days until the option expires. Bi-weekly strategies target ~14 DTE; yearly strategies target ~365 DTE. Shorter DTE = faster time decay (theta) but less premium.',
    align: 'left',
    defaultVisible: true,
    render: (r) => <span>{r.daysToExp ?? '-'}</span>,
  },
  {
    key: 'totalOptVol',
    label: 'Volume',
    shortLabel: 'Vol',
    tooltip: 'Total option contracts traded today for this underlying. Higher volume generally means tighter bid-ask spreads and better fill prices when entering/exiting the spread.',
    align: 'right',
    defaultVisible: true,
    render: (r) => (
      <span className="text-[#8b8fa3]">
        {r.totalOptVol != null ? r.totalOptVol.toLocaleString() : '-'}
      </span>
    ),
  },
  {
    key: 'probMaxProfit',
    label: 'Prob Profit',
    shortLabel: 'Prob',
    tooltip: 'Probability of achieving max profit at expiration (both puts expire OTM). Derived from the option delta and implied volatility. E.g., 85% means an estimated 85% chance the stock stays above the sell strike. Higher probability = safer trade but lower return.',
    align: 'right',
    defaultVisible: true,
    render: (r) => (
      <span>{r.probMaxProfit != null ? (r.probMaxProfit * 100).toFixed(1) : '0.0'}%</span>
    ),
  },
  {
    key: 'maxProfit',
    label: 'Max Profit',
    shortLabel: 'Profit',
    tooltip: 'Maximum profit per contract if stock stays above the sell strike at expiration. This equals the net credit received when opening the spread. Formula: (Sell Put Premium − Buy Put Premium) × 100 shares. Shown in dollars per contract.',
    align: 'right',
    defaultVisible: true,
    render: (r) => (
      <span className="text-green-400">${r.maxProfit?.toFixed(0) ?? '-'}</span>
    ),
  },
  {
    key: 'maxLoss',
    label: 'Max Loss',
    shortLabel: 'Loss',
    tooltip: 'Maximum loss per contract if stock falls below the buy strike at expiration. Formula: (Sell Strike − Buy Strike) × 100 − Credit Received. This is the worst-case risk. Shown as a negative dollar amount per contract.',
    align: 'right',
    defaultVisible: true,
    render: (r) => (
      <span className="text-red-400">${r.maxLoss?.toFixed(0) ?? '-'}</span>
    ),
  },
  {
    key: 'returnPercent',
    label: 'Return',
    shortLabel: 'Return',
    tooltip: 'Return on risk if the trade achieves max profit. Formula: Max Profit / |Max Loss| × 100. E.g., 10% means you earn $10 for every $100 at risk. Higher return trades typically have lower probability of profit.',
    align: 'right',
    defaultVisible: true,
    render: (r) => {
      const retPct = r.returnPercent != null ? (r.returnPercent * 100).toFixed(2) : '0.00';
      return (
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
      );
    },
  },
];

const DEFAULT_VISIBLE = new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));

export default function ScanResultsPanel({ results, scanDate, scanName, onDataChange }: ScanResultsPanelProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'returnPercent',
    dir: 'desc',
  });
  const [visibleCols, setVisibleCols] = useState<Set<SortKey>>(new Set(DEFAULT_VISIBLE));
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  const activeColumns = useMemo(
    () => COLUMNS.filter((c) => visibleCols.has(c.key)),
    [visibleCols],
  );

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

  const toggleColumn = (key: SortKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Don't allow removing the last column
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const resetColumns = () => setVisibleCols(new Set(DEFAULT_VISIBLE));

  async function handleDelete() {
    if (!confirm(`Delete all scan data for ${scanDate}? This also removes associated portfolios.`)) return;
    try {
      await deleteScanData(scanDate, scanName);
      onDataChange();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  const SortHeader = ({
    col,
  }: {
    col: ColumnDef;
  }) => {
    const [showTip, setShowTip] = useState(false);
    const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);
    const thRef = useRef<HTMLTableCellElement>(null);
    const tipTimeout = useRef<ReturnType<typeof setTimeout>>();

    const updatePos = useCallback(() => {
      if (thRef.current) {
        const rect = thRef.current.getBoundingClientRect();
        setTipPos({
          top: rect.top + window.scrollY,
          left: rect.left + rect.width / 2 + window.scrollX,
        });
      }
    }, []);

    const onEnter = () => {
      clearTimeout(tipTimeout.current);
      updatePos();
      tipTimeout.current = setTimeout(() => setShowTip(true), 400);
    };
    const onLeave = () => {
      clearTimeout(tipTimeout.current);
      setShowTip(false);
    };

    useEffect(() => {
      return () => clearTimeout(tipTimeout.current);
    }, []);

    return (
      <th
        ref={thRef}
        onClick={() => handleSort(col.key)}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className={`px-3 py-3 text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide
          cursor-pointer hover:text-[#4f8ff7] whitespace-nowrap border-b border-[#2a2e3a] select-none
          ${col.align === 'right' ? 'text-right' : 'text-left'}`}
      >
        {col.label}
        {sort.key === col.key && (
          <span className="text-[#4f8ff7] ml-1">{sort.dir === 'asc' ? '▲' : '▼'}</span>
        )}
        {showTip && tipPos && createPortal(
          <div
            style={{ position: 'absolute', top: tipPos.top, left: tipPos.left, transform: 'translate(-50%, -100%)', zIndex: 9999 }}
            className="mb-2 pointer-events-none"
          >
            <div className="bg-[#242836] border border-[#3a3e4a] rounded-lg px-3 py-2 shadow-xl
              text-[11px] text-[#c8ccd8] font-normal normal-case tracking-normal
              whitespace-normal min-w-[200px] max-w-[300px] leading-relaxed mb-2">
              {col.tooltip}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2
                w-2 h-2 bg-[#242836] border-r border-b border-[#3a3e4a] rotate-45" />
            </div>
          </div>,
          document.body
        )}
      </th>
    );
  };

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
        <div className="flex items-center gap-2">
          {/* Column picker toggle */}
          <div className="relative">
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${showColumnPicker
                  ? 'bg-[#4f8ff7]/20 text-[#4f8ff7] border border-[#4f8ff7]/40'
                  : 'bg-[#1a1d27] hover:bg-[#242836] text-[#8b8fa3] border border-[#2a2e3a]'
                }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Columns
              <span className="bg-[#2a2e3a] px-1.5 py-0.5 rounded text-[10px]">
                {visibleCols.size}/{COLUMNS.length}
              </span>
            </button>

            {/* Column picker dropdown */}
            {showColumnPicker && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowColumnPicker(false)}
                />
                <div className="absolute right-0 top-full mt-2 z-30 w-56 bg-[#1a1d27] border border-[#2a2e3a]
                  rounded-xl shadow-2xl py-2 max-h-[400px] overflow-y-auto">
                  <div className="flex items-center justify-between px-3 py-1.5 mb-1">
                    <span className="text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide">
                      Toggle Columns
                    </span>
                    <button
                      onClick={resetColumns}
                      className="text-[10px] text-[#4f8ff7] hover:text-[#6fa5ff] font-medium"
                    >
                      Reset
                    </button>
                  </div>
                  {COLUMNS.map((col) => (
                    <button
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm
                        hover:bg-[#242836] transition-colors"
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                          ${visibleCols.has(col.key)
                            ? 'bg-[#4f8ff7] border-[#4f8ff7]'
                            : 'border-[#3a3e4a] bg-transparent'
                          }`}
                      >
                        {visibleCols.has(col.key) && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className={visibleCols.has(col.key) ? 'text-white' : 'text-[#8b8fa3]'}>
                        {col.label}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20
              text-red-400 rounded-lg text-xs font-medium transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Scan
          </button>
        </div>
      </div>

      {/* Active column filter chips (shown when non-default columns are active) */}
      {(() => {
        const nonDefault = COLUMNS.filter((c) => visibleCols.has(c.key) && !c.defaultVisible);
        if (nonDefault.length === 0) return null;
        return (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[10px] text-[#8b8fa3] uppercase tracking-wide mr-1">Extra:</span>
            {nonDefault.map((col) => (
              <button
                key={col.key}
                onClick={() => toggleColumn(col.key)}
                className="flex items-center gap-1 px-2 py-0.5 bg-[#4f8ff7]/10 text-[#4f8ff7]
                  border border-[#4f8ff7]/30 rounded-md text-[11px] font-medium
                  hover:bg-[#4f8ff7]/20 transition-all"
              >
                {col.shortLabel}
                <X className="w-3 h-3" />
              </button>
            ))}
          </div>
        );
      })()}

      <div className="overflow-x-auto rounded-xl border border-[#2a2e3a]">
        <table className="w-full text-[13px] border-collapse">
          <thead className="bg-[#1a1d27] sticky top-0 z-10">
            <tr>
              {activeColumns.map((col) => (
                <SortHeader key={col.key} col={col} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.id}
                className="cursor-default hover:bg-[#242836] transition-colors border-b border-[#2a2e3a]/50"
              >
                {activeColumns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : ''}`}
                  >
                    {col.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
