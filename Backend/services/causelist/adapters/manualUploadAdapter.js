import * as XLSX from 'xlsx';

function normalizeKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

const ALIASES = {
  causelistdate: 'causeListDate',
  date: 'causeListDate',
  listdate: 'causeListDate',
  court: 'courtNumber',
  courtnumber: 'courtNumber',
  courtno: 'courtNumber',
  bench: 'bench',
  judge: 'bench',
  serial: 'serialNumber',
  serialnumber: 'serialNumber',
  srno: 'serialNumber',
  sno: 'serialNumber',
  casenumber: 'caseNumber',
  caseno: 'caseNumber',
  cino: 'cino',
  cinoo: 'cino',
  casetype: 'caseType',
  type: 'caseType',
  casestatus: 'caseStatus',
  status: 'caseStatus',
};

function formatExcelOrStringDate(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    // DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY (common in Indian court exports)
    const dmy = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmy) {
      const [, dd, mm, yyyy] = dmy;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    // YYYY/MM/DD
    const ymd = trimmed.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
    if (ymd) {
      const [, yyyy, mm, dd] = ymd;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    const num = Number(trimmed);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      // Excel serial date to Asia/Kolkata date string (D5)
      const utcMs = Math.round((num - 25569) * 86400 * 1000);
      const kolkataDate = new Date(utcMs + 5.5 * 3600 * 1000);
      return kolkataDate.toISOString().slice(0, 10);
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const kolkataDate = new Date(d.getTime() + 5.5 * 3600 * 1000);
      return kolkataDate.toISOString().slice(0, 10);
    }
    return trimmed;
  }
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const utcMs = Math.round((val - 25569) * 86400 * 1000);
    const kolkataDate = new Date(utcMs + 5.5 * 3600 * 1000);
    return kolkataDate.toISOString().slice(0, 10);
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    const kolkataDate = new Date(val.getTime() + 5.5 * 3600 * 1000);
    return kolkataDate.toISOString().slice(0, 10);
  }
  return String(val).trim();
}

export class ManualUploadAdapter {
  /**
   * @param {Buffer} buffer - File buffer (XLSX, XLS, CSV, or JSON)
   * @param {string} originalName - Name of the uploaded file
   */
  constructor(buffer, originalName = '') {
    this.buffer = buffer;
    this.originalName = originalName;
  }

  async fetchEntries({ defaultDate } = {}) {
    if (!this.buffer || !this.buffer.length) {
      throw new Error('Upload buffer is empty');
    }

    let rawRows = [];
    const isJson = this.originalName.toLowerCase().endsWith('.json');

    if (isJson) {
      try {
        const text = this.buffer.toString('utf-8');
        const parsed = JSON.parse(text);
        rawRows = Array.isArray(parsed) ? parsed : parsed.items || parsed.rows || [parsed];
      } catch (err) {
        throw new Error(`Invalid JSON file: ${err.message}`);
      }
    } else {
      let workbook;
      try {
        workbook = XLSX.read(this.buffer, { type: 'buffer', raw: true });
      } catch (err) {
        throw new Error(`Unable to read spreadsheet: ${err.message}`);
      }
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('Uploaded sheet has no worksheets');
      rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    }

    return rawRows.map((raw, idx) => {
      const mapped = {};
      for (const [key, val] of Object.entries(raw)) {
        const canonical = ALIASES[normalizeKey(key)];
        if (canonical) mapped[canonical] = typeof val === 'string' ? val.trim() : val;
      }

      // Format date if present or fallback to defaultDate
      let rowDate = formatExcelOrStringDate(mapped.causeListDate);
      if (!rowDate && defaultDate) {
        rowDate = defaultDate;
      }

      return {
        _rowIndex: idx + 2,
        _raw: raw,
        causeListDate: rowDate,
        courtNumber: mapped.courtNumber ? String(mapped.courtNumber).trim() : '',
        bench: mapped.bench ? String(mapped.bench).trim() : '',
        serialNumber: Number(mapped.serialNumber),
        caseNumber: mapped.caseNumber ? String(mapped.caseNumber).trim() : '',
        cino: mapped.cino ? String(mapped.cino).trim().toUpperCase() : '',
        caseType: mapped.caseType ? String(mapped.caseType).trim().toUpperCase() : '',
        caseStatus: mapped.caseStatus ? String(mapped.caseStatus).trim().toUpperCase() : '',
      };
    });
  }
}
