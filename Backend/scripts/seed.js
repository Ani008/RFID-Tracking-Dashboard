import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import File from '../models/File.js';
import Gate from '../models/Gate.js';
import User from '../models/User.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid-tracker';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[seed] connected to MongoDB');

  // Seed Users
  await User.deleteMany({});
  const salt = await bcrypt.genSalt(10);
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';
  const staffPassword = process.env.DEFAULT_STAFF_PASSWORD || 'Staff@123';

  await User.insertMany([
    {
      username: 'admin',
      passwordHash: await bcrypt.hash(adminPassword, salt),
      role: 'admin',
      fullName: 'System Administrator',
      active: true,
    },
    {
      username: 'staff',
      passwordHash: await bcrypt.hash(staffPassword, salt),
      role: 'staff',
      fullName: 'Court Operations Staff',
      active: true,
    },
  ]);
  console.log('[seed] default users created:');
  console.log(`  - admin (password: ${adminPassword})`);
  console.log(`  - staff (password: ${staffPassword})`);

  // Files are no longer seeded here — register files via the app's manual
  // form or the bulk Excel upload instead. We still clear any stale demo
  // files left over from earlier runs so you start with a clean slate.
  await File.deleteMany({});
  console.log('[seed] cleared existing files (no demo files inserted)');

  await Gate.deleteMany({});
  await Gate.insertMany([
    { gateId: 'SHELF_ROOM_DOOR', label: 'Shelf / Record Room Door', location: 'Record Room, Ground Floor' },
    { gateId: 'COURT_ROOM_DOOR', label: 'Court Room Door', location: 'Court Room No. 4' },
  ]);
  console.log('[seed] gates created');

  await mongoose.disconnect();
  console.log('[seed] done');
}

seed().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});