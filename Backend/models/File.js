import mongoose from 'mongoose';

const { Schema } = mongoose;

const fileSchema = new Schema(
  {
    fileId: { type: String, required: true, unique: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    caseId: { type: String, required: true, trim: true },
    caseName: { type: String, required: false, trim: true, default: '' },
    rfidTag: { type: String, required: false, trim: true },
    caseNumber: { type: String, required: false, trim: true },
    cino: { type: String, required: false, trim: true, uppercase: true },
    fileNumber: { type: String, required: false, trim: true },
    caseType: { type: String, required: false, trim: true, uppercase: true },
    caseStatus: {
      type: String,
      enum: ['PENDING', 'DISPOSED'],
      default: 'PENDING',
    },
    rackLocation: {
      rack: { type: String, trim: true },
      shelf: { type: String, trim: true },
      updatedAt: { type: Date },
      updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    currentLocation: {
      type: String,
      enum: ['SHELF_ROOM', 'COURT_ROOM', 'IN_TRANSIT'],
      default: 'SHELF_ROOM',
    },
    lastMovementAt: { type: Date },
    archived: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: rfidMapped is true if rfidTag is a non-empty string
fileSchema.virtual('rfidMapped').get(function () {
  return typeof this.rfidTag === 'string' && this.rfidTag.trim().length > 0;
});

// Existing operational indexes
fileSchema.index({ currentLocation: 1 });
fileSchema.index({ caseId: 1 });

// RFID tag index: unique sparse/partial (only when rfidTag is non-empty string)
fileSchema.index(
  { rfidTag: 1 },
  {
    unique: true,
    partialFilterExpression: { rfidTag: { $type: 'string', $gt: '' } },
  }
);

// CINO index: unique partial (only when cino is non-empty string)
fileSchema.index(
  { cino: 1 },
  {
    unique: true,
    partialFilterExpression: { cino: { $type: 'string', $gt: '' } },
  }
);

// Case query indexes
fileSchema.index({ caseNumber: 1 });
fileSchema.index({ fileNumber: 1 });
fileSchema.index({ caseType: 1 });
fileSchema.index({ caseStatus: 1 });
fileSchema.index({ caseType: 1, caseStatus: 1 });

export default mongoose.model('File', fileSchema);