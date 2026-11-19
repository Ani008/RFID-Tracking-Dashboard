import 'dotenv/config';
import mongoose from 'mongoose';
import File from '../models/File.js';
import MovementLog from '../models/MovementLog.js';

/**
 * One-time cleanup of the demo data that older versions of seed.js inserted.
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

  // 2. Movement logs for demo files
  const movementCount = await MovementLog.countDocuments({ fileId: { $in: demoFileIds } });

  console.log(`[purge] demo case files found:        ${demoFiles.length}`);
  demoFiles.forEach((f) => console.log(`          - ${f.fileId}  ${f.caseNumber}  ${f.cino}`));
  console.log(`[purge] movement logs found:          ${movementCount}`);

  if (!APPLY) {
    console.log('[purge] dry run only. Re-run with --apply to delete.');
    await mongoose.disconnect();
    return;
  }

  const movesRes = await MovementLog.deleteMany({ fileId: { $in: demoFileIds } });
  const filesRes = await File.deleteMany({ _id: { $in: demoFileObjectIds } });

  console.log(`[purge] deleted: ${filesRes.deletedCount} files, ${movesRes.deletedCount} movement logs`);

  await mongoose.disconnect();
  console.log('[purge] done');
}

run().catch((err) => {
  console.error('[purge] failed', err);
  process.exit(1);
});
