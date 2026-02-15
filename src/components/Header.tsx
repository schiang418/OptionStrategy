import React, { useState } from 'react';
import { runMondayWorkflow, updatePnl } from '../api';

interface HeaderProps {
  lastScanDate: string | null;
  onRefresh: () => void;
}

export default function Header({ lastScanDate, onRefresh }: HeaderProps) {
  const [scanning, setScanning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleScan() {
    setScanning(true);
    setMessage(null);
    try {
      const result = await runMondayWorkflow();
      setMessage(result.message || 'Scan complete');
      onRefresh();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setScanning(false);
    }
  }

  async function handleUpdatePnl() {
    setUpdating(true);
    setMessage(null);
    try {
      const result = await updatePnl();
      setMessage(result.message || 'P&L updated');
      onRefresh();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <header className="bg-[#161822] border-b border-gray-800 px-4 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Option Income Strategy</h1>
          {lastScanDate && (
            <p className="text-sm text-gray-400 mt-1">
              Last scan: {lastScanDate}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {message && (
            <span className={`text-sm ${message.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {message}
            </span>
          )}

          <button
            onClick={handleUpdatePnl}
            disabled={updating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            {updating ? 'Updating...' : 'Update P&L'}
          </button>

          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            {scanning ? 'Scanning...' : 'Run Scan & Build Portfolios'}
          </button>
        </div>
      </div>
    </header>
  );
}
