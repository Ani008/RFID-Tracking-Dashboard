import mongoose from 'mongoose';

const { Schema } = mongoose;

const fileSchema = new Schema(
  {
    fileId: { type: String, required: true, unique: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    caseId: { type: String, required: true, trim: true },
    caseName: { type: String, required: true, trim: true },
    rfidTag: { type: String, required: true, unique: true, trim: true },
    currentLocation: {
      type: String,
      enum: ['SHELF_ROOM', 'COURT_ROOM', 'IN_TRANSIT'],
      default: 'SHELF_ROOM',
    },
    lastMovementAt: { type: Date },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

fileSchema.index({ rfidTag: 1 }, { unique: true });
fileSchema.index({ currentLocation: 1 });
fileSchema.index({ caseId: 1 });

export default mongoose.model('File', fileSchema);
