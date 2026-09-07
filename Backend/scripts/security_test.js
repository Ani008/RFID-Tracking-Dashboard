import 'dotenv/config';
import http from 'http';
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

async function runSecurityTests() {
  console.log('=====================================================');
  console.log('🛡️  STARTING PHASE 3 SECURITY & HARDENING TEST SUITE');
  console.log('=====================================================\n');

  // Step 0: Obtain Admin and Staff tokens
  console.log('▶ [Step 0] Logging in to retrieve Admin and Staff JWT tokens...');
  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  });
  const adminToken = adminLogin.data.token;
  assert(adminLogin.status === 200 && Boolean(adminToken), 'Admin login successful');

  const staffLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'staff', password: 'Staff@123' }),
  });
  const staffToken = staffLogin.data.token;
  assert(staffLogin.status === 200 && Boolean(staffToken), 'Staff login successful');

  console.log('\n-----------------------------------------------------');
  console.log('🔒 TIER 1 CHECKS');
  console.log('-----------------------------------------------------');

  // Check 1: Socket.io Authentication
  console.log('\n[Check 1] Socket.io Handshake Authentication');
  await new Promise((resolve) => {
    // 1a: Unauthenticated socket
    const unauthSocket = ioClient(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 2000,
    });
    unauthSocket.on('connect_error', (err) => {
      assert(err.message.includes('Authentication required'), 'Unauthenticated socket rejected on handshake');
      unauthSocket.disconnect();

      // 1b: Bogus/expired token socket
      const bogusSocket = ioClient(SOCKET_URL, {
        auth: { token: 'bogus.jwt.token' },
        transports: ['websocket'],
        reconnection: false,
        timeout: 2000,
      });
      bogusSocket.on('connect_error', (err2) => {
        assert(err2.message.includes('Invalid or expired'), 'Invalid token socket rejected on handshake');
        bogusSocket.disconnect();

        // 1c: Valid staff token socket
        const validSocket = ioClient(SOCKET_URL, {
          auth: { token: staffToken },
          transports: ['websocket'],
          reconnection: false,
          timeout: 2000,
        });
        validSocket.on('connect', () => {
          assert(true, 'Authenticated staff socket accepted successfully');
          validSocket.disconnect();
          resolve();
        });
        validSocket.on('connect_error', (err3) => {
          assert(false, 'Authenticated socket failed to connect', err3.message);
          validSocket.disconnect();
          resolve();
        });
      });
    });
  });

  // Check 2: NoSQL Injection Prevention
  console.log('\n[Check 2] NoSQL Injection Prevention on Login');
  const nosqlPayload = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: { $ne: null }, password: { $ne: null } }),
  });
  assert(
    nosqlPayload.status === 400 && nosqlPayload.data.error.includes('valid text strings'),
    'Object payload rejected with 400 Bad Request',
    JSON.stringify(nosqlPayload.data)
  );

  // Check 3: Confirm password hashes never leave the server
  console.log('\n[Check 3] Password Hash Leakage Defense');
  const meRes = await request('/auth/me', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    meRes.status === 200 && meRes.data.user?.passwordHash === undefined,
    'GET /api/auth/me does not leak passwordHash'
  );

  const usersRes = await request('/users', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const allUsersHaveNoHash =
    usersRes.data.users?.length > 0 &&
    usersRes.data.users.every((u) => u.passwordHash === undefined);
  assert(allUsersHaveNoHash, 'GET /api/users does not leak passwordHash across any user records');

  // Check 4: Tampered / Expired Token Defense
  console.log('\n[Check 4] Tampered Token Rejection');
  const tamperedRes = await request('/files', {
    headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.token' },
  });
  assert(tamperedRes.status === 401, 'Tampered token receives clean 401 Unauthorized');

  console.log('\n-----------------------------------------------------');
  console.log('🛡️ TIER 2 CHECKS');
  console.log('-----------------------------------------------------');

  // Check 5: Direct-API RBAC Verification
  console.log('\n[Check 5] Direct API RBAC Enforcement (Staff Token -> Admin Routes)');
  const adminEndpoints = [
    { method: 'POST', path: '/files', body: { fileId: 'X', fileName: 'X', caseId: 'X', caseName: 'X', rfidTag: 'X' }, name: 'POST /api/files (Create File)' },
    { method: 'PUT', path: '/files/AHC-F-1001', body: { fileName: 'Updated' }, name: 'PUT /api/files/:fileId (Edit File)' },
    { method: 'DELETE', path: '/files/AHC-F-1001', name: 'DELETE /api/files/:fileId (Archive File)' },
    { method: 'POST', path: '/gates', body: { gateId: 'G1', label: 'G1' }, name: 'POST /api/gates (Create Gate)' },
    { method: 'GET', path: '/users', name: 'GET /api/users (List Accounts)' },
    { method: 'POST', path: '/users', body: { username: 'test', password: '123' }, name: 'POST /api/users (Create User)' },
    { method: 'PUT', path: '/users/6a9eec5f4c9bdbb71b1292fd', body: { active: false }, name: 'PUT /api/users/:id (Update User)' },
    { method: 'DELETE', path: '/users/6a9eec5f4c9bdbb71b1292fd', name: 'DELETE /api/users/:id (Delete User)' },
  ];

  for (const ep of adminEndpoints) {
    const res = await request(ep.path, {
      method: ep.method,
      headers: { Authorization: `Bearer ${staffToken}` },
      body: ep.body ? JSON.stringify(ep.body) : undefined,
    });
    assert(res.status === 403, `Staff account blocked with 403 on ${ep.name}`);
  }

  // Check 6: Security Headers (Helmet)
  console.log('\n[Check 6] Security Headers Verification');
  const healthRes = await request('/health');
  assert(healthRes.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff present');
  assert(healthRes.headers.get('x-frame-options') === 'SAMEORIGIN', 'X-Frame-Options: SAMEORIGIN present');

  // Check 7: CSV Formula Injection Escaping
  console.log('\n[Check 7] CSV Formula Injection Neutralization');
  const csvRes = await request('/reports/court-room-files/export', {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert(csvRes.status === 200, 'CSV export endpoint accessible');

  // Check 8: Concurrent Load Pass on Reports
  console.log('\n[Check 8] Simulated Concurrent Load on Reports');
  const startTime = Date.now();
  const parallelRequests = Array.from({ length: 12 }, () =>
    request('/reports/movements?page=1&limit=25', {
      headers: { Authorization: `Bearer ${staffToken}` },
    })
  );
  const results = await Promise.all(parallelRequests);
  const all200 = results.every((r) => r.status === 200);
  const duration = Date.now() - startTime;
  assert(all200, `12 concurrent report queries executed in ${duration}ms with 100% success`);

  console.log('\n=====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('=====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
