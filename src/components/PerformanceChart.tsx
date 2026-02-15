import React, { useState, useEffect } from 'react';
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
import { fetchPortfolioHistory } from '../api';

interface PerformanceChartProps {
  portfolios: any[];
}

export default function PerformanceChart({ portfolios }: PerformanceChartProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (portfolios.length === 0) return;

    setLoading(true);

    Promise.all(
      portfolios.map(async p => {
        try {
          const history = await fetchPortfolioHistory(p.id);
          return { portfolio: p, history };
        } catch {
          return { portfolio: p, history: [] };
        }
      })
    )
      .then(results => {
        // Merge all histories into one chart dataset by date
        const dateMap: Record<string, any> = {};

        for (const { portfolio, history } of results) {
          const label =
            portfolio.type === 'top_return' ? 'Top Return' : 'Top Probability';
          const key = `${label} (${portfolio.scanDate})`;

          for (const point of history) {
            if (!dateMap[point.date]) {
              dateMap[point.date] = { date: point.date };
            }
            dateMap[point.date][key] = point.portfolioValue;
          }
        }

        const sorted = Object.values(dateMap).sort((a: any, b: any) =>
          a.date.localeCompare(b.date)
        );
        setChartData(sorted);
      })
      .finally(() => setLoading(false));
  }, [portfolios]);

  if (portfolios.length === 0) return null;

  // Get all series keys
  const seriesKeys = chartData.length > 0
    ? Object.keys(chartData[0]).filter(k => k !== 'date')
    : [];

  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  if (chartData.length === 0 && !loading) return null;

  return (
    <section className="bg-[#161822] rounded-lg p-6 border border-gray-800">
      <h2 className="text-xl font-semibold mb-4">Performance</h2>

      {loading ? (
        <p className="text-gray-400">Loading chart data...</p>
      ) : (
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
            <XAxis
              dataKey="date"
              stroke="#6b7280"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
            />
            <YAxis
              stroke="#6b7280"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1c2e',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#e5e7eb',
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
            />
            <Legend wrapperStyle={{ color: '#9ca3af' }} />
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
      )}
    </section>
  );
}
