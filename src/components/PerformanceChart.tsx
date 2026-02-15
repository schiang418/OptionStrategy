import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { fetchPortfolioComparison, type ComparisonPortfolio } from '../api';

function fmtMoney(cents: number): string {
  const dollars = cents / 100;
  return dollars < 0
    ? `-$${Math.abs(dollars).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pnlColor(val: number): string {
  if (val === 0) return 'text-gray-300';
  return val > 0 ? 'text-green-400' : 'text-red-400';
}

export default function PerformanceChart() {
  const [portfolios, setPortfolios] = useState<ComparisonPortfolio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchPortfolioComparison()
      .then(setPortfolios)
      .catch(() => setPortfolios([]))
      .finally(() => setLoading(false));
  }, []);

  // Build chart data by merging all portfolio snapshots by date
  const { chartData, seriesKeys } = useMemo(() => {
    const dateMap: Record<string, any> = {};
    const keys: string[] = [];

    for (const p of portfolios) {
      const label = p.type === 'top_return' ? 'Return' : 'Prob';
      const key = `${label} (${p.scanDate})`;
      keys.push(key);

      for (const snap of p.snapshots) {
        if (!dateMap[snap.date]) {
          dateMap[snap.date] = { date: snap.date };
        }
        dateMap[snap.date][key] = snap.portfolioValue / 100; // Convert cents to dollars
      }
    }

    const sorted = Object.values(dateMap).sort((a: any, b: any) =>
      a.date.localeCompare(b.date),
    );
    return { chartData: sorted, seriesKeys: keys };
  }, [portfolios]);

  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#4f8ff7]" />
      </div>
    );
  }

  if (portfolios.length === 0) {
    return (
      <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-6 text-center">
        <p className="text-[#8b8fa3]">No portfolio data to compare yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {portfolios.map((p) => {
          const typeLabel = p.type === 'top_return' ? 'Top Return' : 'Top Probability';
          const pnlPct = p.initialCapital
            ? ((p.netPnl / p.initialCapital) * 100).toFixed(2)
            : '0.00';

          return (
            <div key={p.id} className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">{typeLabel}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  p.status === 'active' ? 'bg-green-600/20 text-green-400' : 'bg-gray-600/20 text-gray-400'
                }`}>
                  {p.status}
                </span>
              </div>
              <div className="text-xs text-[#8b8fa3] mb-3">Scan: {p.scanDate}</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-xs text-[#8b8fa3]">Capital</div>
                  <div className="text-sm font-bold">{fmtMoney(p.initialCapital)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#8b8fa3]">P&L</div>
                  <div className={`text-sm font-bold ${pnlColor(p.netPnl)}`}>
                    {fmtMoney(p.netPnl)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#8b8fa3]">Return</div>
                  <div className={`text-sm font-bold ${pnlColor(p.netPnl)}`}>
                    {pnlPct}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Portfolio Value Over Time</h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3a" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#8b8fa3', fontSize: 11 }}
                stroke="#2a2e3a"
              />
              <YAxis
                tick={{ fill: '#8b8fa3', fontSize: 11 }}
                stroke="#2a2e3a"
                tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a1d27',
                  border: '1px solid #2a2e3a',
                  borderRadius: 8,
                }}
                labelStyle={{ color: '#8b8fa3' }}
                formatter={(value: number) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '']}
              />
              <Legend wrapperStyle={{ color: '#8b8fa3' }} />
              {seriesKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
