/**
 * Case types that always appear in the Case Type dropdowns, even before any
 * file or cause list row exists. Configure with CASE_TYPES in .env
 * (comma separated, e.g. CASE_TYPES=WTAX,BAIL,CRLR,WRIT). Types that appear
 * in real data are merged in automatically.
 */
export function configuredCaseTypes() {
  const raw = process.env.CASE_TYPES || 'WTAX,BAIL';
  return raw
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

export function mergeCaseTypes(...lists) {
  const set = new Set();
  for (const list of [configuredCaseTypes(), ...lists]) {
    for (const t of list || []) {
      if (typeof t === 'string' && t.trim()) set.add(t.trim().toUpperCase());
    }
  }
  return [...set].sort();
}
