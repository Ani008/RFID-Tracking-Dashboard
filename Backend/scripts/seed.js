import 'dotenv/config';
import mongoose from 'mongoose';
import File from '../models/File.js';
import Gate from '../models/Gate.js';

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
