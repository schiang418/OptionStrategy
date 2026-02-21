import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Loader2, BarChart3, TrendingUp, List, Lock, ArrowLeft } from 'lucide-react';
import {
  fetchScanDates,
  fetchScanResults,
  fetchPortfoliosByDate,
  fetchPortfolioDetail,
  fetchAllTrades,
  updateAllPnl,
  runMondayWorkflow,
  type ScanDate,
  type ScanResult,
  type Portfolio,
  type PortfolioWithTrades,
  type Trade,
} from './api';
import { STRATEGIES, DEFAULT_STRATEGY, type Strategy } from './strategies';
import ScanResultsPanel from './components/ScanResultsPanel';
import PortfolioCards from './components/PortfolioCards';
import PerformanceChart from './components/PerformanceChart';
import AllTradesTable from './components/AllTradesTable';

const MEMBER_PORTAL_URL = import.meta.env.VITE_MEMBER_PORTAL_URL
  || 'https://portal.cyclescope.com';
const MANUAL_TRIGGER = import.meta.env.VITE_MANUAL_TRIGGER === 'true';

type ViewTab = 'overview' | 'trades' | 'comparison';

const TAB_LABELS: Record<ViewTab, string> = {
  overview: 'Overview',
  trades: 'All Trades',
  comparison: 'Performance',
};

