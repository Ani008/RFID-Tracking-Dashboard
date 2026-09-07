import 'dotenv/config';
import { io as ioClient } from 'socket.io-client';

const API_BASE = 'http://localhost:4000/api';
const SOCKET_URL = 'http://localhost:4000';

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
    console.error(`  ❌ [FAIL] ${name} ${details ? `- ${details}` : ''}`);
    failed++;
  }
}

async function runFullTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING COMPREHENSIVE END-TO-END TEST SUITE (ALL MODULES)');
  console.log('================================================================\n');

  // ==========================================
  // SECTION 1: AUTHENTICATION & TOKENS
  // ==========================================
  console.log('▶ [1] AUTHENTICATION & ACCESS CONTROL');
  
  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  });
  const adminToken = adminLogin.data.token;
  assert(adminLogin.status === 200 && adminLogin.data.user.role === 'admin', 'Admin authenticated and JWT issued');

  const staffLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'staff', password: 'Staff@123' }),
  });
  const staffToken = staffLogin.data.token;
  assert(staffLogin.status === 200 && staffLogin.data.user.role === 'staff', 'Staff authenticated and JWT issued');

  const invalidLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'WrongPassword' }),
  });
  assert(invalidLogin.status === 400, 'Invalid password rejected with generic error');

  const nosqlInject = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: { $ne: null }, password: { $ne: null } }),
  });
  assert(nosqlInject.status === 400, 'NoSQL query injection payload rejected');

  const unauthMe = await request('/auth/me');
  assert(unauthMe.status === 401, 'Unauthenticated request to /auth/me rejected');

  const authMe = await request('/auth/me', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(authMe.status === 200 && authMe.data.user.username === 'admin', 'GET /auth/me returns authenticated identity');
  assert(authMe.data.user.passwordHash === undefined, 'Password hash is completely excluded from user profile');

  // ==========================================
  // SECTION 2: SOCKET.IO AUTHENTICATED HANDSHAKE
  // ==========================================
  console.log('\n▶ [2] REAL-TIME WEBSOCKET (SOCKET.IO) AUTHENTICATION');
  
  await new Promise((resolve) => {
    const unauthSocket = ioClient(SOCKET_URL, { transports: ['websocket'], reconnection: false, timeout: 2000 });
    unauthSocket.on('connect_error', (err) => {
      assert(err.message.includes('Authentication required'), 'Unauthenticated socket rejected on handshake');
      unauthSocket.disconnect();

      const authSocket = ioClient(SOCKET_URL, {
        auth: { token: staffToken },
        transports: ['websocket'],
        reconnection: false,
        timeout: 2000,
      });
      authSocket.on('connect', () => {
        assert(true, 'Staff socket connected and authenticated successfully');
        authSocket.disconnect();
        resolve();
      });
      authSocket.on('connect_error', (err2) => {
        assert(false, 'Authenticated socket failed to connect', err2.message);
        authSocket.disconnect();
        resolve();
      });
    });
  });

  // ==========================================
  // SECTION 3: ROLE-BASED ACCESS CONTROL (RBAC)
  // ==========================================
  console.log('\n▶ [3] ROLE-BASED ACCESS CONTROL (STAFF RESTRICTIONS)');
  
  const staffFileCreate = await request('/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: JSON.stringify({ fileId: 'TEST-F-01', fileName: 'Test', caseId: 'CASE-01', caseName: 'Test', rfidTag: 'EPC000000001' }),
  });
  assert(staffFileCreate.status === 403, 'Staff blocked from creating files (403 Forbidden)');

  const staffUserList = await request('/users', {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert(staffUserList.status === 403, 'Staff blocked from accessing user accounts (403 Forbidden)');

  // ==========================================
  // SECTION 4: FILE REGISTRATION & RECORD EDITING (STAGE 2)
  // ==========================================
  console.log('\n▶ [4] FILE MANAGEMENT, EDITING & AUDIT TRAIL');

  const testFileId = `AHC-TEST-${Date.now()}`;
  const testCaseId = `CASE-TEST-${Date.now()}`;
  const testEpc = `E28068TEST${Math.floor(Math.random() * 100000000)}`;

  const createFileRes = await request('/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      fileId: testFileId,
      fileName: 'State vs. Test Subject - Volume 1',
      caseId: testCaseId,
      caseName: 'State vs. Test Subject',
      rfidTag: testEpc,
      currentLocation: 'SHELF_ROOM',
    }),
  });
  assert(createFileRes.status === 201, `Admin registered new file "${testFileId}"`);

  // Edit file metadata
  const editRes = await request(`/files/${testFileId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      fileName: 'State vs. Test Subject - Volume 1 (Revised Title)',
      caseName: 'State vs. Test Subject (Appellate)',
      reason: 'Typo corrected by Admin',
    }),
  });
  assert(editRes.status === 200 && editRes.data.fileName.includes('Revised Title'), 'Admin successfully edited file metadata');

  // Reassign RFID Tag
  const newEpc = `E28068NEW${Math.floor(Math.random() * 100000000)}`;
  const tagReassignRes = await request(`/files/${testFileId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      rfidTag: newEpc,
      reason: 'Replaced damaged RFID tag',
    }),
  });
  assert(tagReassignRes.status === 200 && tagReassignRes.data.rfidTag === newEpc, 'Admin reassigned physical RFID EPC tag');

  // Verify Audit Trail is recorded
  const fileDetailRes = await request(`/files/${testFileId}`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  const hasAuditLogs = fileDetailRes.data.auditTrail && fileDetailRes.data.auditTrail.length >= 2;
  assert(hasAuditLogs, `Audit trail recorded ${fileDetailRes.data.auditTrail?.length} immutable events with author info`);

  // Attempt duplicate RFID tag assignment
  const dupTagRes = await request('/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      fileId: `AHC-DUP-${Date.now()}`,
      fileName: 'Duplicate Tag File',
      caseId: 'CASE-01',
      caseName: 'Test Case',
      rfidTag: newEpc, // Already used above
    }),
  });
  assert(dupTagRes.status === 409, 'Duplicate RFID EPC tag rejected with 409 Conflict');

  // Attempt direct location mutation via edit (Must be blocked)
  const locMutationRes = await request(`/files/${testFileId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      currentLocation: 'COURT_ROOM',
    }),
  });
  assert(locMutationRes.status === 400, 'Direct location tampering via metadata edit blocked (400 Bad Request)');

  // ==========================================
  // SECTION 5: MOVEMENT PROCESSING & SCANNER SIMULATION
  // ==========================================
  console.log('\n▶ [5] SCANNER BATCH INGESTION & MOVEMENT ENGINE');

  // Scan 1: Out of Shelf Room -> In Transit
  const scanOutRes = await request('/movements', {
    method: 'POST',
    body: JSON.stringify({
      gateId: 'SHELF_ROOM_DOOR',
      direction: 'OUT',
      epcs: [newEpc],
      deviceId: 'reader-gate-01',
      timestamp: new Date().toISOString(),
    }),
  });
  assert(scanOutRes.status === 201 && scanOutRes.data.matchedCount === 1, 'Shelf Room Exit batch scan processed');

  // Verify File is IN_TRANSIT
  const checkTransit = await request(`/files/${testFileId}`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert(checkTransit.data.file.currentLocation === 'IN_TRANSIT', 'File location automatically updated to IN_TRANSIT');

  // Scan 2: In to Court Room -> COURT_ROOM
  const scanInRes = await request('/movements', {
    method: 'POST',
    body: JSON.stringify({
      gateId: 'COURT_ROOM_DOOR',
      direction: 'IN',
      epcs: [newEpc],
      deviceId: 'reader-gate-02',
      timestamp: new Date().toISOString(),
    }),
  });
  assert(scanInRes.status === 201 && scanInRes.data.matchedCount === 1, 'Court Room Entrance batch scan processed');

  // Verify File is COURT_ROOM
  const checkCourt = await request(`/files/${testFileId}`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert(checkCourt.data.file.currentLocation === 'COURT_ROOM', 'File location automatically updated to COURT_ROOM');

  // Scan 3: Unknown tag scan
  const unkTagEpc = 'E28068UNKNOWN999999';
  const unknownScanRes = await request('/movements', {
    method: 'POST',
    body: JSON.stringify({
      gateId: 'SHELF_ROOM_DOOR',
      direction: 'IN',
      epcs: [unkTagEpc],
      deviceId: 'reader-gate-01',
      timestamp: new Date().toISOString(),
    }),
  });
  assert(unknownScanRes.status === 201 && unknownScanRes.data.unknownCount === 1, 'Unregistered tag scan captured in UnknownTag log without crashing batch');

  // ==========================================
  // SECTION 6: REPORTS & CSV EXPORTS (STAGE 3)
  // ==========================================
  console.log('\n▶ [6] OPERATIONAL REPORTS & CSV EXPORT');

  // Courtroom dwell report
  const dwellReport = await request('/reports/court-room-files?thresholdHours=0.01', {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert(
    dwellReport.status === 200 && dwellReport.data.items.some((f) => f.fileId === testFileId),
    'Courtroom Dwell Report lists current court files with live dwell calculation'
  );

  // Movement history report
  const movementsReport = await request('/reports/movements?page=1&limit=10', {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert(movementsReport.status === 200 && movementsReport.data.total > 0, 'Movement History Report paginated and populated');

  // Unknown tags report
  const unkReport = await request('/reports/unknown-tags', {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert(unkReport.status === 200 && unkReport.data.items.some((u) => u.rfidTag === unkTagEpc), 'Unknown Tag Report correctly lists unmatched scan');

  // Case summary report
  const caseReport = await request(`/reports/case/${testCaseId}`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert(caseReport.status === 200 && caseReport.data.totalFiles === 1, 'Case Summary Report aggregates case file bundle locations');

  // CSV Export
  const csvExport = await request('/reports/court-room-files/export', {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert(
    csvExport.status === 200 && csvExport.data.includes('File ID') && csvExport.headers.get('content-type').includes('text/csv'),
    'Courtroom report exported cleanly as CSV spreadsheet'
  );

  // ==========================================
  // SECTION 7: USER MANAGEMENT & LOCKOUT GUARD
  // ==========================================
  console.log('\n▶ [7] USER MANAGEMENT & ADMIN LOCKOUT PROTECTION');

  const newClerkUsername = `clerk_${Date.now()}`;
  const createClerk = await request('/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      username: newClerkUsername,
      fullName: 'Test Clerk Staff',
      role: 'staff',
      password: 'Password@123',
    }),
  });
  assert(createClerk.status === 201, `Admin created new account "@${newClerkUsername}"`);

  // Deactivate clerk
  const clerkId = createClerk.data.user.id || createClerk.data.user._id;
  const deactClerk = await request(`/users/${clerkId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ active: false }),
  });
  assert(deactClerk.status === 200 && deactClerk.data.user.active === false, 'Admin deactivated user account');

  // Verify deactivated user cannot log in
  const deactLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: newClerkUsername, password: 'Password@123' }),
  });
  assert(deactLogin.status === 403, 'Deactivated account prevented from logging in (403 Forbidden)');

  // Safety test: Admin lockout protection
  const adminProfile = authMe.data.user;
  const lockoutAttempt = await request(`/users/${adminProfile.id || adminProfile._id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ active: false }),
  });
  assert(lockoutAttempt.status === 400, 'Server safety guard prevents deactivating the only active Admin');

  // Cleanup: delete test clerk
  const delClerk = await request(`/users/${clerkId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(delClerk.status === 200, 'Admin deleted test user account');

  console.log('\n================================================================');
  console.log(`📊 END-TO-END TEST SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runFullTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
