import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Loader2, TrendingUp } from 'lucide-react';
import { fetchPortfolioComparison, type ComparisonPortfolio } from '../api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMoney(cents: number): string {
  const dollars = cents / 100;
  return dollars < 0
    ? `-$${Math.abs(dollars).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMoneyShort(cents: number): string {
  const dollars = Math.round(cents / 100);
  return dollars < 0
    ? `-$${Math.abs(dollars).toLocaleString()}`
    : `$${dollars.toLocaleString()}`;
}

function fmtPct(val: number): string {
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
}

function pnlColor(val: number): string {
  if (val === 0) return 'text-gray-300';
  return val > 0 ? 'text-green-400' : 'text-red-400';
}

// ---------------------------------------------------------------------------
// Strategy config
// ---------------------------------------------------------------------------

const STRATEGY_CONFIG: Record<string, { label: string; color: string; shortLabel: string }> = {
  top_return: { label: 'Top Return', color: '#10b981', shortLabel: 'Return' },
  top_probability: { label: 'Top Probability', color: '#3b82f6', shortLabel: 'Prob' },
};

interface StrategyStats {
  key: string;
  label: string;
  color: string;
  portfolioCount: number;
  activeCount: number;
  closedCount: number;
  avgRoi: number;
  cumulativeRoi: number;
  bestRoi: number;
  worstRoi: number;
  winRate: number;
  totalCapital: number;
  totalPnl: number;
  totalPremium: number;
  premiumYield: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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

  // Group portfolios by strategy type
  const grouped = useMemo(() => {
    const map: Record<string, ComparisonPortfolio[]> = {};
    for (const p of portfolios) {
      if (!map[p.type]) map[p.type] = [];
      map[p.type].push(p);
    }
    return map;
  }, [portfolios]);

  // Calculate stats per strategy
  const stats: StrategyStats[] = useMemo(() => {
    return Object.keys(STRATEGY_CONFIG).map(key => {
      const list = grouped[key] || [];
      const active = list.filter(p => p.status === 'active');
      const closed = list.filter(p => p.status === 'closed');
      const rois = list.map(p => p.initialCapital ? (p.netPnl / p.initialCapital) * 100 : 0);
      const wins = rois.filter(r => r > 0).length;

      const totalCapital = list.reduce((s, p) => s + p.initialCapital, 0);
      const totalPnl = list.reduce((s, p) => s + p.netPnl, 0);
      const totalPremium = list.reduce((s, p) => s + p.totalPremiumCollected, 0);
      const premiumYield = totalCapital ? (totalPremium / totalCapital) * 100 : 0;

      // Cumulative ROI: compound each portfolio's return
      let cumValue = 10000000; // $100k in cents
      for (const p of list) {
        const r = p.initialCapital ? p.netPnl / p.initialCapital : 0;
        cumValue *= (1 + r);
      }
      const cumulativeRoi = ((cumValue - 10000000) / 10000000) * 100;

      return {
        key,
        label: STRATEGY_CONFIG[key].label,
        color: STRATEGY_CONFIG[key].color,
        portfolioCount: list.length,
        activeCount: active.length,
        closedCount: closed.length,
        avgRoi: rois.length > 0 ? rois.reduce((a, b) => a + b, 0) / rois.length : 0,
        cumulativeRoi,
        bestRoi: rois.length > 0 ? Math.max(...rois) : 0,
        worstRoi: rois.length > 0 ? Math.min(...rois) : 0,
        winRate: rois.length > 0 ? (wins / rois.length) * 100 : 0,
        totalCapital,
        totalPnl,
        totalPremium,
        premiumYield,
      };
    }).filter(s => s.portfolioCount > 0);
  }, [grouped]);

  // Build cumulative growth chart data
  const growthData = useMemo(() => {
    const strategyTimelines: Record<string, { date: string; value: number }[]> = {};
    const dateSet = new Set<string>();

    for (const key of Object.keys(STRATEGY_CONFIG)) {
      const list = (grouped[key] || []).sort((a, b) => a.scanDate.localeCompare(b.scanDate));
      if (list.length === 0) continue;

      const timeline: { date: string; value: number }[] = [];
      let cumValue = 100000; // dollars

      const firstSnap = list[0].snapshots[0];
      if (firstSnap) {
        timeline.push({ date: firstSnap.date, value: cumValue });
        dateSet.add(firstSnap.date);
      }

      for (const p of list) {
        for (const snap of p.snapshots) {
          const dayValue = p.initialCapital
            ? cumValue * (snap.portfolioValue / p.initialCapital)
            : cumValue;
          timeline.push({ date: snap.date, value: dayValue });
          dateSet.add(snap.date);
        }
        const r = p.initialCapital ? p.netPnl / p.initialCapital : 0;
        cumValue *= (1 + r);
      }

      strategyTimelines[key] = timeline;
    }

    const sortedDates = Array.from(dateSet).sort();
    const data: Record<string, any>[] = [];

    for (const date of sortedDates) {
      const point: Record<string, any> = { date };
      for (const key of Object.keys(strategyTimelines)) {
        const timeline = strategyTimelines[key];
        let val: number | undefined;
        for (let i = timeline.length - 1; i >= 0; i--) {
          if (timeline[i].date <= date) {
            val = timeline[i].value;
            break;
          }
        }
        if (val !== undefined) {
          point[key] = Math.round(val);
        }
      }
      data.push(point);
    }

    return data;
  }, [grouped]);

  // Build per-portfolio ROI bar chart data
  const barData = useMemo(() => {
    const sorted = [...portfolios].sort((a, b) => a.scanDate.localeCompare(b.scanDate));
    const byDate: Record<string, ComparisonPortfolio[]> = {};

    for (const p of sorted) {
      if (!byDate[p.scanDate]) byDate[p.scanDate] = [];
      byDate[p.scanDate].push(p);
    }

    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ps]) => {
        const point: Record<string, any> = {
          name: date.slice(5),
          date,
        };
        for (const p of ps) {
          const roi = p.initialCapital ? (p.netPnl / p.initialCapital) * 100 : 0;
          point[p.type] = parseFloat(roi.toFixed(2));
        }
        return point;
      });
  }, [portfolios]);

  // Chart data: portfolio value over time
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
        dateMap[snap.date][key] = snap.portfolioValue / 100;
      }
    }

    const sorted = Object.values(dateMap).sort((a: any, b: any) =>
      a.date.localeCompare(b.date),
    );
    return { chartData: sorted, seriesKeys: keys };
  }, [portfolios]);

  const activeStrategies = Object.keys(STRATEGY_CONFIG).filter(k => grouped[k]?.length > 0);
  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  // Overall totals
  const overallCapital = portfolios.reduce((s, p) => s + p.initialCapital, 0);
  const overallPnl = portfolios.reduce((s, p) => s + p.netPnl, 0);
  const overallPremium = portfolios.reduce((s, p) => s + p.totalPremiumCollected, 0);
  const overallRoi = overallCapital ? (overallPnl / overallCapital) * 100 : 0;

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
        <TrendingUp className="w-12 h-12 text-[#2a2e3a] mx-auto mb-4" />
        <p className="text-[#8b8fa3] mb-2">No portfolio data available yet</p>
        <p className="text-[#8b8fa3] text-sm">
          Create portfolios from scan results to start tracking performance
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Summary Header */}
      <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-5">
        <h2 className="text-lg font-bold mb-1">Strategy Performance Comparison</h2>
        <p className="text-sm text-[#8b8fa3] mb-4">
          Comparing {portfolios.length} portfolio{portfolios.length !== 1 ? 's' : ''} across {activeStrategies.length} strateg{activeStrategies.length !== 1 ? 'ies' : 'y'}: Top Return vs Top Probability
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-3">
            <div className="text-xs text-[#8b8fa3] mb-1">Total Capital Deployed</div>
            <div className="text-sm font-bold">{fmtMoneyShort(overallCapital)}</div>
          </div>
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-3">
            <div className="text-xs text-[#8b8fa3] mb-1">Total Net P&L</div>
            <div className={`text-sm font-bold ${pnlColor(overallPnl)}`}>{fmtMoney(overallPnl)}</div>
          </div>
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-3">
            <div className="text-xs text-[#8b8fa3] mb-1">Overall ROI</div>
            <div className={`text-sm font-bold ${pnlColor(overallPnl)}`}>{fmtPct(overallRoi)}</div>
          </div>
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-3">
            <div className="text-xs text-[#8b8fa3] mb-1">Total Premium Collected</div>
            <div className="text-sm font-bold text-green-400">{fmtMoney(overallPremium)}</div>
          </div>
        </div>
      </div>

      {/* Strategy Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.map(s => {
          const isPos = s.cumulativeRoi >= 0;
          return (
            <div key={s.key} className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                <h3 className="text-sm font-bold">{s.label}</h3>
                <span className="text-xs text-[#8b8fa3]">
                  {s.portfolioCount} portfolio{s.portfolioCount !== 1 ? 's' : ''}
                  {s.activeCount > 0 && ` (${s.activeCount} active)`}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-xs text-[#8b8fa3]">Cumulative ROI</div>
                  <div className={`text-lg font-bold ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                    {fmtPct(s.cumulativeRoi)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#8b8fa3]">Avg ROI</div>
                  <div className={`text-sm font-bold ${pnlColor(s.avgRoi)}`}>
                    {fmtPct(s.avgRoi)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#8b8fa3]">Win Rate</div>
                  <div className={`text-sm font-bold ${s.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                    {s.winRate.toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#8b8fa3]">Premium Yield</div>
                  <div className="text-sm font-bold text-green-400">
                    {s.premiumYield.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cumulative Growth Chart */}
      {growthData.length > 1 && (
        <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[#8b8fa3] mb-3">
            Cumulative Portfolio Growth (starting at $100K)
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={growthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3a" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#8b8fa3', fontSize: 10 }}
                stroke="#2a2e3a"
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis
                tick={{ fill: '#8b8fa3', fontSize: 11 }}
                stroke="#2a2e3a"
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
              />
              <Tooltip
                contentStyle={{ background: '#1a1d27', border: '1px solid #2a2e3a', borderRadius: 8 }}
                labelStyle={{ color: '#8b8fa3' }}
                formatter={(value: number, name: string) => [
                  `$${value.toLocaleString()}`,
                  STRATEGY_CONFIG[name]?.shortLabel || name,
                ]}
              />
              <Legend
                formatter={(value: string) => STRATEGY_CONFIG[value]?.shortLabel || value}
                wrapperStyle={{ fontSize: 12 }}
              />
              <ReferenceLine y={100000} stroke="#4a4e5a" strokeDasharray="3 3" />
              {activeStrategies.map(key => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={STRATEGY_CONFIG[key].color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-Portfolio ROI Bar Chart */}
      {barData.length > 0 && (
        <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[#8b8fa3] mb-3">
            Individual Portfolio ROI (%)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3a" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#8b8fa3', fontSize: 10 }}
                stroke="#2a2e3a"
              />
              <YAxis
                tick={{ fill: '#8b8fa3', fontSize: 11 }}
                stroke="#2a2e3a"
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{ background: '#1a1d27', border: '1px solid #2a2e3a', borderRadius: 8 }}
                labelStyle={{ color: '#8b8fa3' }}
                labelFormatter={(_label: string, payload: any[]) => {
                  const item = payload?.[0]?.payload;
                  return item?.date || _label;
                }}
                formatter={(value: number, name: string) => [
                  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
                  STRATEGY_CONFIG[name]?.shortLabel || name,
                ]}
              />
              <Legend
                formatter={(value: string) => STRATEGY_CONFIG[value]?.shortLabel || value}
                wrapperStyle={{ fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="#4a4e5a" />
              {activeStrategies.map(key => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={STRATEGY_CONFIG[key].color}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detailed Statistics Table */}
      <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl overflow-hidden">
        <h3 className="text-sm font-semibold text-[#8b8fa3] p-4 pb-2">Detailed Statistics</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#2a2e3a]">
                <th className="px-4 py-2 text-left text-xs text-[#8b8fa3] font-semibold">Strategy</th>
                <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Portfolios</th>
                <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Avg ROI</th>
                <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Cumulative</th>
                <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Best</th>
                <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Worst</th>
                <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Win Rate</th>
                <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Total P&L</th>
                <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Premium Yield</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.key} className="border-b border-[#2a2e3a]/50 hover:bg-[#242836]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="font-semibold">{s.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.portfolioCount}
                    {s.activeCount > 0 && (
                      <span className="text-xs text-[#8b8fa3] ml-1">({s.activeCount} active)</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${pnlColor(s.avgRoi)}`}>
                    {fmtPct(s.avgRoi)}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${pnlColor(s.cumulativeRoi)}`}>
                    {fmtPct(s.cumulativeRoi)}
                  </td>
                  <td className={`px-4 py-3 text-right ${pnlColor(s.bestRoi)}`}>
                    {fmtPct(s.bestRoi)}
                  </td>
                  <td className={`px-4 py-3 text-right ${pnlColor(s.worstRoi)}`}>
                    {fmtPct(s.worstRoi)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={s.winRate >= 50 ? 'text-green-400' : 'text-red-400'}>
                      {s.winRate.toFixed(0)}%
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${pnlColor(s.totalPnl)}`}>
                    {fmtMoney(s.totalPnl)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-400">
                    {s.premiumYield.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Portfolio Breakdown Cards */}
      <div>
        <h3 className="text-sm font-semibold text-[#8b8fa3] mb-3">Individual Portfolio Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {portfolios.map((p) => {
            const typeLabel = p.type === 'top_return' ? 'Top Return' : 'Top Probability';
            const roi = p.initialCapital ? (p.netPnl / p.initialCapital) * 100 : 0;
            const premYield = p.initialCapital ? (p.totalPremiumCollected / p.initialCapital) * 100 : 0;

            return (
              <div key={p.id} className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: STRATEGY_CONFIG[p.type]?.color || '#8b8fa3' }}
                    />
                    <h3 className="text-sm font-semibold">{typeLabel}</h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    p.status === 'active' ? 'bg-green-600/20 text-green-400' : 'bg-gray-600/20 text-gray-400'
                  }`}>
                    {p.status}
                  </span>
                </div>
                <div className="text-xs text-[#8b8fa3] mb-3">Scan: {p.scanDate}</div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <div className="text-xs text-[#8b8fa3]">Capital</div>
                    <div className="text-sm font-bold">{fmtMoneyShort(p.initialCapital)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#8b8fa3]">P&L</div>
                    <div className={`text-sm font-bold ${pnlColor(p.netPnl)}`}>
                      {fmtMoney(p.netPnl)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#8b8fa3]">ROI</div>
                    <div className={`text-sm font-bold ${pnlColor(p.netPnl)}`}>
                      {fmtPct(roi)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-[#2a2e3a] pt-2">
                  <div>
                    <div className="text-xs text-[#8b8fa3]">Premium</div>
                    <div className="text-sm font-bold text-green-400">{fmtMoneyShort(p.totalPremiumCollected)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#8b8fa3]">Prem Yield</div>
                    <div className="text-sm font-bold text-green-400">{premYield.toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#8b8fa3]">Current Val</div>
                    <div className="text-sm font-bold">{fmtMoneyShort(p.currentValue)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Portfolio Value Over Time Chart */}
      {chartData.length > 0 && (
        <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[#8b8fa3] mb-3">Portfolio Value Over Time</h3>
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
