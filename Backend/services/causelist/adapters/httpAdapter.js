/**
 * HTTP/External API Adapter for Cause List ingestion (Decision D1).
 * Reads URL and API Key from environment (.env).
 *
 * This adapter NEVER fabricates data. If CAUSELIST_API_URL is not configured,
 * isConfigured() returns false and fetchEntries() throws, so no placeholder
 * cause list rows can ever reach the database.
 */
export class HttpAdapter {
  constructor({ url, apiKey } = {}) {
    this.url = url || process.env.CAUSELIST_API_URL || '';
    this.apiKey = apiKey || process.env.CAUSELIST_API_KEY || '';
  }

  isConfigured() {
    return Boolean(this.url);
  }

  async fetchEntries({ date }) {
    if (!date) throw new Error('Date is required for HTTP cause list fetch');
    if (!this.isConfigured()) {
      throw new Error(
        'External Cause List API is not configured (CAUSELIST_API_URL is empty). Upload a cause list file instead.'
      );
    }

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
}
