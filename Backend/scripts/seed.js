import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import File from '../models/File.js';
import Gate from '../models/Gate.js';
import User from '../models/User.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid-tracker';

const CASE_POOL = [
  { caseId: 'CASE-1001', caseName: 'State vs. Sharma' },
  { caseId: 'CASE-1002', caseName: 'Verma vs. Union of India' },
  { caseId: 'CASE-1003', caseName: 'Gupta Land Dispute' },
  { caseId: 'CASE-1004', caseName: 'Singh vs. Municipal Corp' },
  { caseId: 'CASE-1005', caseName: 'Patel Contract Appeal' },
  { caseId: 'CASE-1006', caseName: 'State vs. Khan' },
];

const LOCATIONS = ['SHELF_ROOM', 'SHELF_ROOM', 'SHELF_ROOM', 'COURT_ROOM', 'IN_TRANSIT'];

function randomHex(len) {
  const chars = '0123456789ABCDEF';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

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
    {
      username: 'clerk1',
      passwordHash: await bcrypt.hash('Clerk@123', salt),
      role: 'staff',
      fullName: 'Ramesh Kumar (Record Clerk)',
      active: true,
    },
  ]);
  console.log('[seed] default users created:');
  console.log(`  - admin (password: ${adminPassword})`);
  console.log(`  - staff (password: ${staffPassword})`);
  console.log('  - clerk1 (password: Clerk@123)');

  await File.deleteMany({});
  console.log('[seed] cleared existing files');

  await Gate.deleteMany({});
  await Gate.insertMany([
    { gateId: 'SHELF_ROOM_DOOR', label: 'Shelf / Record Room Door', location: 'Record Room, Ground Floor' },
    { gateId: 'COURT_ROOM_DOOR', label: 'Court Room Door', location: 'Court Room No. 4' },
  ]);
  console.log('[seed] gates created');

  const files = [];
  const count = 18;

  for (let i = 1; i <= count; i++) {
    const caseInfo = pick(CASE_POOL);
    const location = pick(LOCATIONS);
    const daysAgo = Math.floor(Math.random() * 5);
    const lastMovementAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 8 * 60 * 60 * 1000);

    files.push({
      fileId: `AHC-F-${String(1000 + i)}`,
      fileName: `${caseInfo.caseName} - File ${i}`,
      caseId: caseInfo.caseId,
      caseName: caseInfo.caseName,
      rfidTag: `E28068${randomHex(18)}`,
      currentLocation: location,
      lastMovementAt,
    });
  }

  await File.insertMany(files);
  console.log(`[seed] inserted ${files.length} demo files`);

  const summary = files.reduce((acc, f) => {
    acc[f.currentLocation] = (acc[f.currentLocation] || 0) + 1;
    return acc;
  }, {});
  console.log('[seed] location breakdown:', summary);

  await mongoose.disconnect();
  console.log('[seed] done');
}

seed().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
