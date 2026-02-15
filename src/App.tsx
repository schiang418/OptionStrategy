import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import ScanResultsPanel from './components/ScanResultsPanel';
import PortfolioCards from './components/PortfolioCards';
import PerformanceChart from './components/PerformanceChart';
import AllTradesTable from './components/AllTradesTable';
import { fetchScanDates, fetchPortfolios, fetchPortfolioDetail } from './api';

export default function App() {
  const [scanDates, setScanDates] = useState<any[]>([]);
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [portfolioDetails, setPortfolioDetails] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [dates, portfolioList] = await Promise.all([
        fetchScanDates().catch(() => []),
        fetchPortfolios().catch(() => []),
      ]);
      setScanDates(dates);
      setPortfolios(portfolioList);

      // Load details for each portfolio
      const details: Record<number, any> = {};
      for (const p of portfolioList) {
        try {
          const detail = await fetchPortfolioDetail(p.id);
          details[p.id] = detail;
        } catch {}
      }
      setPortfolioDetails(details);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const lastScanDate = scanDates.length > 0 ? scanDates[0].scanDate : null;

  // Collect all trades from all portfolios
  const allTrades = Object.values(portfolioDetails).flatMap((p: any) =>
    (p.trades || []).map((t: any) => ({
      ...t,
      portfolioType: p.type,
      portfolioScanDate: p.scanDate,
    }))
  );

  return (
    <div className="min-h-screen bg-[#0f1117] text-gray-100">
      <Header lastScanDate={lastScanDate} onRefresh={loadData} />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400 text-lg">Loading...</div>
          </div>
        ) : (
          <>
            <ScanResultsPanel scanDates={scanDates} onDataChange={loadData} />

            <PortfolioCards
              portfolios={portfolios}
              portfolioDetails={portfolioDetails}
            />

            <PerformanceChart portfolios={portfolios} />

            <AllTradesTable trades={allTrades} />
          </>
        )}
      </main>
    </div>
  );
}
