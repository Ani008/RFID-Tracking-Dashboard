import 'dotenv/config';
import mongoose from 'mongoose';
import File from '../models/File.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid-tracker';

async function runLoadCheck() {
  console.log('================================================================');
  console.log('⚡ RUNNING PERFORMANCE & LOAD BENCHMARK (5,000 FILES)');
  console.log('================================================================\n');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Verify indexes
  await File.syncIndexes();

  const LOAD_PREFIX = 'BENCH_LOAD_';

  console.log('Generating 5,000 synthetic files...');
  const filesToInsert = [];
  const caseTypes = ['BAIL', 'WTAX', 'CRLR', 'CRLM', 'CRLP'];
  const caseStatuses = ['PENDING', 'DISPOSED'];

  for (let i = 1; i <= 5000; i++) {
    const hasTag = i % 2 === 0;
    const hasRack = i % 3 === 0;
    const ctype = caseTypes[i % caseTypes.length];
    const cstatus = caseStatuses[i % caseStatuses.length];

    filesToInsert.push({
      fileId: `${LOAD_PREFIX}FILE_${i}`,
      fileName: `Benchmark Case Record ${i}`,
      caseId: `${LOAD_PREFIX}CASE_${i}`,
      caseNumber: `WP/BENCH/${i}/2026`,
      cino: `${LOAD_PREFIX}CINO_${i}`,
      fileNumber: `FN/BENCH/${i}`,
      caseType: ctype,
      caseStatus: cstatus,
      rfidTag: hasTag ? `E28068EA${String(i).padStart(8, '0')}` : undefined,
      currentLocation: 'SHELF_ROOM',
      rackLocation: hasRack ? { rack: `RACK-${(i % 50) + 1}`, shelf: String((i % 5) + 1) } : undefined,
    });
  }

  const fileInsertStart = Date.now();
  await File.insertMany(filesToInsert, { ordered: false });
  console.log(`✓ 5,000 files inserted in ${Date.now() - fileInsertStart}ms`);

  // ─── Query 1: Filtered Files by compound {caseType, caseStatus} + paging ────
  console.log('--- [Query 1] File search: caseType="BAIL" & caseStatus="PENDING" (compound index) ---');
  const q1Start = Date.now();
  const q1Explain = await File.find({ caseType: 'BAIL', caseStatus: 'PENDING' })
    .sort({ createdAt: -1 })
    .limit(25)
    .explain('executionStats');
  const q1Time = Date.now() - q1Start;
  const q1Stats = q1Explain.executionStats;
  console.log(`  Execution Time: ${q1Time}ms (MongoDB execution: ${q1Stats.executionTimeMillis}ms)`);
  console.log(`  Stage: ${q1Stats.executionStages.stage}`);
  console.log(`  Total Docs Examined: ${q1Stats.totalDocsExamined}, Returned: ${q1Stats.nReturned}`);
  if (q1Time > 500) throw new Error(`Query 1 exceeded 500ms limit: ${q1Time}ms`);

  // ─── Query 2: Unique CINO lookup (sparse unique index) ─────────────────────
  console.log('\n--- [Query 2] File lookup by CINO (sparse unique index) ---');
  const q2Start = Date.now();
  const q2Explain = await File.find({ cino: `${LOAD_PREFIX}CINO_2500` })
    .explain('executionStats');
  const q2Time = Date.now() - q2Start;
  const q2Stats = q2Explain.executionStats;
  console.log(`  Execution Time: ${q2Time}ms (MongoDB execution: ${q2Stats.executionTimeMillis}ms)`);
  console.log(`  Stage: ${q2Stats.executionStages.stage}`);
  console.log(`  Total Keys Examined: ${q2Stats.totalKeysExamined}, Docs Examined: ${q2Stats.totalDocsExamined}`);
  if (q2Time > 500) throw new Error(`Query 2 exceeded 500ms limit: ${q2Time}ms`);

  // ─── Query 3: Pending Mapping Files (rfidTag null/missing) ─────────────────
  console.log('\n--- [Query 3] Pending Mapping filter (rfidTag empty or null) ---');
  const q3Start = Date.now();
  const q3Explain = await File.find({
    $or: [{ rfidTag: { $exists: false } }, { rfidTag: null }, { rfidTag: '' }],
  })
    .limit(25)
    .explain('executionStats');
  const q3Time = Date.now() - q3Start;
  const q3Stats = q3Explain.executionStats;
  console.log(`  Execution Time: ${q3Time}ms (MongoDB execution: ${q3Stats.executionTimeMillis}ms)`);
  console.log(`  Returned: ${q3Stats.nReturned}`);
  if (q3Time > 500) throw new Error(`Query 3 exceeded 500ms limit: ${q3Time}ms`);

  // ─── Cleanup benchmark data ────────────────────────────────────────────────
  console.log('\nCleaning up benchmark datasets...');
  const delFiles = await File.deleteMany({ fileId: new RegExp(`^${LOAD_PREFIX}`) });
  console.log(`✓ Deleted ${delFiles.deletedCount} files`);

  await mongoose.disconnect();
  console.log('\n================================================================');
  console.log('✅ ALL LOAD CHECK & INDEX BENCHMARKS PASSED (ALL QUERIES < 500MS)');
  console.log('================================================================');
}

runLoadCheck().catch((err) => {
  console.error('Load check failed:', err);
  process.exit(1);
});

