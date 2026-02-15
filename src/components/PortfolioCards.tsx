import React from 'react';

interface PortfolioCardsProps {
  portfolios: any[];
  portfolioDetails: Record<number, any>;
}

function formatMoney(val: number | null | undefined): string {
  if (val == null) return '$0.00';
  return val < 0 ? `-$${Math.abs(val).toFixed(2)}` : `$${val.toFixed(2)}`;
}

function pnlColor(val: number | null | undefined): string {
  if (val == null || val === 0) return 'text-gray-300';
  return val > 0 ? 'text-green-400' : 'text-red-400';
}

function statusBadge(status: string) {
  const colors =
    status === 'active'
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
      {status.replace('_', ' ')}
    </span>
  );
}

function PortfolioCard({ portfolio, detail }: { portfolio: any; detail: any }) {
  const trades = detail?.trades || [];
  const typeLabel = portfolio.type === 'top_return' ? 'Top Return' : 'Top Probability';
  const pnlPct = portfolio.initialCapital
    ? ((portfolio.netPnl / portfolio.initialCapital) * 100).toFixed(2)
    : '0.00';

  return (
    <div className="bg-[#161822] rounded-lg border border-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">{typeLabel}</h3>
          {statusBadge(portfolio.status)}
        </div>
        <div className="text-sm text-gray-400 mb-3">
          Scan: {portfolio.scanDate}
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-400">Premium</div>
            <div className="text-green-400 font-medium">
              {formatMoney(portfolio.totalPremiumCollected)}
            </div>
          </div>
          <div>
            <div className="text-gray-400">Current P&L</div>
            <div className={`font-medium ${pnlColor(portfolio.netPnl)}`}>
              {formatMoney(portfolio.netPnl)}
            </div>
          </div>
          <div>
            <div className="text-gray-400">P&L %</div>
            <div className={`font-medium ${pnlColor(portfolio.netPnl)}`}>
              {pnlPct}%
            </div>
          </div>
        </div>
      </div>

      {trades.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left py-2 px-3">Ticker</th>
                <th className="text-left py-2 px-3">Strikes</th>
                <th className="text-left py-2 px-3">Exp</th>
                <th className="text-right py-2 px-3">Ctrs</th>
                <th className="text-right py-2 px-3">Premium</th>
                <th className="text-right py-2 px-3">Cur Value</th>
                <th className="text-right py-2 px-3">P&L</th>
                <th className="text-center py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t: any) => (
                <tr
                  key={t.id}
                  className={`border-b border-gray-800/50 hover:bg-[#1a1c2e] ${
                    t.isItm ? 'bg-yellow-900/10' : ''
                  }`}
                >
                  <td className="py-1.5 px-3 font-medium text-white">
                    {t.ticker}
                    {t.isItm ? (
                      <span className="ml-1 text-yellow-400 text-[10px]">ITM</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 px-3">
                    {t.sellStrike}/{t.buyStrike}
                  </td>
                  <td className="py-1.5 px-3">{t.expirationDate}</td>
                  <td className="py-1.5 px-3 text-right">{t.contracts}</td>
                  <td className="py-1.5 px-3 text-right text-green-400">
                    {formatMoney(t.premiumCollected)}
                  </td>
                  <td className="py-1.5 px-3 text-right">
                    {formatMoney(t.currentSpreadValue)}
                  </td>
                  <td className={`py-1.5 px-3 text-right font-medium ${pnlColor(t.currentPnl)}`}>
                    {formatMoney(t.currentPnl)}
                  </td>
                  <td className="py-1.5 px-3 text-center">
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

export default function PortfolioCards({ portfolios, portfolioDetails }: PortfolioCardsProps) {
  if (portfolios.length === 0) {
    return null;
  }

  // Group by scan date
  const grouped: Record<string, any[]> = {};
  for (const p of portfolios) {
    const key = p.scanDate;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }

  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">Portfolios</h2>
      {Object.entries(grouped).map(([scanDate, group]) => (
        <div key={scanDate} className="mb-6">
          <h3 className="text-sm text-gray-400 mb-3">Scan Date: {scanDate}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {group.map(p => (
              <PortfolioCard
                key={p.id}
                portfolio={p}
                detail={portfolioDetails[p.id]}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
