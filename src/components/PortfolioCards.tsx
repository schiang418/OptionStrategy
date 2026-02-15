import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { updatePortfolioPnl, type Portfolio, type PortfolioWithTrades } from '../api';

interface PortfolioCardsProps {
  portfolios: Portfolio[];
  portfolioDetails: Record<number, PortfolioWithTrades>;
  onRefresh: () => void;
}

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

function statusBadge(status: string) {
  const colors = status === 'active'
    ? 'bg-green-600/20 text-green-400'
    : 'bg-gray-600/20 text-gray-400';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors}`}>
      {status}
    </span>
  );
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

function PortfolioCard({
  portfolio,
  detail,
  onRefresh,
}: {
  portfolio: Portfolio;
  detail: PortfolioWithTrades | undefined;
  onRefresh: () => void;
}) {
  const trades = detail?.trades || [];
  const typeLabel = portfolio.type === 'top_return' ? 'Top Return' : 'Top Probability';
  const pnlPct = portfolio.initialCapital
    ? ((portfolio.netPnl / portfolio.initialCapital) * 100).toFixed(2)
    : '0.00';

  const [updating, setUpdating] = useState(false);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await updatePortfolioPnl(portfolio.id);
      onRefresh();
    } catch {}
    setUpdating(false);
  };

  return (
    <div className="bg-[#1a1d27] rounded-xl border border-[#2a2e3a] overflow-hidden">
      <div className="p-4 border-b border-[#2a2e3a]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">{typeLabel}</h3>
          <div className="flex items-center gap-2">
            {statusBadge(portfolio.status)}
            {portfolio.status === 'active' && (
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="p-1 rounded hover:bg-[#242836] transition-colors disabled:opacity-50"
                title="Update P&L"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#8b8fa3] ${updating ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-3">
            <div className="text-xs text-[#8b8fa3] mb-1">Initial Capital</div>
            <div className="text-sm font-bold">{fmtMoney(portfolio.initialCapital)}</div>
          </div>
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-3">
            <div className="text-xs text-[#8b8fa3] mb-1">Premium Collected</div>
            <div className="text-sm font-bold text-green-400">
              {fmtMoney(portfolio.totalPremiumCollected)}
            </div>
          </div>
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-3">
            <div className="text-xs text-[#8b8fa3] mb-1">Net P&L</div>
            <div className={`text-sm font-bold ${pnlColor(portfolio.netPnl)}`}>
              {fmtMoney(portfolio.netPnl)}
            </div>
          </div>
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-3">
            <div className="text-xs text-[#8b8fa3] mb-1">Return</div>
            <div className={`text-sm font-bold ${pnlColor(portfolio.netPnl)}`}>
              {pnlPct}%
            </div>
          </div>
        </div>
      </div>

      {trades.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#2a2e3a]">
                <th className="px-3 py-2 text-left text-xs text-[#8b8fa3] font-semibold">Ticker</th>
                <th className="px-3 py-2 text-left text-xs text-[#8b8fa3] font-semibold">Strikes</th>
                <th className="px-3 py-2 text-left text-xs text-[#8b8fa3] font-semibold">Exp</th>
                <th className="px-3 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Ctrs</th>
                <th className="px-3 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Premium</th>
                <th className="px-3 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Spread Val</th>
                <th className="px-3 py-2 text-right text-xs text-[#8b8fa3] font-semibold">P&L</th>
                <th className="px-3 py-2 text-center text-xs text-[#8b8fa3] font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-[#2a2e3a]/50 hover:bg-[#242836] ${
                    t.isItm ? 'bg-yellow-900/10' : ''
                  }`}
                >
                  <td className="px-3 py-1.5 font-bold font-mono">
                    {t.ticker}
                    {t.isItm && (
                      <span className="ml-1 text-yellow-400 text-[10px]">ITM</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[#8b8fa3]">
                    {fmtStrike(t.sellStrike)}/{fmtStrike(t.buyStrike)}
                  </td>
                  <td className="px-3 py-1.5">{t.expirationDate}</td>
                  <td className="px-3 py-1.5 text-right">{t.contracts}</td>
                  <td className="px-3 py-1.5 text-right text-green-400">
                    {fmtMoney(t.premiumCollected * t.contracts)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {t.currentSpreadValue != null
                      ? fmtMoney(t.currentSpreadValue * t.contracts)
                      : '-'}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-medium ${pnlColor(t.currentPnl)}`}>
                    {fmtMoney(t.currentPnl)}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {tradeStatusBadge(t.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PortfolioCards({ portfolios, portfolioDetails, onRefresh }: PortfolioCardsProps) {
  if (portfolios.length === 0) {
    return (
      <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-6 text-center mb-6">
        <p className="text-[#8b8fa3]">
          No portfolios for this scan date. Portfolios are created automatically when a scan runs.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {portfolios.map((p) => (
        <PortfolioCard
          key={p.id}
          portfolio={p}
          detail={portfolioDetails[p.id]}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}
