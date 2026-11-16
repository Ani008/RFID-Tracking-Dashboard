import 'dotenv/config';
import mongoose from 'mongoose';
import File from '../models/File.js';
import CauseListEntry from '../models/CauseListEntry.js';
import SyncRun from '../models/SyncRun.js';
import MovementLog from '../models/MovementLog.js';

/**
 * One-time cleanup of the demo data that older versions of seed.js and the
 * cause-list HTTP stub inserted.
 *
 *   node scripts/purge-demo-data.js            -> DRY RUN (only reports)
 *   node scripts/purge-demo-data.js --apply    -> actually deletes
 *
 * Safety: a file is only treated as demo when BOTH its fileId AND its CINO
 * match the exact demo pair. Real court files cannot match both.
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid-tracker';
const APPLY = process.argv.includes('--apply');

const DEMO_FILES = [
  ['AHC-F-1001', 'UPHC010000012024'],
  ['AHC-F-1002', 'UPHC010000022024'],
  ['AHC-F-1003', 'UPHC010000032024'],
  ['AHC-F-1004', 'UPHC010000042024'],
  ['AHC-F-1005', 'UPHC010000052024'],
  ['AHC-F-1006', 'UPHC010000062024'],
];
const DEMO_CINOS = DEMO_FILES.map(([, cino]) => cino);

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log(`[purge] connected - mode: ${APPLY ? 'APPLY (deleting)' : 'DRY RUN (no changes)'}`);

  // 1. Demo case files (exact fileId + CINO pair)
  const demoFiles = await File.find({
    $or: DEMO_FILES.map(([fileId, cino]) => ({ fileId, cino })),
  }).select('fileId cino rfidTag caseNumber');
  const demoFileIds = demoFiles.map((f) => f.fileId);
  const demoFileObjectIds = demoFiles.map((f) => f._id);

  // 2. Cause list entries created from the stub or linked to demo files
  const demoEntries = await CauseListEntry.find({
    $or: [{ cino: { $in: DEMO_CINOS } }, { file: { $in: demoFileObjectIds } }],
  }).select('syncRunId');
  const entryIds = demoEntries.map((e) => e._id);
  const touchedRunIds = [...new Set(demoEntries.map((e) => String(e.syncRunId)).filter(Boolean))];

  // 3. Movement logs for demo files
  const movementCount = await MovementLog.countDocuments({ fileId: { $in: demoFileIds } });

  console.log(`[purge] demo case files found:        ${demoFiles.length}`);
  demoFiles.forEach((f) => console.log(`          - ${f.fileId}  ${f.caseNumber}  ${f.cino}`));
  console.log(`[purge] cause list entries found:     ${demoEntries.length}`);
  console.log(`[purge] movement logs found:          ${movementCount}`);

  if (!APPLY) {
    console.log('[purge] dry run only. Re-run with --apply to delete.');
    await mongoose.disconnect();
    return;
  }

  const entriesRes = await CauseListEntry.deleteMany({ _id: { $in: entryIds } });
  const movesRes = await MovementLog.deleteMany({ fileId: { $in: demoFileIds } });
  const filesRes = await File.deleteMany({ _id: { $in: demoFileObjectIds } });

  // 4. Sync runs that only produced demo entries (no remaining entries reference them)
  let runsDeleted = 0;
  for (const runId of touchedRunIds) {
    const remaining = await CauseListEntry.countDocuments({ syncRunId: runId });
    if (remaining === 0) {
      await SyncRun.deleteOne({ _id: runId });
      runsDeleted++;
    }
  }

  console.log(`[purge] deleted: ${filesRes.deletedCount} files, ${entriesRes.deletedCount} cause list entries, ` +
    `${movesRes.deletedCount} movement logs, ${runsDeleted} sync runs`);

  await mongoose.disconnect();
  console.log('[purge] done');
}

run().catch((err) => {
  console.error('[purge] failed', err);
  process.exit(1);
});
