const BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Scan dates
export function fetchScanDates() {
  return fetchJSON<Array<{ scanDate: string; scanName: string; resultCount: number }>>(
    '/option-scans/dates'
  );
}

// Scan results for a date
export function fetchScanResults(date: string) {
  return fetchJSON<any[]>(`/option-scans/${date}`);
}

// Delete scan data
export function deleteScanData(date: string) {
  return fetchJSON<{ success: boolean; deletedCount: number }>(`/option-scans/${date}`, {
    method: 'DELETE',
  });
}

// Portfolios
export function fetchPortfolios() {
  return fetchJSON<any[]>('/option-portfolios');
}

// Portfolio detail
export function fetchPortfolioDetail(id: number) {
  return fetchJSON<any>(`/option-portfolios/${id}`);
}

// Portfolio history
export function fetchPortfolioHistory(id: number) {
  return fetchJSON<any[]>(`/option-portfolios/${id}/history`);
}

// Update P&L
export function updatePnl() {
  return fetchJSON<{ success: boolean; message: string }>('/option-portfolios/update-pnl', {
    method: 'POST',
  });
}

// Run scan
export function runScan() {
  return fetchJSON<any>('/option-automation/scan', { method: 'POST' });
}

// Run Monday workflow
export function runMondayWorkflow() {
  return fetchJSON<any>('/option-automation/monday-workflow', { method: 'POST' });
}

// Test login
export function testLogin() {
  return fetchJSON<{ success: boolean; message: string }>('/option-automation/test-login', {
    method: 'POST',
  });
}
