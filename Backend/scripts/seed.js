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

  // Files seeded with mixed statuses, types, tags, and rack locations
  await File.deleteMany({});
  await File.syncIndexes();

  const demoFiles = [
    {
      fileId: 'AHC-F-1001',
      fileNumber: '1001/2024',
      fileName: 'State of U.P. vs. Ramesh Kumar',
      caseId: 'CASE-2024-001',
      caseNumber: 'BAIL/2024/001',
      cino: 'UPHC010000012024',
      caseType: 'BAIL',
      caseStatus: 'PENDING',
      rfidTag: 'E2806894000040178F2A9001',
      currentLocation: 'SHELF_ROOM',
      rackLocation: { rack: 'RACK-01', shelf: 'SHELF-A', updatedAt: new Date() },
    },
    {
      fileId: 'AHC-F-1002',
      fileNumber: '1002/2024',
      fileName: 'M/S ABC Logistics vs. Commissioner of Commercial Tax',
      caseId: 'CASE-2024-002',
      caseNumber: 'WTAX/2024/045',
      cino: 'UPHC010000022024',
      caseType: 'WTAX',
      caseStatus: 'PENDING',
      rfidTag: 'E2806894000040178F2A9002',
      currentLocation: 'SHELF_ROOM',
      rackLocation: { rack: 'RACK-01', shelf: 'SHELF-B', updatedAt: new Date() },
    },
    {
      fileId: 'AHC-F-1003',
      fileNumber: '1003/2024',
      fileName: 'Pooja Sharma vs. Anand Sharma',
      caseId: 'CASE-2024-003',
      caseNumber: 'MATR/2024/112',
      cino: 'UPHC010000032024',
      caseType: 'CIVIL',
      caseStatus: 'DISPOSED',
      rfidTag: 'E2806894000040178F2A9003',
      currentLocation: 'SHELF_ROOM',
      rackLocation: { rack: 'RACK-02', shelf: 'SHELF-C', updatedAt: new Date() },
    },
    {
      fileId: 'AHC-F-1004',
      fileNumber: '1004/2024',
      fileName: 'Vikas Dubey vs. State of U.P.',
      caseId: 'CASE-2024-004',
      caseNumber: 'BAIL/2024/099',
      cino: 'UPHC010000042024',
      caseType: 'BAIL',
      caseStatus: 'PENDING',
      // Untagged (pending RFID mapping)
      currentLocation: 'SHELF_ROOM',
      rackLocation: { rack: 'RACK-03', shelf: 'SHELF-A', updatedAt: new Date() },
    },
    {
      fileId: 'AHC-F-1005',
      fileNumber: '1005/2024',
      fileName: 'Northern Rail Enterprises vs. Union of India',
      caseId: 'CASE-2024-005',
      caseNumber: 'WRIT/2024/780',
      cino: 'UPHC010000052024',
      caseType: 'WRIT',
      caseStatus: 'PENDING',
      // Untagged and no rack yet
      currentLocation: 'SHELF_ROOM',
    },
    {
      fileId: 'AHC-F-1006',
      fileNumber: '1006/2024',
      fileName: 'XYZ Infra Pvt Ltd vs. State Tax Tribunal',
      caseId: 'CASE-2024-006',
      caseNumber: 'WTAX/2024/180',
      cino: 'UPHC010000062024',
      caseType: 'WTAX',
      caseStatus: 'DISPOSED',
      rfidTag: 'E2806894000040178F2A9006',
      currentLocation: 'SHELF_ROOM',
      rackLocation: { rack: 'RACK-02', shelf: 'SHELF-A', updatedAt: new Date() },
    },
  ];

  await File.insertMany(demoFiles);
  console.log(`[seed] inserted ${demoFiles.length} demo files (mixed types, statuses, mapped/unmapped, racks)`);

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