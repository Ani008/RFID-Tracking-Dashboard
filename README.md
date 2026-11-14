# Allahabad High Court — RFID File-Tracking System

Full-stack real-time RFID tracking dashboard for legal case files inside court buildings. Tracks physical movements of case files between the **Shelf / Record Room** and **Courtrooms**, preventing misplaced records and enabling automated end-of-day audit reports, court cause list synchronizations, and mobile-friendly handheld rack management.

---

## 🚀 Key Features

### 1. Extended Case & File Data Model (Phase 1)
- New optional fields: `caseNumber`, `cino` (unique partial sparse index), `fileNumber`, `caseType`, `caseStatus` (`PENDING` | `DISPOSED`), and `rackLocation: { rack, shelf, updatedAt, updatedBy }`.
- **Pending Mapping Support**: `rfidTag` is completely optional with a sparse unique index so physical files can be cataloged before an RFID tag is paired.
- **Computed Virtual**: `rfidMapped` indicates whether an RFID tag is currently associated with the record.
- **Audit Logging**: All changes to file metadata, tag reassignment, and rack locations are recorded with user attribution.

### 2. Advanced Multi-Parameter Search & Filters (Phase 2 & 3)
- Paginated search API supporting combinations of:
  - `q`: Regex-escaped text search across `caseNumber`, `cino`, and `fileNumber` (capped at 50 chars).
  - `mapped`: Filter by RFID tag assignment (`true` or `false`).
  - `status`: Filter by case status (`PENDING` or `DISPOSED`).
  - `caseType`: Filter by whitelisted case types retrieved dynamically from `/api/files/case-types`.
- **Pending Mapping Queue**: Dedicated `/rfid-pending` page with direct tag-pairing workflow.
- URL-synced search state, debounced inputs (400ms), and AbortController request cancellation.

### 3. Court Cause List Sync & File Matching Engine (Phase 4 & 5)
- **Multi-Format Ingestion**: Pluggable adapter architecture supporting `.xlsx`, `.xls`, `.csv`, `.json` uploads and automated HTTP API stubs.
- **Smart Matching**: Automatically matches court cause list entries against files using CINO first, falling back to caseNumber normalization with duplicate protection.
- **Sync Runs & Audit**: Comprehensive logs tracking received, inserted, updated, matched, unmatched, and failed records with retry capabilities.
- **Cause List Management UI (`/cause-list`)**:
  - **Cause List Tab**: Filter by date, court number, case type, status, and match result with one-click case history drawer.
  - **Unmatched Tab**: View unmatched/ambiguous court listings with one-click "Re-match" after file CINO updates.
  - **Sync Logs Tab**: Detailed sync history, row-by-row error review, and one-click failure retries.

### 4. Handheld Search & Physical Rack Management (Phase 6)
- **Mobile-First Search (`/handheld`)**: Large touch-friendly tap targets, instant case-type chips, court filtering, and real-time availability badges:
  - `LOCATED`: Tag paired and rack location assigned.
  - `NO_RACK`: Tag paired but rack location not yet recorded.
  - `NO_RFID`: File registered but RFID tag not yet paired.
  - `NO_FILE`: Cause list appearance with no matching physical file record.
- **In-Field Rack Updating**: Staff and Admin can update file rack and shelf positions via `PUT /api/files/:fileId/rack` with instant audit recording.

### 5. Role-Based Access Control (RBAC) & Security Hardening (Phase 7)
- Two roles: **Admin** (system configuration, file registration, user management, cause list sync) and **Staff** (live tracking, dwell monitors, rack updating, handheld search).
- Hardened against NoSQL injection, parameter tampering, XSS, malformed file uploads, and unauthorized privilege escalation.
- Rate limits, Helmet security headers, and strict authentication on both REST endpoints and Socket.io handshakes.

---

## 📦 Default Accounts (Seeded)

| Username | Password | Role | Description |
|---|---|---|---|
| `admin` | `Admin@123` | **Admin** | Full system administration, file edits, syncs, user management |
| `staff` | `Staff@123` | **Staff** | Day-to-day operations, movements, reports, handheld search, rack updates |
| `clerk1` | `Clerk@123` | **Staff** | Record room clerk account |

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

# Optional: External Cause List Integration
CAUSELIST_API_URL=https://causelist.example.gov.in/api/v1
CAUSELIST_API_KEY=your-api-key-here
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

# 1. Seed demo database with initial users, gates, and files
npm run seed

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
| **Phase 4** | `npm run test:phase4` | Cause list models, CSV/XLSX parsing, CINO matching, sync retries, rematch |
| **Phase 6** | `npm run test:phase6` | Handheld search API, availability calculation, rack location updates |
| **Security** | `npm run test:security` | NoSQL injection, RBAC, JWT protection, upload validation, security headers |
| **End-to-End**| `npm run test:e2e` | Complete flow across all phases from registration to cause list & handheld |
| **Load Check**| `npm run test:load` | 5,000 files + 2,000 cause-list rows load benchmark (all queries < 10ms) |

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

# Cause List System
POST   /api/causelist/sync                   (admin-only — upload file or trigger HTTP sync)
POST   /api/causelist/sync/:runId/retry      (admin-only — retry failed sync rows)
POST   /api/causelist/rematch                (admin-only — rematch unmatched entries against files)
GET    /api/causelist                        (query: date, court, caseType, status, match, mapped, q)
GET    /api/causelist/unmatched              (query: date, page, limit)
GET    /api/causelist/sync-runs              (query: page, limit)
GET    /api/causelist/sync-runs/:id
GET    /api/causelist/history/:cino          (case appearance history)

# Handheld Device API
GET    /api/handheld/causelist               (query: date, q, caseType, court, limit)

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
