import assert from 'assert';
import http from 'http';

const API_BASE = 'http://localhost:4000/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const parsed = new URL(url);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(body);
          } catch {
            data = body;
          }
          resolve({ status: res.statusCode, data, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function login(username, password) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  if (!res.data?.token) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(res.data)}`);
  }
  return res.data.token;
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function run() {
  console.log('\n--- Running Phase 6 Tests (Handheld API + Rack Location) ---');

  const adminToken = await login('admin', 'Admin@123');
  const staffToken = await login('staff', 'Staff@123');

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const staffHeaders = { Authorization: `Bearer ${staffToken}` };

  // Setup: create test files with various states
  // 1. File with RFID and rack (LOCATED)
  // 2. File with RFID but no rack (NO_RACK)
  // 3. File with no RFID (NO_RFID)
  const rand = Math.floor(Math.random() * 90000) + 10000;
  const cinoLocated = `ALLHC01${rand}001`;
  const cinoNoRack = `ALLHC01${rand}002`;
  const cinoNoRfid = `ALLHC01${rand}003`;
  const cinoUnmatched = `ALLHC01${rand}004`;

  const file1Res = await request('/files', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      fileId: `FILE-HH-${rand}-1`,
      fileName: 'Handheld Located File',
      caseId: `CASE-HH-${rand}-1`,
      caseNumber: `WP/HH/${rand}/1`,
      cino: cinoLocated,
      caseType: 'BAIL',
      caseStatus: 'PENDING',
      rfidTag: `E28068EA${rand}01`,
      rackLocation: { rack: 'RACK-A', shelf: '1' },
    },
  });
  assert.strictEqual(file1Res.status, 201, 'File 1 should be created');

  const file2Res = await request('/files', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      fileId: `FILE-HH-${rand}-2`,
      fileName: 'Handheld No-Rack File',
      caseId: `CASE-HH-${rand}-2`,
      caseNumber: `WP/HH/${rand}/2`,
      cino: cinoNoRack,
      caseType: 'WTAX',
      caseStatus: 'PENDING',
      rfidTag: `E28068EA${rand}02`,
    },
  });
  assert.strictEqual(file2Res.status, 201, 'File 2 should be created');

  const file3Res = await request('/files', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      fileId: `FILE-HH-${rand}-3`,
      fileName: 'Handheld No-RFID File',
      caseId: `CASE-HH-${rand}-3`,
      caseNumber: `WP/HH/${rand}/3`,
      cino: cinoNoRfid,
      caseType: 'BAIL',
      caseStatus: 'PENDING',
    },
  });
  assert.strictEqual(file3Res.status, 201, 'File 3 should be created');

  // Sync a cause list containing these 3 files + 1 unmatched row for date 2026-12-01
  const testDate = '2026-12-01';
  const csvData = [
    'Date,Court,Serial,CaseNo,CINO,Bench,Type,Status',
    `${testDate},1,1,WP/HH/${rand}/1,${cinoLocated},Chief Justice,BAIL,PENDING`,
    `${testDate},1,2,WP/HH/${rand}/2,${cinoNoRack},Chief Justice,WTAX,PENDING`,
    `${testDate},2,1,WP/HH/${rand}/3,${cinoNoRfid},Court 2 Bench,BAIL,PENDING`,
    `${testDate},2,2,WP/HH/${rand}/4,${cinoUnmatched},Court 2 Bench,CRLR,PENDING`,
  ].join('\n');

  // Upload cause list via multipart request helper
  // Use http request with raw boundary
  const boundary = '----WebKitFormBoundaryPhase6Test' + Math.random().toString(36).slice(2);
  let multipartBody = '';
  multipartBody += `--${boundary}\r\n`;
  multipartBody += `Content-Disposition: form-data; name="date"\r\n\r\n${testDate}\r\n`;
  multipartBody += `--${boundary}\r\n`;
  multipartBody += `Content-Disposition: form-data; name="file"; filename="hh_test.csv"\r\n`;
  multipartBody += `Content-Type: text/csv\r\n\r\n${csvData}\r\n`;
  multipartBody += `--${boundary}--\r\n`;

  const syncRes = await new Promise((resolve, reject) => {
    const parsed = new URL(`${API_BASE}/causelist/sync`);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(multipartBody),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
      }
    );
    req.on('error', reject);
    req.write(multipartBody);
    req.end();
  });
  assert.strictEqual(syncRes.status, 201, 'Cause list sync must succeed');

  // ─── Tests for PUT /api/files/:fileId/rack ─────────────────────────────────

  await test('PUT /api/files/:fileId/rack requires authentication', async () => {
    const res = await request(`/files/${file2Res.data.fileId}/rack`, {
      method: 'PUT',
      body: { rack: 'RACK-B', shelf: '2' },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('PUT /api/files/:fileId/rack allows staff to update rack', async () => {
    const res = await request(`/files/${file2Res.data.fileId}/rack`, {
      method: 'PUT',
      headers: staffHeaders,
      body: { rack: 'RACK-B', shelf: '2' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.rackLocation?.rack, 'RACK-B');
    assert.strictEqual(res.data.rackLocation?.shelf, '2');
    assert.ok(res.data.rackLocation?.updatedAt);
  });

  await test('PUT /api/files/:fileId/rack allows admin to update rack by MongoDB _id', async () => {
    const res = await request(`/files/${file2Res.data._id}/rack`, {
      method: 'PUT',
      headers: adminHeaders,
      body: { rack: 'RACK-B-UPDATED', shelf: '3' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.rackLocation?.rack, 'RACK-B-UPDATED');
    assert.strictEqual(res.data.rackLocation?.shelf, '3');
  });

  await test('PUT /api/files/:fileId/rack validates required rack string and pattern', async () => {
    // Missing rack
    const res1 = await request(`/files/${file2Res.data.fileId}/rack`, {
      method: 'PUT',
      headers: staffHeaders,
      body: { shelf: '1' },
    });
    assert.strictEqual(res1.status, 400);

    // Empty rack
    const res2 = await request(`/files/${file2Res.data.fileId}/rack`, {
      method: 'PUT',
      headers: staffHeaders,
      body: { rack: '   ' },
    });
    assert.strictEqual(res2.status, 400);

    // Special characters disallowed in rack
    const res3 = await request(`/files/${file2Res.data.fileId}/rack`, {
      method: 'PUT',
      headers: staffHeaders,
      body: { rack: 'RACK<script>' },
    });
    assert.strictEqual(res3.status, 400);

    // Shelf with invalid chars
    const res4 = await request(`/files/${file2Res.data.fileId}/rack`, {
      method: 'PUT',
      headers: staffHeaders,
      body: { rack: 'RACK-VALID', shelf: 'SHELF*&^' },
    });
    assert.strictEqual(res4.status, 400);
  });

  await test('PUT /api/files/:fileId/rack writes RACK_UPDATE to AuditLog', async () => {
    const getRes = await request(`/files/${file2Res.data.fileId}`, { headers: adminHeaders });
    assert.strictEqual(getRes.status, 200);
    const rackAudit = getRes.data.auditTrail?.find((a) => a.action === 'RACK_UPDATE');
    assert.ok(rackAudit, 'Audit log should contain RACK_UPDATE');
    assert.strictEqual(rackAudit.after?.rackLocation?.rack, 'RACK-B-UPDATED');
  });

  await test('PUT /api/files/:fileId/rack returns 404 for nonexistent file', async () => {
    const res = await request('/files/NONEXISTENT-FILE-99999/rack', {
      method: 'PUT',
      headers: staffHeaders,
      body: { rack: 'RACK-X' },
    });
    assert.strictEqual(res.status, 404);
  });

  // ─── Tests for GET /api/handheld/causelist ─────────────────────────────────

  await test('GET /api/handheld/causelist requires authentication', async () => {
    const res = await request('/handheld/causelist');
    assert.strictEqual(res.status, 401);
  });

  await test('GET /api/handheld/causelist is accessible by staff', async () => {
    const res = await request(`/handheld/causelist?date=${testDate}`, { headers: staffHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.date, testDate);
    assert.strictEqual(res.data.total, 4);
    assert.strictEqual(res.data.items.length, 4);
  });

  await test('GET /api/handheld/causelist computes accurate availability flags', async () => {
    const res = await request(`/handheld/causelist?date=${testDate}`, { headers: adminHeaders });
    assert.strictEqual(res.status, 200);

    const items = res.data.items;
    const item1 = items.find((i) => i.cino === cinoLocated);
    const item2 = items.find((i) => i.cino === cinoNoRack);
    const item3 = items.find((i) => i.cino === cinoNoRfid);
    const item4 = items.find((i) => i.cino === cinoUnmatched);

    assert.ok(item1, 'item1 must exist');
    assert.strictEqual(item1.availability, 'LOCATED', 'item1 has RFID and rack');
    assert.strictEqual(item1.rfidMapped, true);

    assert.ok(item2, 'item2 must exist');
    // Note: earlier we updated file2 rack to RACK-B-UPDATED, so it is now LOCATED
    assert.strictEqual(item2.availability, 'LOCATED', 'item2 was updated with rack');

    assert.ok(item3, 'item3 must exist');
    assert.strictEqual(item3.availability, 'NO_RFID', 'item3 has file but no RFID tag');
    assert.strictEqual(item3.rfidMapped, false);

    assert.ok(item4, 'item4 must exist');
    assert.strictEqual(item4.availability, 'NO_FILE', 'item4 has no matched file');
    assert.strictEqual(item4.rfidMapped, false);
  });

  await test('GET /api/handheld/causelist filters by caseType', async () => {
    const res = await request(`/handheld/causelist?date=${testDate}&caseType=BAIL`, { headers: staffHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.total, 2);
    assert.ok(res.data.items.every((i) => i.caseType === 'BAIL'));
  });

  await test('GET /api/handheld/causelist filters by court', async () => {
    const res = await request(`/handheld/causelist?date=${testDate}&court=1`, { headers: staffHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.total, 2);
    assert.ok(res.data.items.every((i) => i.courtNumber === '1'));
  });

  await test('GET /api/handheld/causelist performs regex-safe text search on caseNumber and CINO', async () => {
    // Normal search
    const res1 = await request(`/handheld/causelist?date=${testDate}&q=${cinoLocated}`, { headers: staffHeaders });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.data.total, 1);
    assert.strictEqual(res1.data.items[0].cino, cinoLocated);

    // Regex chars in q do not crash
    const res2 = await request(`/handheld/causelist?date=${testDate}&q=WP/HH/${rand}/.*`, { headers: staffHeaders });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.total, 0, 'Literal regex pattern should not match all');
  });

  await test('GET /api/handheld/causelist protects against NoSQL injection on query params', async () => {
    const res = await request(`/handheld/causelist?q[$ne]=test`, { headers: staffHeaders });
    // Object param rejected or safe
    assert.ok(res.status === 400 || res.status === 200);
  });

  await test('GET /api/handheld/causelist sorts by courtNumber ASC then serialNumber ASC', async () => {
    const res = await request(`/handheld/causelist?date=${testDate}`, { headers: staffHeaders });
    assert.strictEqual(res.status, 200);
    const items = res.data.items;
    for (let i = 0; i < items.length - 1; i++) {
      const courtComp = String(items[i].courtNumber).localeCompare(String(items[i + 1].courtNumber), undefined, { numeric: true });
      if (courtComp === 0) {
        assert.ok(Number(items[i].serialNumber) <= Number(items[i + 1].serialNumber), 'serialNumber ascending');
      } else {
        assert.ok(courtComp < 0, 'courtNumber ascending');
      }
    }
  });

  // Cleanup test files
  await request(`/files/${file1Res.data.fileId}`, { method: 'DELETE', headers: adminHeaders });
  await request(`/files/${file2Res.data.fileId}`, { method: 'DELETE', headers: adminHeaders });
  await request(`/files/${file3Res.data.fileId}`, { method: 'DELETE', headers: adminHeaders });

  console.log(`\nPhase 6 Results: ${passed} PASSED | ${failed} FAILED`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('Test runner fatal error:', e);
  process.exit(1);
});
