import mongoose from 'mongoose';

const { Schema } = mongoose;

const failureSchema = new Schema(
  {
    rowIndex: { type: Number },
    rawRow: { type: Schema.Types.Mixed },
    error: { type: String, required: true },
    retryable: { type: Boolean, default: true },
  },
  { _id: false }
);

const syncRunSchema = new Schema(
  {
    trigger: {
      type: String,
      enum: ['MANUAL', 'SCHEDULED'],
      default: 'MANUAL',
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    username: {
      type: String,
      default: 'system',
    },
    params: {
      type: Schema.Types.Mixed,
      default: {},
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    finishedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'],
      default: 'RUNNING',
    },
    counts: {
      received: { type: Number, default: 0 },
      inserted: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      matched: { type: Number, default: 0 },
      unmatched: { type: Number, default: 0 },
      ambiguous: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    failures: [failureSchema],
  },
  {
    timestamps: true,
  }
);

syncRunSchema.index({ startedAt: -1 });
syncRunSchema.index({ status: 1 });

export default mongoose.model('SyncRun', syncRunSchema);

