# Allahabad High Court — RFID File-Tracking System

Full-stack real-time RFID tracking dashboard for legal case files inside court buildings. Tracks physical movements of case files between the **Shelf / Record Room** and **Courtrooms**, preventing misplaced records, enabling automated end-of-day audit reports, and supporting handheld-reader file search.

---

## 🚀 Key Features

### 1. Extended Case & File Data Model (Phase 1)
- New optional fields: `caseNumber`, `cino` (unique partial sparse index), `fileNumber`, `caseType`, `caseStatus` (`PENDING` | `DISPOSED`), and `rackLocation: { rack, shelf, updatedAt, updatedBy }`.
- **Pending Mapping Support**: `rfidTag` is completely optional with a sparse unique index so physical files can be cataloged before an RFID tag is paired.
- **Computed Virtual**: `rfidMapped` indicates whether an RFID tag is currently associated with the record.
- **Audit Logging**: All changes to file metadata, tag reassignment, and rack locations are recorded with user attribution.

### 2. Advanced Multi-Parameter Search & Filters (Phase 2 & 3)
- Paginated search API supporting combinations of:
  - `q` / `search`: Regex-escaped text search across `fileId`, `fileName`, `caseId`, `caseName`, `caseNumber`, `cino`, `fileNumber` and `rfidTag`. Each word must match at least one field (capped at 100 chars).
  - `mapped`: Filter by RFID tag assignment (`true` or `false`).
  - `status`: Filter by case status (`PENDING` or `DISPOSED`).
  - `caseType`: Filter by whitelisted case types retrieved dynamically from `/api/files/case-types`.
- **Pending Mapping Queue**: Dedicated `/rfid-pending` page with direct tag-pairing workflow.
- URL-synced search state, debounced inputs (400ms), and AbortController request cancellation.

### 3. Handheld Reader Search (`/search`)
- **Scan all**: scan with the handheld UHF reader and every tag in range is looked up (`POST /api/files/lookup-tags`) and shown as a file card.
- **Find a specific file**: enter a File ID / case number / name, then scan; every other tag is ignored and a "Found it!" card appears when the file is read.
- The reader app (UHF) must have **Send Mode = Focus** so scans are typed into the page. Responsive for phone / handheld screens.
- **In-Field Rack Updating**: Staff and Admin can update file rack and shelf positions via `PUT /api/files/:fileId/rack` with instant audit recording.

### 4. Role-Based Access Control (RBAC) & Security Hardening (Phase 7)
- Two roles: **Admin** (system configuration, file registration, user management) and **Staff** (live tracking, dwell monitors, rack updating, search).
- Hardened against NoSQL injection, parameter tampering, XSS, malformed file uploads, and unauthorized privilege escalation.
- Rate limits, Helmet security headers, and strict authentication on both REST endpoints and Socket.io handshakes.

---

## 📦 Default Accounts (Seeded)

| Username | Password | Role | Description |
|---|---|---|---|
| `admin` | `Admin@123` | **Admin** | Full system administration, file edits, syncs, user management |
| `staff` | `Staff@123` | **Staff** | Day-to-day operations, movements, reports, search, rack updates |

---

## ⚙️ Environment Variables

Create `Backend/.env`:
```ini
PORT=4000
MONGODB_URI=mongodb://localhost:27017/rfid-tracker
JWT_SECRET=rfid-tracking-secret-key-allahabad-high-court-2026
READER_MODE=mock
DESKTOPSCANNER=local
CLIENT_URL=http://localhost:5173

# Case types always listed in dropdowns (real data types are added automatically)
CASE_TYPES=WTAX,BAIL
```

Create `Frontend/.env`:
```ini
VITE_API_BASE_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
```

---

## 🛠️ Quick Start & Migration Guide

### 1. Database Seed & Migration
```bash
cd Backend
npm install

# 1. Create the initial admin/staff accounts and gates (no demo case files, never deletes data)
npm run seed

# 1b. If an older version already put demo files in your DB, remove them once:
npm run purge:demo            # dry run - only reports
npm run purge:demo -- --apply # deletes the demo rows

# 2. Run schema migration (safe & idempotent)
npm run migrate:phase1 -- --dry-run   # Preview migration changes
npm run migrate:phase1               # Apply migration (sets default caseStatus)
```

### 2. Start Application Servers
```bash
# Terminal 1: Backend API (port 4000)
cd Backend
npm run dev

# Terminal 2: Frontend Dashboard (port 5173)
cd Frontend
npm install
npm run dev
```

---

## 🧪 Verification & Automated Test Suites

Run automated test suites from the `Backend` directory:

| Test Suite | Command | What It Verifies |
|---|---|---|
| **Phase 1** | `npm run test:phase1` | File schema, optional RFID tag, sparse unique CINO/RFID indexes |
| **Phase 2** | `npm run test:phase2` | Combined search, filters (`mapped`, `status`, `caseType`, `q`), pagination |
| **Security** | `npm run test:security` | NoSQL injection, RBAC, JWT protection, upload validation, security headers |
| **End-to-End**| `npm run test:e2e` | Complete flow from registration to scanning, reports and user management |
| **Load Check**| `npm run test:load` | 5,000 files load benchmark (all queries < 10ms) |

---

## 🔒 Route & API Map

```
# Auth & User Management
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/users                            (admin-only)
POST   /api/users                            (admin-only)
PUT    /api/users/:id                        (admin-only)
DELETE /api/users/:id                        (admin-only)

# Files & Metadata
GET    /api/files                            (query: mapped, status, caseType, q, page, limit, sort)
GET    /api/files/case-types                 (distinct sorted case types)
GET    /api/files/pending-mapping            (unmapped file queue)
GET    /api/files/:fileId
POST   /api/files                            (admin-only)
PUT    /api/files/:fileId                    (admin-only — hardened with audit trail)
PUT    /api/files/:fileId/rack               (admin & staff — update rack/shelf)
DELETE /api/files/:fileId                    (admin-only — soft archive)
POST   /api/files/bulk-upload                (admin-only — Excel/CSV import)
POST   /api/files/lookup-tags                (admin & staff — handheld search, body: { tags: [...] })


# Movements & Scanner Ingestion
POST   /api/movements                        (scanner ingestion & simulator)
GET    /api/movements

# Reports & CSV Export
GET    /api/reports/court-room-files?from=&to=&thresholdHours=
GET    /api/reports/movements?from=&to=&gateId=&direction=&page=
GET    /api/reports/unknown-tags?from=&to=&page=
GET    /api/reports/case/:caseId
GET    /api/reports/:type/export             (CSV stream)
```
