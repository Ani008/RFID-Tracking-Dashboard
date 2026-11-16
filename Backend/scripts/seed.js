import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import File from '../models/File.js';
import Gate from '../models/Gate.js';
import User from '../models/User.js';

/**
 * Bootstrap script: creates the initial login accounts and the two gates.
 *
 *  - NO demo / sample case files are created. Case files come only from the
 *    real registration flow and the real cause list.
 *  - NON-DESTRUCTIVE: it never deletes users, files or gates. Anything that
 *    already exists is left untouched, so it is safe to run on production.
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid-tracker';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[seed] connected to MongoDB');

  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';
  const staffPassword = process.env.DEFAULT_STAFF_PASSWORD || 'Staff@123';
  const salt = await bcrypt.genSalt(10);

  const defaultUsers = [
    { username: 'admin', password: adminPassword, role: 'admin', fullName: 'System Administrator' },
    { username: 'staff', password: staffPassword, role: 'staff', fullName: 'Court Operations Staff' },
  ];

  for (const u of defaultUsers) {
    const exists = await User.exists({ username: u.username });
    if (exists) {
      console.log(`[seed] user "${u.username}" already exists - left unchanged`);
      continue;
    }
    await User.create({
      username: u.username,
      passwordHash: await bcrypt.hash(u.password, salt),
      role: u.role,
      fullName: u.fullName,
      active: true,
    });
    console.log(`[seed] user "${u.username}" created`);
  }

  await File.syncIndexes();

  const gates = [
    { gateId: 'SHELF_ROOM_DOOR', label: 'Shelf / Record Room Door', location: 'Record Room, Ground Floor' },
    { gateId: 'COURT_ROOM_DOOR', label: 'Court Room Door', location: 'Court Room No. 4' },
  ];
  for (const g of gates) {
    const res = await Gate.updateOne({ gateId: g.gateId }, { $setOnInsert: g }, { upsert: true });
    console.log(`[seed] gate ${g.gateId}: ${res.upsertedCount ? 'created' : 'already exists'}`);
  }

  await mongoose.disconnect();
  console.log('[seed] done (no case files were created)');
}

seed().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
