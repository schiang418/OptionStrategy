import React, { useState, useEffect } from 'react';
import { fetchScanResults, deleteScanData } from '../api';

interface ScanResultsPanelProps {
  scanDates: Array<{ scanDate: string; scanName: string; resultCount: number }>;
  onDataChange: () => void;
}

export default function ScanResultsPanel({ scanDates, onDataChange }: ScanResultsPanelProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    if (scanDates.length > 0 && !selectedDate) {
      setSelectedDate(scanDates[0].scanDate);
    }
  }, [scanDates, selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;
    setLoadingResults(true);
    fetchScanResults(selectedDate)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setLoadingResults(false));
  }, [selectedDate]);

  async function handleDelete() {
    if (!selectedDate) return;
    if (!confirm(`Delete all scan data for ${selectedDate}? This also removes associated portfolios.`)) return;
    try {
      await deleteScanData(selectedDate);
      setSelectedDate(null);
      setResults([]);
      onDataChange();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  if (scanDates.length === 0) {
    return (
      <section className="bg-[#161822] rounded-lg p-6 border border-gray-800">
        <h2 className="text-xl font-semibold mb-2">Scan Results</h2>
        <p className="text-gray-400">No scan data yet. Run a scan to get started.</p>
      </section>
    );
  }

  return (
    <section className="bg-[#161822] rounded-lg p-6 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Scan Results</h2>
        <div className="flex items-center gap-3">
          <select
            value={selectedDate || ''}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-[#0f1117] border border-gray-700 rounded px-3 py-1.5 text-sm"
          >
            {scanDates.map(d => (
              <option key={d.scanDate} value={d.scanDate}>
                {d.scanDate} ({d.resultCount} results)
              </option>
            ))}
          </select>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-sm transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {loadingResults ? (
        <p className="text-gray-400">Loading results...</p>
      ) : results.length === 0 ? (
        <p className="text-gray-400">No results for selected date.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 px-2">Ticker</th>
                <th className="text-left py-2 px-2">Price</th>
                <th className="text-left py-2 px-2">IV Rank</th>
                <th className="text-left py-2 px-2">Strike</th>
                <th className="text-left py-2 px-2">Exp Date</th>
                <th className="text-left py-2 px-2">DTE</th>
                <th className="text-right py-2 px-2">Prob Profit</th>
                <th className="text-right py-2 px-2">Max Profit</th>
                <th className="text-right py-2 px-2">Max Loss</th>
                <th className="text-right py-2 px-2">Return %</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r: any) => (
                <tr key={r.id} className="border-b border-gray-800 hover:bg-[#1a1c2e]">
                  <td className="py-2 px-2 font-medium text-white">{r.ticker}</td>
                  <td className="py-2 px-2">${r.price?.toFixed(2)}</td>
                  <td className="py-2 px-2">{r.ivRank?.toFixed(1)}</td>
                  <td className="py-2 px-2">{r.strike}</td>
                  <td className="py-2 px-2">{r.expDate}</td>
                  <td className="py-2 px-2">{r.daysToExp}</td>
                  <td className="py-2 px-2 text-right">{r.probMaxProfit?.toFixed(1)}%</td>
                  <td className="py-2 px-2 text-right text-green-400">${r.maxProfit?.toFixed(0)}</td>
                  <td className="py-2 px-2 text-right text-red-400">${r.maxLoss?.toFixed(0)}</td>
                  <td className="py-2 px-2 text-right font-medium">{r.returnPercent?.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
