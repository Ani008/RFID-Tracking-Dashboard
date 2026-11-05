import 'dotenv/config';
import mongoose from 'mongoose';
import File from '../models/File.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid-tracker';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${details ? `(${details})` : ''}`);
    failed++;
  }
}

async function runPhase1Tests() {
  console.log('=====================================================');
  console.log('🧪 RUNNING PHASE 1 DATA MODEL & ACCEPTANCE TESTS');
  console.log('=====================================================\n');

  await mongoose.connect(MONGODB_URI);
  await File.syncIndexes();

  // Clean test files
  await File.deleteMany({ fileId: /^TEST-P1-/ });

  // 1. Test virtual rfidMapped
  console.log('▶ [1] Virtual rfidMapped');
  const mappedDoc = new File({
    fileId: 'TEST-P1-MAP1',
    fileName: 'Mapped Test',
    caseId: 'CASE-TEST',
    rfidTag: 'E280001',
  });
  const unmappedDoc = new File({
    fileId: 'TEST-P1-UNMAP1',
    fileName: 'Unmapped Test',
    caseId: 'CASE-TEST',
  });
  const jsonMapped = mappedDoc.toJSON();
  const jsonUnmapped = unmappedDoc.toJSON();
  assert(jsonMapped.rfidMapped === true, 'rfidMapped is true when rfidTag is present');
  assert(jsonUnmapped.rfidMapped === false, 'rfidMapped is false when rfidTag is omitted');

  // 2. Test multiple files without rfidTag (untagged files succeed)
  console.log('▶ [2] Multiple untagged files');
  try {
    const f1 = await File.create({
      fileId: 'TEST-P1-NO-RFID-1',
      fileName: 'Untagged 1',
      caseId: 'CASE-P1-1',
    });
    const f2 = await File.create({
      fileId: 'TEST-P1-NO-RFID-2',
      fileName: 'Untagged 2',
      caseId: 'CASE-P1-2',
    });
    assert(Boolean(f1._id && f2._id), 'Multiple files without rfidTag created successfully');
  } catch (err) {
    assert(false, 'Multiple files without rfidTag failed', err.message);
  }

  // 3. Test duplicate non-empty rfidTag fails
  console.log('▶ [3] Duplicate non-empty rfidTag fails');
  try {
    await File.create({
      fileId: 'TEST-P1-TAG-1',
      fileName: 'Tag 1',
      caseId: 'CASE-P1-3',
      rfidTag: 'E28068940000TEST1',
    });
    let dupFailed = false;
    try {
      await File.create({
        fileId: 'TEST-P1-TAG-2',
        fileName: 'Tag 2',
        caseId: 'CASE-P1-4',
        rfidTag: 'E28068940000TEST1',
      });
    } catch (dupErr) {
      dupFailed = true;
    }
    assert(dupFailed, 'Duplicate non-empty rfidTag triggers unique constraint');
  } catch (err) {
    assert(false, 'Error during duplicate rfidTag test', err.message);
  }

  // 4. Test CINO uniqueness: non-empty duplicate fails, multiple empty/omitted succeed
  console.log('▶ [4] CINO uniqueness and optionality');
  try {
    // Empty CINO multiple files
    const c1 = await File.create({
      fileId: 'TEST-P1-CINO-EMPTY-1',
      fileName: 'Empty CINO 1',
      caseId: 'CASE-P1-5',
    });
    const c2 = await File.create({
      fileId: 'TEST-P1-CINO-EMPTY-2',
      fileName: 'Empty CINO 2',
      caseId: 'CASE-P1-6',
    });
    assert(Boolean(c1._id && c2._id), 'Multiple files with empty/omitted CINO succeed');

    // Non-empty duplicate CINO
    await File.create({
      fileId: 'TEST-P1-CINO-1',
      fileName: 'CINO 1',
      caseId: 'CASE-P1-7',
      cino: 'UPHC01TEST001',
    });
    let cinoDupFailed = false;
    try {
      await File.create({
        fileId: 'TEST-P1-CINO-2',
        fileName: 'CINO 2',
        caseId: 'CASE-P1-8',
        cino: 'UPHC01TEST001',
      });
    } catch (dupErr) {
      cinoDupFailed = true;
    }
    assert(cinoDupFailed, 'Duplicate non-empty CINO triggers unique constraint');
  } catch (err) {
    assert(false, 'Error during CINO tests', err.message);
  }

  // 5. Test rackLocation and new fields storage
  console.log('▶ [5] Extended fields and rackLocation');
  const fullDoc = await File.create({
    fileId: 'TEST-P1-FULL',
    fileName: 'Full Fields Test',
    caseId: 'CASE-P1-9',
    caseNumber: 'BAIL/2024/999',
    cino: 'UPHC01TEST999',
    fileNumber: 'F999/2024',
    caseType: 'BAIL',
    caseStatus: 'PENDING',
    rackLocation: {
      rack: 'RACK-05',
      shelf: 'SHELF-D',
      updatedAt: new Date(),
    },
  });
  assert(
    fullDoc.caseType === 'BAIL' &&
      fullDoc.caseStatus === 'PENDING' &&
      fullDoc.rackLocation?.rack === 'RACK-05' &&
      fullDoc.rackLocation?.shelf === 'SHELF-D',
    'Extended fields (caseNumber, cino, fileNumber, caseType, caseStatus, rackLocation) saved properly'
  );

  // Clean up test documents
  await File.deleteMany({ fileId: /^TEST-P1-/ });
  await mongoose.disconnect();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

