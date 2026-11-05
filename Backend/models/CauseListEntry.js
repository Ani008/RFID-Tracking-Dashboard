import mongoose from 'mongoose';

const { Schema } = mongoose;

const causeListEntrySchema = new Schema(
  {
    causeListDate: {
      type: String,
      required: true,
      trim: true, // "YYYY-MM-DD"
    },
    courtNumber: {
      type: String,
      required: true,
      trim: true,
    },
    bench: {
      type: String,
      trim: true,
      default: '',
    },
    serialNumber: {
      type: Number,
      required: true,
    },
    caseNumber: {
      type: String,
      trim: true,
      default: '',
    },
    cino: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    caseType: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    caseStatus: {
      type: String,
      enum: ['PENDING', 'DISPOSED', ''],
      default: '',
    },
    dedupeKey: {
      type: String,
      required: true,
      trim: true,
    },
    file: {
      type: Schema.Types.ObjectId,
      ref: 'File',
      default: null,
    },
    matchStatus: {
      type: String,
      enum: ['MATCHED', 'UNMATCHED', 'AMBIGUOUS'],
      required: true,
      default: 'UNMATCHED',
    },
    matchReason: {
      type: String,
      default: '',
    },
    syncRunId: {
      type: Schema.Types.ObjectId,
      ref: 'SyncRun',
      default: null,
    },
    firstSeenAt: {
      type: Date,
      default: Date.now,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Unique index: Each case appearance on a specific date in a specific court is unique
causeListEntrySchema.index(
  { causeListDate: 1, courtNumber: 1, dedupeKey: 1 },
  { unique: true }
);

// Query indexes
causeListEntrySchema.index({ causeListDate: 1, courtNumber: 1, serialNumber: 1 });
causeListEntrySchema.index({ cino: 1 });
causeListEntrySchema.index({ caseNumber: 1 });
causeListEntrySchema.index({ matchStatus: 1 });
causeListEntrySchema.index({ file: 1 });
causeListEntrySchema.index({ syncRunId: 1 });

export default mongoose.model('CauseListEntry', causeListEntrySchema);

