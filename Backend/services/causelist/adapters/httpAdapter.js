/**
 * HTTP/External API Adapter stub for Cause List ingestion (Decision D1).
 * Reads URL and API Key from environment (.env).
 * If endpoint is not configured, provides a deterministic stub implementation.
 */
export class HttpAdapter {
  constructor({ url, apiKey } = {}) {
    this.url = url || process.env.CAUSELIST_API_URL || '';
    this.apiKey = apiKey || process.env.CAUSELIST_API_KEY || '';
  }

  async fetchEntries({ date }) {
    if (!date) throw new Error('Date is required for HTTP cause list fetch');

    // If external URL is configured, make real HTTP request
    if (this.url) {
      const targetUrl = new URL(this.url);
      targetUrl.searchParams.set('date', date);

      const headers = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

      const res = await fetch(targetUrl.toString(), { headers });
      if (!res.ok) {
        throw new Error(`External Cause List API error (${res.status}): ${await res.text()}`);
      }
      const data = await res.json();
      const rawRows = Array.isArray(data) ? data : data.entries || data.items || [];
      return rawRows.map((r, idx) => ({
        _rowIndex: idx + 1,
        _raw: r,
        causeListDate: r.causeListDate || date,
        courtNumber: String(r.courtNumber || r.court || '').trim(),
        bench: String(r.bench || r.judge || '').trim(),
        serialNumber: Number(r.serialNumber || r.serial || idx + 1),
        caseNumber: String(r.caseNumber || '').trim(),
        cino: String(r.cino || '').trim().toUpperCase(),
        caseType: String(r.caseType || '').trim().toUpperCase(),
        caseStatus: String(r.caseStatus || '').trim().toUpperCase(),
      }));
    }

    // Default stub data when URL not configured yet
    return [
      {
        _rowIndex: 1,
        _raw: { stub: true },
        causeListDate: date,
        courtNumber: '1',
        bench: 'Hon. Chief Justice Bench',
        serialNumber: 1,
        caseNumber: 'BAIL/2024/001',
        cino: 'UPHC010000012024',
        caseType: 'BAIL',
        caseStatus: 'PENDING',
      },
      {
        _rowIndex: 2,
        _raw: { stub: true },
        causeListDate: date,
        courtNumber: '4',
        bench: 'Court Room No. 4',
        serialNumber: 2,
        caseNumber: 'WTAX/2024/045',
        cino: 'UPHC010000022024',
        caseType: 'WTAX',
        caseStatus: 'PENDING',
      },
    ];
  }
}

