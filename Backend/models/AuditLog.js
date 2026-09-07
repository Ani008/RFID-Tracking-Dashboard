import mongoose from 'mongoose';

const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    username: {
      type: String,
      required: true,
      default: 'system',
    },
    action: {
      type: String,
      enum: ['FILE_CREATE', 'FILE_UPDATE', 'TAG_REASSIGN', 'FILE_ARCHIVE'],
      required: true,
    },
    targetType: {
      type: String,
      default: 'File',
    },
    targetId: {
      type: String,
      required: true,
    },
    before: {
      type: Schema.Types.Mixed,
      default: {},
    },
    after: {
      type: Schema.Types.Mixed,
      default: {},
    },
    reason: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ targetId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ timestamp: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
