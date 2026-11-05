import 'dotenv/config';

const API_BASE = 'http://localhost:4000/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, headers: res.headers, data };
}

let passed = 0;
let failed = 0;

function assert(condition, name, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name} ${details ? `(${details})` : ''}`);
    failed++;
  }
}

async function runPhase2Tests() {
  console.log('=====================================================');
  console.log('🧪 RUNNING PHASE 2 FILTERS & SEARCH API TEST SUITE');
  console.log('=====================================================\n');

  // Step 0: Login
  const loginRes = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  });
  const token = loginRes.data.token;
  assert(Boolean(token), 'Admin login successful for Phase 2 tests');
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 1. Distinct case-types
  console.log('\n▶ [1] GET /api/files/case-types');
  const typesRes = await request('/files/case-types', { headers: authHeaders });
  assert(
    typesRes.status === 200 &&
      Array.isArray(typesRes.data) &&
      typesRes.data.includes('BAIL') &&
      typesRes.data.includes('WTAX'),
    'Returns distinct sorted case types',
    JSON.stringify(typesRes.data)
  );

  // 2. Individual filters
  console.log('\n▶ [2] Individual Filter Checks on /api/files');

  // No filters: backward compatibility
  const noFilterRes = await request('/files', { headers: authHeaders });
  assert(
    noFilterRes.status === 200 && Array.isArray(noFilterRes.data.items),
    'No filters returns all files without breaking response shape'
  );

  // mapped=true
  const mappedRes = await request('/files?mapped=true', { headers: authHeaders });
  assert(
    mappedRes.status === 200 &&
      mappedRes.data.items.length > 0 &&
      mappedRes.data.items.every((f) => Boolean(f.rfidTag && f.rfidMapped === true)),
    'mapped=true returns only files with non-empty rfidTag'
  );

  // mapped=false
  const unmappedRes = await request('/files?mapped=false', { headers: authHeaders });
  assert(
    unmappedRes.status === 200 &&
      unmappedRes.data.items.length > 0 &&
      unmappedRes.data.items.every((f) => !f.rfidTag && f.rfidMapped === false),
    'mapped=false returns only files without rfidTag'
  );

  // status=PENDING
  const pendingRes = await request('/files?status=PENDING', { headers: authHeaders });
  assert(
    pendingRes.status === 200 &&
      pendingRes.data.items.length > 0 &&
      pendingRes.data.items.every((f) => f.caseStatus === 'PENDING'),
    'status=PENDING returns only pending files'
  );

  // status=DISPOSED
  const disposedRes = await request('/files?status=DISPOSED', { headers: authHeaders });
  assert(
    disposedRes.status === 200 &&
      disposedRes.data.items.length > 0 &&
      disposedRes.data.items.every((f) => f.caseStatus === 'DISPOSED'),
    'status=DISPOSED returns only disposed files'
  );

  // caseType=BAIL
  const bailRes = await request('/files?caseType=BAIL', { headers: authHeaders });
  assert(
    bailRes.status === 200 &&
      bailRes.data.items.length > 0 &&
      bailRes.data.items.every((f) => f.caseType === 'BAIL'),
    'caseType=BAIL returns only BAIL files'
  );

  // q match on caseNumber
  const qCaseNoRes = await request('/files?q=BAIL/2024/001', { headers: authHeaders });
  assert(
    qCaseNoRes.status === 200 &&
      qCaseNoRes.data.items.length === 1 &&
      qCaseNoRes.data.items[0].caseNumber === 'BAIL/2024/001',
    'q matches on caseNumber'
  );

  // q match on cino
  const qCinoRes = await request('/files?q=UPHC010000012024', { headers: authHeaders });
  assert(
    qCinoRes.status === 200 &&
      qCinoRes.data.items.length === 1 &&
      qCinoRes.data.items[0].cino === 'UPHC010000012024',
    'q matches on cino'
  );

  // q match on fileNumber
  const qFileNoRes = await request('/files?q=1001/2024', { headers: authHeaders });
  assert(
    qFileNoRes.status === 200 &&
      qFileNoRes.data.items.length === 1 &&
      qFileNoRes.data.items[0].fileNumber === '1001/2024',
    'q matches on fileNumber'
  );

  // 3. Combined filters (AND logic)
  console.log('\n▶ [3] All 4 Filters Combined');
  const combinedRes = await request(
    '/files?mapped=true&status=PENDING&caseType=BAIL&q=1001',
    { headers: authHeaders }
  );
  assert(
    combinedRes.status === 200 &&
      combinedRes.data.items.length === 1 &&
      combinedRes.data.items[0].fileId === 'AHC-F-1001',
    'All 4 filters together (mapped, status, caseType, q) correctly intersect'
  );

  // 4. Pending mapping endpoint & auto-removal
  console.log('\n▶ [4] GET /api/files/pending-mapping & Auto-Removal Flow');
  const pendingInitial = await request('/files/pending-mapping', { headers: authHeaders });
  assert(
    pendingInitial.status === 200 &&
      pendingInitial.data.items.every((f) => f.rfidMapped === false),
    'pending-mapping returns only unmapped files'
  );
  const initialUnmappedCount = pendingInitial.data.total;

  // Create an unmapped test file
  const testFileId = `UNMAPPED-TEST-${Date.now()}`;
  await request('/files', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fileId: testFileId,
      fileName: 'Unmapped Dynamic File',
      caseId: 'CASE-DYN',
      caseType: 'BAIL',
      caseStatus: 'PENDING',
    }),
  });

  const pendingAfterCreate = await request('/files/pending-mapping', { headers: authHeaders });
  assert(
    pendingAfterCreate.data.total === initialUnmappedCount + 1 &&
      pendingAfterCreate.data.items.some((f) => f.fileId === testFileId),
    'Newly created file without tag automatically appears in pending-mapping'
  );

  // Now assign an RFID tag to the file
  const assignedTag = `E28068EA${Math.floor(Math.random() * 10000000)}`;
  await request(`/files/${testFileId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ rfidTag: assignedTag, reason: 'Assigned tag' }),
  });

  // Verify file automatically left the pending-mapping list
  const pendingAfterAssign = await request('/files/pending-mapping', { headers: authHeaders });
  assert(
    pendingAfterAssign.data.total === initialUnmappedCount &&
      !pendingAfterAssign.data.items.some((f) => f.fileId === testFileId),
    'File automatically leaves pending-mapping once rfidTag is assigned'
  );

  // Cleanup test file
  await request(`/files/${testFileId}`, { method: 'DELETE', headers: authHeaders });

  // 5. Security & Injection Resistance
  console.log('\n▶ [5] Security & Input Validation Checks');

  // Regex special chars in q
  const regexParenRes = await request('/files?q=(*', { headers: authHeaders });
  assert(regexParenRes.status === 200, 'Regex syntax "(" in q does not crash or throw 500');

  const regexDotStarRes = await request('/files?q=.*', { headers: authHeaders });
  assert(
    regexDotStarRes.status === 200 && regexDotStarRes.data.items.length === 0,
    'Regex ".*" in q is escaped and does not match all documents'
  );

  // Invalid enum values return 400
  const invalidStatusRes = await request('/files?status=SOMETHING_ELSE', { headers: authHeaders });
  assert(invalidStatusRes.status === 400, 'Invalid status returns 400');

  const invalidCaseTypeRes = await request('/files?caseType=NONEXISTENT_TYPE', { headers: authHeaders });
  assert(invalidCaseTypeRes.status === 400, 'Non-existent caseType returns 400');

  const invalidMappedRes = await request('/files?mapped=maybe', { headers: authHeaders });
  assert(invalidMappedRes.status === 400, 'Invalid mapped value returns 400');

  const invalidSortRes = await request('/files?sort=passwordHash', { headers: authHeaders });
  assert(invalidSortRes.status === 400, 'Non-whitelisted sort field returns 400');

  // NoSQL injection query params (objects)
  const injectionQRes = await request('/files?q[$ne]=test', { headers: authHeaders });
  assert(injectionQRes.status === 400, 'NoSQL injection on ?q[$ne]= rejected with 400');

  const injectionMappedRes = await request('/files?mapped[$gt]=', { headers: authHeaders });
  assert(injectionMappedRes.status === 400, 'NoSQL injection on ?mapped[$gt]= rejected with 400');

  const injectionStatusRes = await request('/files?status[$ne]=x', { headers: authHeaders });
  assert(injectionStatusRes.status === 400, 'NoSQL injection on ?status[$ne]= rejected with 400');

  const injectionCaseTypeRes = await request('/files?caseType[$ne]=x', { headers: authHeaders });
  assert(injectionCaseTypeRes.status === 400, 'NoSQL injection on ?caseType[$ne]= rejected with 400');

  console.log(`\n=====================================================`);
  console.log(`📊 PHASE 2 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log(`=====================================================`);

  if (failed > 0) process.exit(1);
}

runPhase2Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
