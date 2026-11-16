import CauseListEntry from '../../models/CauseListEntry.js';
import SyncRun from '../../models/SyncRun.js';
import File from '../../models/File.js';
import AuditLog from '../../models/AuditLog.js';

function computeDedupeKey(cino, caseNumber, caseType) {
  if (cino && typeof cino === 'string' && cino.trim()) {
    return cino.trim().toUpperCase();
  }
  const normalizedCaseNo = String(caseNumber || '').trim().replace(/[\s/_-]+/g, '').toUpperCase();
  const normalizedType = String(caseType || '').trim().toUpperCase();
  return `${normalizedCaseNo}_${normalizedType}`;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Runs a Cause List Synchronization run.
 */
export async function runSync({
  date,
  adapter,
  userId = null,
  username = 'system',
  trigger = 'MANUAL',
}) {
  // Guard against simultaneous running sync for the same date
  const existingActive = await SyncRun.findOne({
    'params.date': date,
    status: 'RUNNING',
  });
  if (existingActive) {
    throw new Error(`A synchronization run for date "${date}" is already in progress.`);
  }

  // 1. Create SyncRun
  const syncRun = await SyncRun.create({
    trigger,
    requestedBy: userId,
    username,
    params: { date },
    startedAt: new Date(),
    status: 'RUNNING',
  });

  const counts = {
    received: 0,
    inserted: 0,
    updated: 0,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    failed: 0,
  };
  const failures = [];

  try {
    // 2. Fetch raw rows via adapter
    const rawRows = await adapter.fetchEntries({ defaultDate: date, date });
    counts.received = rawRows.length;

    // 3. Process each row
    for (const row of rawRows) {
      try {
        const rowDate = row.causeListDate || date;
        if (!rowDate || !DATE_REGEX.test(rowDate)) {
          throw new Error(`Invalid date format "${rowDate}". Must be YYYY-MM-DD.`);
        }
        if (!row.courtNumber) {
          throw new Error('Court number is required.');
        }
        if (isNaN(row.serialNumber) || row.serialNumber <= 0) {
          throw new Error(`Invalid serial number "${row.serialNumber}". Must be a positive integer.`);
        }
        if (!row.cino && !row.caseNumber) {
          throw new Error('Each row must contain at least a CINO or a Case Number.');
        }

        const cleanCino = row.cino ? row.cino.trim().toUpperCase() : '';
        const cleanCaseNo = row.caseNumber ? row.caseNumber.trim() : '';
        const cleanType = row.caseType ? row.caseType.trim().toUpperCase() : '';
        const cleanStatus = row.caseStatus && ['PENDING', 'DISPOSED'].includes(row.caseStatus.trim().toUpperCase())
          ? row.caseStatus.trim().toUpperCase()
          : '';

        const dedupeKey = computeDedupeKey(cleanCino, cleanCaseNo, cleanType);

        // Matching Logic
        let matchedFile = null;
        let matchStatus = 'UNMATCHED';
        let matchReason = 'NO_FILE';

        if (cleanCino) {
          matchedFile = await File.findOne({ cino: cleanCino, archived: { $ne: true } });
          if (matchedFile) {
            matchStatus = 'MATCHED';
            matchReason = 'CINO';
          }
        }

        if (!matchedFile && cleanCaseNo) {
          const query = {
            $or: [{ caseNumber: cleanCaseNo }, { caseId: cleanCaseNo }],
            archived: { $ne: true },
          };
          if (cleanType) query.caseType = cleanType;

          const candidates = await File.find(query).limit(2);
          if (candidates.length === 1) {
            matchedFile = candidates[0];
            matchStatus = 'MATCHED';
            matchReason = 'CASE_NUMBER';
          } else if (candidates.length > 1) {
            matchStatus = 'AMBIGUOUS';
            matchReason = 'MULTIPLE_FILES';
          }
        }

        if (matchStatus === 'MATCHED') counts.matched++;
        else if (matchStatus === 'AMBIGUOUS') counts.ambiguous++;
        else counts.unmatched++;

        // Optional Case Status Refresh on matched file
        if (matchedFile && cleanStatus && matchedFile.caseStatus !== cleanStatus) {
          const beforeStatus = matchedFile.caseStatus;
          matchedFile.caseStatus = cleanStatus;
          await matchedFile.save();

          await AuditLog.create({
            userId,
            username,
            action: 'CAUSELIST_SYNC',
            targetType: 'File',
            targetId: matchedFile.fileId,
            before: { caseStatus: beforeStatus },
            after: { caseStatus: cleanStatus },
            reason: `Auto-updated from Cause List sync (${rowDate}, Court ${row.courtNumber})`,
          });
        }

        // Upsert CauseListEntry
        const existingEntry = await CauseListEntry.findOne({
          causeListDate: rowDate,
          courtNumber: row.courtNumber,
          dedupeKey,
        });

        if (existingEntry) {
          existingEntry.bench = row.bench || existingEntry.bench;
          existingEntry.serialNumber = row.serialNumber;
          existingEntry.caseNumber = cleanCaseNo || existingEntry.caseNumber;
          existingEntry.cino = cleanCino || existingEntry.cino;
          existingEntry.caseType = cleanType || existingEntry.caseType;
          if (cleanStatus) existingEntry.caseStatus = cleanStatus;
          existingEntry.file = matchedFile ? matchedFile._id : null;
          existingEntry.matchStatus = matchStatus;
          existingEntry.matchReason = matchReason;
          existingEntry.lastSyncedAt = new Date();
          existingEntry.syncRunId = syncRun._id;
          await existingEntry.save();
          counts.updated++;
        } else {
          await CauseListEntry.create({
            causeListDate: rowDate,
            courtNumber: row.courtNumber,
            bench: row.bench || '',
            serialNumber: row.serialNumber,
            caseNumber: cleanCaseNo,
            cino: cleanCino,
            caseType: cleanType,
            caseStatus: cleanStatus,
            dedupeKey,
            file: matchedFile ? matchedFile._id : null,
            matchStatus,
            matchReason,
            syncRunId: syncRun._id,
            firstSeenAt: new Date(),
            lastSyncedAt: new Date(),
          });
          counts.inserted++;
        }
      } catch (rowErr) {
        counts.failed++;
        failures.push({
          rowIndex: row._rowIndex || 0,
          rawRow: row._raw || row,
          error: rowErr.message,
          retryable: true,
        });
      }
    }

    // 4. Close SyncRun
    syncRun.finishedAt = new Date();
    syncRun.counts = counts;
    syncRun.failures = failures;
    syncRun.status = counts.failed > 0 ? (counts.inserted + counts.updated > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS';
    await syncRun.save();

    await AuditLog.create({
      userId,
      username,
      action: 'CAUSELIST_SYNC',
      targetType: 'SyncRun',
      targetId: String(syncRun._id),
      after: {
        date,
        status: syncRun.status,
        counts,
      },
      reason: `Cause List Sync (${trigger}) for ${date}`,
    });

    return syncRun;
  } catch (fatalErr) {
    syncRun.finishedAt = new Date();
    syncRun.status = 'FAILED';
    syncRun.counts = counts;
    failures.push({ error: fatalErr.message, retryable: false });
    syncRun.failures = failures;
    await syncRun.save();
    throw fatalErr;
  }
}

/**
 * Re-runs matching for unmatched or ambiguous cause list entries.
 */
export async function rematchEntries({ date, userId = null, username = 'system' } = {}) {
  const query = {
    matchStatus: { $in: ['UNMATCHED', 'AMBIGUOUS'] },
  };
  if (date) query.causeListDate = date;

  const entries = await CauseListEntry.find(query);
  let rematchedCount = 0;
  let newlyMatchedCount = 0;

  for (const entry of entries) {
    let matchedFile = null;
    let matchStatus = 'UNMATCHED';
    let matchReason = 'NO_FILE';

    if (entry.cino) {
      matchedFile = await File.findOne({ cino: entry.cino, archived: { $ne: true } });
      if (matchedFile) {
        matchStatus = 'MATCHED';
        matchReason = 'CINO';
      }
    }

    if (!matchedFile && entry.caseNumber) {
      const q = {
        $or: [{ caseNumber: entry.caseNumber }, { caseId: entry.caseNumber }],
        archived: { $ne: true },
      };
      if (entry.caseType) q.caseType = entry.caseType;

      const candidates = await File.find(q).limit(2);
      if (candidates.length === 1) {
        matchedFile = candidates[0];
        matchStatus = 'MATCHED';
        matchReason = 'CASE_NUMBER';
      } else if (candidates.length > 1) {
        matchStatus = 'AMBIGUOUS';
        matchReason = 'MULTIPLE_FILES';
      }
    }

    if (matchStatus === 'MATCHED') {
      entry.file = matchedFile._id;
      entry.matchStatus = matchStatus;
      entry.matchReason = matchReason;
      entry.lastSyncedAt = new Date();
      await entry.save();
      newlyMatchedCount++;
    }
    rematchedCount++;
  }

  await AuditLog.create({
    userId,
    username,
    action: 'CAUSELIST_REMATCH',
    targetType: 'CauseListEntry',
    targetId: date || 'ALL',
    after: { rematchedCount, newlyMatchedCount },
    reason: `Rematch triggered for ${rematchedCount} entries`,
  });

  return { rematchedCount, newlyMatchedCount };
}

/**
 * Retries failed rows from a previous SyncRun.
 */
export async function retryFailedRows({ runId, userId = null, username = 'system' }) {
  const run = await SyncRun.findById(runId);
  if (!run) throw new Error(`SyncRun "${runId}" not found`);

  const retryableFailures = run.failures.filter((f) => f.retryable !== false);
  if (retryableFailures.length === 0) {
    return { message: 'No retryable failures in this run', run };
  }

  const remainingFailures = [];
  let recoveredCount = 0;

  for (const failure of retryableFailures) {
    const row = failure.rawRow;
    try {
      const rowDate = row.causeListDate || run.params?.date;
      if (!rowDate || !DATE_REGEX.test(rowDate)) {
        throw new Error(`Invalid date format "${rowDate}". Must be YYYY-MM-DD.`);
      }
      if (!row.courtNumber) throw new Error('Court number is required.');
      if (isNaN(row.serialNumber) || row.serialNumber <= 0) throw new Error('Valid serial number is required.');
      if (!row.cino && !row.caseNumber) throw new Error('At least CINO or Case Number is required.');

      const cleanCino = row.cino ? String(row.cino).trim().toUpperCase() : '';
      const cleanCaseNo = row.caseNumber ? String(row.caseNumber).trim() : '';
      const cleanType = row.caseType ? String(row.caseType).trim().toUpperCase() : '';
      const cleanStatus = row.caseStatus ? String(row.caseStatus).trim().toUpperCase() : '';

      const dedupeKey = computeDedupeKey(cleanCino, cleanCaseNo, cleanType);

      let matchedFile = null;
      let matchStatus = 'UNMATCHED';
      let matchReason = 'NO_FILE';

      if (cleanCino) {
        matchedFile = await File.findOne({ cino: cleanCino, archived: { $ne: true } });
        if (matchedFile) {
          matchStatus = 'MATCHED';
          matchReason = 'CINO';
        }
      }

      if (!matchedFile && cleanCaseNo) {
        const q = {
          $or: [{ caseNumber: cleanCaseNo }, { caseId: cleanCaseNo }],
          archived: { $ne: true },
        };
        if (cleanType) q.caseType = cleanType;
        const candidates = await File.find(q).limit(2);
        if (candidates.length === 1) {
          matchedFile = candidates[0];
          matchStatus = 'MATCHED';
          matchReason = 'CASE_NUMBER';
        } else if (candidates.length > 1) {
          matchStatus = 'AMBIGUOUS';
          matchReason = 'MULTIPLE_FILES';
        }
      }

      await CauseListEntry.findOneAndUpdate(
        { causeListDate: rowDate, courtNumber: row.courtNumber, dedupeKey },
        {
          causeListDate: rowDate,
          courtNumber: row.courtNumber,
          bench: row.bench || '',
          serialNumber: row.serialNumber,
          caseNumber: cleanCaseNo,
          cino: cleanCino,
          caseType: cleanType,
          caseStatus: cleanStatus,
          dedupeKey,
          file: matchedFile ? matchedFile._id : null,
          matchStatus,
          matchReason,
          syncRunId: run._id,
          lastSyncedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      recoveredCount++;
      run.counts.inserted++;
      run.counts.failed = Math.max(0, run.counts.failed - 1);
    } catch (err) {
      remainingFailures.push({
        rowIndex: failure.rowIndex,
        rawRow: row,
        error: err.message,
        retryable: true,
      });
    }
  }

  run.failures = remainingFailures;
  run.status = remainingFailures.length === 0 ? 'SUCCESS' : 'PARTIAL';
  await run.save();

  return { recoveredCount, remainingFailuresCount: remainingFailures.length, run };
}


/**
 * Links existing UNMATCHED / AMBIGUOUS cause list entries to a File.
 * Called when a file is registered or its CINO / case number / type changes,
 * so cause list rows synced BEFORE the file existed become searchable
 * (handheld, rack location) without waiting for another sync.
 * Never creates entries or files, so it cannot produce duplicates.
 */
export async function relinkEntriesForFile(file) {
  if (!file || file.archived) return 0;
  const or = [];
  if (file.cino) or.push({ cino: String(file.cino).trim().toUpperCase() });
  const cn = file.caseNumber ? String(file.caseNumber).trim() : '';
  if (cn) or.push({ caseNumber: cn });
  if (file.caseId) or.push({ caseNumber: String(file.caseId).trim() });
  if (or.length === 0) return 0;

  const entries = await CauseListEntry.find({
    matchStatus: { $in: ['UNMATCHED', 'AMBIGUOUS'] },
    $or: or,
  });

  let linked = 0;
  for (const entry of entries) {
    let matched = null;
    let reason = '';

    if (entry.cino) {
      matched = await File.findOne({ cino: entry.cino, archived: { $ne: true } });
      if (matched) reason = 'CINO';
    }
    if (!matched && entry.caseNumber) {
      const q = {
        $or: [{ caseNumber: entry.caseNumber }, { caseId: entry.caseNumber }],
        archived: { $ne: true },
      };
      if (entry.caseType) q.caseType = entry.caseType;
      const candidates = await File.find(q).limit(2);
      if (candidates.length === 1) {
        matched = candidates[0];
        reason = 'CASE_NUMBER';
      }
    }
    if (matched) {
      entry.file = matched._id;
      entry.matchStatus = 'MATCHED';
      entry.matchReason = reason;
      entry.lastSyncedAt = new Date();
      await entry.save();
      linked++;
    }
  }
  return linked;
}