export default function App() {
  const [strategy, setStrategy] = useState<Strategy>(DEFAULT_STRATEGY);
  const [activeTab, setActiveTab] = useState<ViewTab>('overview');
  const [scanDates, setScanDates] = useState<ScanDate[]>([]);
  const [currentDateIdx, setCurrentDateIdx] = useState(0);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [portfolioDetails, setPortfolioDetails] = useState<Record<number, PortfolioWithTrades>>({});
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Track current strategy scanName in a ref so callbacks always see latest
  const scanNameRef = useRef(strategy.scanName);
  scanNameRef.current = strategy.scanName;

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load scan dates list (filtered by current strategy)
  const loadDates = useCallback(async (scanName?: string) => {
    const sn = scanName ?? scanNameRef.current;
    try {
      const dates = await fetchScanDates(sn);
      setScanDates(dates);
      return dates;
    } catch {
      setScanDates([]);
      return [];
    }
  }, []);

  // Load data for a specific scan date (filtered by current strategy)
  const loadDateData = useCallback(async (date: string, scanName?: string) => {
    const sn = scanName ?? scanNameRef.current;
    setLoading(true);
    try {
      const [results, portfolioList] = await Promise.all([
        fetchScanResults(date, sn).catch(() => []),
        fetchPortfoliosByDate(date, sn).catch(() => []),
      ]);
      setScanResults(results);
      setPortfolios(portfolioList);

      // Load details for each portfolio
      const details: Record<number, PortfolioWithTrades> = {};
      for (const p of portfolioList) {
        try {
          details[p.id] = await fetchPortfolioDetail(p.id);
        } catch {}
      }
      setPortfolioDetails(details);
    } catch (err: any) {
      console.error('Failed to load date data:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load all trades (for the trades tab, filtered by current strategy)
  const loadAllTrades = useCallback(async (scanName?: string) => {
    const sn = scanName ?? scanNameRef.current;
    try {
      const trades = await fetchAllTrades(sn);
      setAllTrades(trades);
    } catch {
      setAllTrades([]);
    }
  }, []);

  // Load strategy data (called on initial load and strategy change)
  const loadStrategyData = useCallback(async (scanName: string) => {
    const dates = await loadDates(scanName);
    if (dates.length > 0) {
      setCurrentDateIdx(0);
      await loadDateData(dates[0].scanDate, scanName);
    } else {
      setScanResults([]);
      setPortfolios([]);
      setPortfolioDetails({});
    }
  }, [loadDates, loadDateData]);

  // Initial load
  useEffect(() => {
    loadStrategyData(strategy.scanName);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load trades when switching to trades tab
  useEffect(() => {
    if (activeTab === 'trades') {
      loadAllTrades();
    }
  }, [activeTab, loadAllTrades]);

  // Date navigation
  const currentDate = scanDates[currentDateIdx];

  const handlePrevDate = async () => {
    if (currentDateIdx < scanDates.length - 1) {
      const newIdx = currentDateIdx + 1;
      setCurrentDateIdx(newIdx);
      await loadDateData(scanDates[newIdx].scanDate);
    }
  };

  const handleNextDate = async () => {
    if (currentDateIdx > 0) {
      const newIdx = currentDateIdx - 1;
      setCurrentDateIdx(newIdx);
      await loadDateData(scanDates[newIdx].scanDate);
    }
  };

  // Actions
  const handleRunScan = async () => {
    setScanLoading(true);
    try {
      const result = await runMondayWorkflow(true, strategy.scanName, strategy.tradesPerPortfolio);
      showToast(result.message || 'Scan complete');
      const dates = await loadDates();
      if (dates.length > 0) {
        setCurrentDateIdx(0);
        await loadDateData(dates[0].scanDate);
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setScanLoading(false);
    }
  };

  const handleUpdatePnl = async () => {
    setPnlLoading(true);
    try {
      const result = await updateAllPnl();
      showToast(result.message || 'P&L updated');
      if (currentDate) {
        await loadDateData(currentDate.scanDate);
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setPnlLoading(false);
    }
  };

  const handleDataChange = async () => {
    const dates = await loadDates();
    if (dates.length > 0) {
      const idx = Math.min(currentDateIdx, dates.length - 1);
      setCurrentDateIdx(idx);
      await loadDateData(dates[idx].scanDate);
    } else {
      setScanResults([]);
      setPortfolios([]);
      setPortfolioDetails({});
    }
  };

  const handleStrategyChange = async (s: Strategy) => {
    if (!s.enabled || s.id === strategy.id) return;
    setStrategy(s);
    // Reset state for the new strategy
    setScanDates([]);
    setScanResults([]);
    setPortfolios([]);
    setPortfolioDetails({});
    setAllTrades([]);
    setCurrentDateIdx(0);
    setActiveTab('overview');
    // Load data for the new strategy
    await loadStrategyData(s.scanName);
  };

  return (
    <div className="min-h-screen">
      {/* Top Navigation Bar */}
      <nav className="bg-[#0a0c14] border-b border-[#1a1d27]">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight text-white">OptionScope</span>
            <span className="text-xs text-[#8b8fa3] hidden sm:inline">Option Income Strategy</span>
          </div>
          <a
            href={MEMBER_PORTAL_URL}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-[#8b8fa3]
              hover:text-white hover:bg-[#1a1d27] transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            CycleScope Portal
          </a>
        </div>
      </nav>

    <div className="max-w-[1400px] mx-auto px-4 py-6">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
            ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="text-center mb-6">
        <h1 className="text-2xl font-bold mb-1">Option Income Strategy</h1>
        <p className="text-[#8b8fa3] text-sm">
          Automated option scanning with portfolio tracking
        </p>
      </header>

      {/* Strategy Selector */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            onClick={() => handleStrategyChange(s)}
            disabled={!s.enabled}
            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
              transition-all whitespace-nowrap border
              ${strategy.id === s.id && s.enabled
                ? 'text-white border-transparent'
                : s.enabled
                  ? 'bg-[#1a1d27] border-[#2a2e3a] text-[#8b8fa3] hover:text-white hover:border-[#3a3e4a]'
                  : 'bg-[#1a1d27]/50 border-[#2a2e3a]/50 text-[#8b8fa3]/50 cursor-not-allowed'
              }`}
            style={strategy.id === s.id && s.enabled ? { background: s.color } : undefined}
          >
            {!s.enabled && <Lock className="w-3 h-3" />}
            {s.name}
            {!s.enabled && (
              <span className="text-[10px] font-normal opacity-70">Soon</span>
            )}
          </button>
        ))}
      </div>

      {/* Strategy description */}
      <div className="text-center mb-6">
        <p className="text-sm text-[#8b8fa3]">{strategy.description}</p>
      </div>

      {/* Controls Row: View Tabs + Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Tab buttons */}
        <div className="flex bg-[#1a1d27] rounded-lg p-1">
          {(Object.entries(TAB_LABELS) as [ViewTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-all
                ${activeTab === key
                  ? 'text-white'
                  : 'text-[#8b8fa3] hover:text-white'
                }`}
              style={activeTab === key ? { background: strategy.color } : undefined}
            >
              {key === 'overview' && <List className="w-4 h-4 inline mr-1.5 -mt-0.5" />}
              {key === 'trades' && <TrendingUp className="w-4 h-4 inline mr-1.5 -mt-0.5" />}
              {key === 'comparison' && <BarChart3 className="w-4 h-4 inline mr-1.5 -mt-0.5" />}
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Action buttons (only shown when VITE_MANUAL_TRIGGER=true) */}
        {MANUAL_TRIGGER && (
          <>
            <button
              onClick={handleUpdatePnl}
              disabled={pnlLoading || scanLoading}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1d27] hover:bg-[#242836]
                border border-[#2a2e3a] rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            >
              {pnlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {pnlLoading ? 'Updating...' : 'Update P&L'}
            </button>

            <button
              onClick={handleRunScan}
              disabled={scanLoading || pnlLoading}
              className="flex items-center gap-2 px-4 py-2 hover:opacity-90
                rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
              style={{ background: strategy.color }}
            >
              {scanLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              {scanLoading ? 'Scanning...' : 'Run Scan & Build'}
            </button>
          </>
        )}
      </div>

      {/* Date Navigation (for overview tab) */}
      {activeTab === 'overview' && scanDates.length > 0 && (
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={handlePrevDate}
            disabled={currentDateIdx >= scanDates.length - 1 || loading}
            className="p-2 rounded-lg bg-[#1a1d27] hover:bg-[#242836] border border-[#2a2e3a]
              disabled:opacity-30 transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center min-w-[200px]">
            <div className="text-lg font-bold">{currentDate?.scanDate}</div>
            <div className="text-xs text-[#8b8fa3]">
              {currentDate?.scanName} - {currentDate?.resultCount} results
            </div>
          </div>
          <button
            onClick={handleNextDate}
            disabled={currentDateIdx <= 0 || loading}
            className="p-2 rounded-lg bg-[#1a1d27] hover:bg-[#242836] border border-[#2a2e3a]
              disabled:opacity-30 transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <span className="text-xs text-[#8b8fa3]">
            {currentDateIdx + 1} of {scanDates.length}
          </span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: strategy.color }} />
        </div>
      )}

      {/* No data placeholder */}
      {!loading && scanDates.length === 0 && activeTab === 'overview' && (
        <div className="text-center py-20">
          <p className="text-[#8b8fa3] text-lg mb-4">No scan data yet</p>
          <p className="text-[#8b8fa3] text-sm">
            Run a scan to get started with {strategy.name.toLowerCase()} analysis.
          </p>
        </div>
      )}

      {/* Overview tab */}
      {!loading && activeTab === 'overview' && scanDates.length > 0 && (
        <>
          <PortfolioCards
            portfolios={portfolios}
            portfolioDetails={portfolioDetails}
            onRefresh={() => currentDate && loadDateData(currentDate.scanDate)}
          />

          <ScanResultsPanel
            results={scanResults}
            scanDate={currentDate?.scanDate || ''}
            scanName={strategy.scanName}
            onDataChange={handleDataChange}
          />
        </>
      )}

      {/* Trades tab */}
      {activeTab === 'trades' && (
        <AllTradesTable trades={allTrades} />
      )}

      {/* Performance/Comparison tab */}
      {activeTab === 'comparison' && (
        <PerformanceChart scanName={strategy.scanName} />
      )}
    </div>
    </div>
  );
}
