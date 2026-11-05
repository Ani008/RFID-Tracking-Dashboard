import 'dotenv/config';
import mongoose from 'mongoose';
import File from '../models/File.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid-tracker';
const isDryRun = process.argv.includes('--dry-run');

async function migrate() {
  console.log(`[migrate-phase1] Connecting to MongoDB: ${MONGODB_URI}`);
  console.log(`[migrate-phase1] Mode: ${isDryRun ? 'DRY-RUN (no changes will be committed)' : 'LIVE EXECUTION'}`);

  await mongoose.connect(MONGODB_URI);

  const totalFiles = await File.countDocuments({});
  console.log(`[migrate-phase1] Total files in database: ${totalFiles}`);

  const pendingFilter = {
    $or: [
      { caseStatus: { $exists: false } },
      { caseStatus: null },
      { caseStatus: '' },
    ],
  };

  const filesNeedingStatus = await File.countDocuments(pendingFilter);
  console.log(`[migrate-phase1] Files missing caseStatus: ${filesNeedingStatus}`);

  if (isDryRun) {
    console.log(`[migrate-phase1] [DRY-RUN] Would update ${filesNeedingStatus} file(s) to caseStatus = 'PENDING'.`);
    console.log(`[migrate-phase1] [DRY-RUN] Ensuring indexes would be synced...`);
    console.log('[migrate-phase1] [DRY-RUN] Complete. 0 documents modified.');
  } else {
    // Sync indexes to create the new partial unique indexes on cino and rfidTag
    console.log('[migrate-phase1] Syncing indexes...');
    try {
      await File.syncIndexes();
      console.log('[migrate-phase1] File indexes synced successfully.');
    } catch (idxErr) {
      console.warn('[migrate-phase1] Index sync warning:', idxErr.message);
    }

    if (filesNeedingStatus > 0) {
      const result = await File.updateMany(pendingFilter, {
        $set: { caseStatus: 'PENDING' },
      });
      console.log(`[migrate-phase1] Successfully updated ${result.modifiedCount} file(s) to caseStatus='PENDING'.`);
    } else {
      console.log('[migrate-phase1] All files already have a valid caseStatus. No changes needed.');
    }

    const remainingUnset = await File.countDocuments(pendingFilter);
    console.log(`[migrate-phase1] Remaining files without caseStatus: ${remainingUnset}`);
  }

  await mongoose.disconnect();
  console.log('[migrate-phase1] Done.');
}

migrate().catch((err) => {
  console.error('[migrate-phase1] Fatal migration error:', err);
  process.exit(1);
});
