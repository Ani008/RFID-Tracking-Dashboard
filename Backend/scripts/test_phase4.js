import 'dotenv/config';
import mongoose from 'mongoose';
import File from '../models/File.js';
import CauseListEntry from '../models/CauseListEntry.js';
import SyncRun from '../models/SyncRun.js';

const API_BASE = 'http://localhost:4000/api';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid-tracker';

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

async function runPhase4Tests() {
  console.log('=====================================================');
  console.log('🧪 RUNNING PHASE 4 CAUSE LIST & SYNC TEST SUITE');
  console.log('=====================================================\n');

  await mongoose.connect(MONGODB_URI);
  await CauseListEntry.syncIndexes();
  await SyncRun.syncIndexes();

  // Step 0: Get tokens
  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  });
  const adminToken = adminLogin.data.token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  const staffLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'staff', password: 'Staff@123' }),
  });
  const staffToken = staffLogin.data.token;
  const staffHeaders = { Authorization: `Bearer ${staffToken}` };

  // 1. Staff RBAC checks (Staff cannot sync, retry, rematch)
  console.log('▶ [1] RBAC Protection on Cause List Operations');
  const staffSync = await request('/causelist/sync', {
    method: 'POST',
    headers: staffHeaders,
    body: JSON.stringify({ date: '2026-11-10' }),
  });
  assert(staffSync.status === 403, 'Staff blocked from triggering sync (403 Forbidden)');

  const staffRetry = await request('/causelist/sync/dummy-id/retry', {
    method: 'POST',
    headers: staffHeaders,
  });
  assert(staffRetry.status === 403, 'Staff blocked from triggering retry (403 Forbidden)');

  const staffRematch = await request('/causelist/rematch', {
    method: 'POST',
    headers: staffHeaders,
  });
  assert(staffRematch.status === 403, 'Staff blocked from triggering rematch (403 Forbidden)');

  // 2. Clear test cause list data and count files before sync
  await CauseListEntry.deleteMany({});
  await SyncRun.deleteMany({});
  const initialFilesCount = await File.countDocuments({});

  // 3. Trigger sync via JSON/HTTP stub adapter
  console.log('\n▶ [2] First Cause List Sync (Insertions & Matching)');
  const syncDate = '2026-11-10';
  const syncRes1 = await request('/causelist/sync', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ date: syncDate }),
  });
  assert(
    syncRes1.status === 201 && syncRes1.data.status === 'SUCCESS',
    'Initial sync run succeeds',
    JSON.stringify(syncRes1.data)
  );
  assert(
    syncRes1.data.counts.inserted === 2 && syncRes1.data.counts.updated === 0,
    'First run reports 2 inserted entries and 0 updated'
  );

  // 4. Test Idempotency: Run same sync again
  console.log('\n▶ [3] Idempotent Second Sync (No Duplicates)');
  const syncRes2 = await request('/causelist/sync', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ date: syncDate }),
  });
  assert(
    syncRes2.status === 201 &&
      syncRes2.data.counts.inserted === 0 &&
      syncRes2.data.counts.updated === 2,
    'Second run reports 0 inserted and 2 updated (idempotent)',
    JSON.stringify(syncRes2.data)
  );

  const totalEntries = await CauseListEntry.countDocuments({});
  assert(totalEntries === 2, 'Total CauseListEntry count remains 2 (no duplicates)');

  // 5. Test File count invariant (File count must never change from sync)
  const filesCountAfterSync = await File.countDocuments({});
  assert(filesCountAfterSync === initialFilesCount, 'File collection count is completely unchanged by sync');

  // 6. Test Multi-date and Multi-court appearance for the same CINO
  console.log('\n▶ [4] Case History across multiple dates and courts');
  // Insert entry on date 2 in Court 2 for same CINO
  await CauseListEntry.create({
    causeListDate: '2026-11-11',
    courtNumber: '2',
    bench: 'Court 2 Bench',
    serialNumber: 15,
    caseNumber: 'BAIL/2024/001',
    cino: 'UPHC010000012024',
    dedupeKey: 'UPHC010000012024',
    matchStatus: 'MATCHED',
    firstSeenAt: new Date(),
    lastSyncedAt: new Date(),
  });

  const historyRes = await request('/causelist/history/UPHC010000012024', {
    headers: staffHeaders,
  });
  assert(
    historyRes.status === 200 && historyRes.data.totalAppearances === 2,
    'History endpoint returns all appearances across different dates/courts for CINO'
  );

  // 7. Test UNMATCHED (unknown CINO) and AMBIGUOUS (duplicate caseNumber without CINO)
  console.log('\n▶ [5] Match Status: UNMATCHED vs AMBIGUOUS');
  // Create two files with the same caseNumber to simulate ambiguity
  const ambigCaseNo = `AMBIG/${Date.now()}`;
  await File.create({
    fileId: `AMBIG-F1-${Date.now()}`,
    fileName: 'Ambiguous 1',
    caseId: 'CASE-AMBIG-1',
    caseNumber: ambigCaseNo,
    caseType: 'CIVIL',
  });
  await File.create({
    fileId: `AMBIG-F2-${Date.now()}`,
    fileName: 'Ambiguous 2',
    caseId: 'CASE-AMBIG-2',
    caseNumber: ambigCaseNo,
    caseType: 'CIVIL',
  });

  // Upload synthetic entries with one unknown CINO and one ambiguous caseNumber
  const syntheticCsv = [
    'causeListDate,courtNumber,bench,serialNumber,caseNumber,cino,caseType,caseStatus',
    `2026-11-12,5,Bench 5,1,,UPHC999999999999,BAIL,PENDING`, // Unknown CINO -> UNMATCHED
    `2026-11-12,5,Bench 5,2,${ambigCaseNo},,CIVIL,PENDING`,  // Ambiguous caseNo -> AMBIGUOUS
    `2026-11-12,5,Bench 5,-1,,,BAIL,PENDING`,               // Invalid serial -> failure row
  ].join('\n');

  const formData = new FormData();
  formData.append('file', new Blob([syntheticCsv], { type: 'text/csv' }), 'test-causelist.csv');

  const uploadRes = await fetch(`${API_BASE}/causelist/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: formData,
  });
  const uploadData = await uploadRes.json();

  assert(
    uploadRes.status === 201 && uploadData.status === 'PARTIAL',
    'Sync with a bad row reports PARTIAL status'
  );
  assert(
    uploadData.counts.unmatched >= 1,
    'Unknown CINO categorized as UNMATCHED'
  );
  assert(
    uploadData.counts.ambiguous >= 1,
    'Duplicate caseNumber categorized as AMBIGUOUS'
  );
  assert(
    uploadData.failures.length === 1,
    'Invalid row captured in failures array without crashing run'
  );

  // 8. Test Retry endpoint for the failed run
  console.log('\n▶ [6] Retry Failed Rows Endpoint');
  const runId = uploadData._id;
  const retryRes = await request(`/causelist/sync/${runId}/retry`, {
    method: 'POST',
    headers: adminHeaders,
  });
  assert(
    retryRes.status === 200,
    'Retry endpoint processes failed rows and returns report'
  );

  // 9. Test Rematch endpoint
  console.log('\n▶ [7] Rematch Endpoint');
  const rematchRes = await request('/causelist/rematch', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ date: '2026-11-12' }),
  });
  assert(
    rematchRes.status === 200 && rematchRes.data.rematchedCount >= 2,
    'Rematch re-evaluates all unmatched and ambiguous rows'
  );

  // Cleanup test files
  await File.deleteMany({ caseNumber: ambigCaseNo });
  await mongoose.disconnect();

  console.log(`\n=====================================================`);
  console.log(`📊 PHASE 4 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log(`=====================================================`);

  if (failed > 0) process.exit(1);
}

runPhase4Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

