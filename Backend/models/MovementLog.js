import mongoose from 'mongoose';

const { Schema } = mongoose;

// Append-only. Never update or delete documents in this collection.
const movementLogSchema = new Schema(
  {
    rfidTag: { type: String, required: true },
    fileId: { type: String, required: true },
    gateId: {
      type: String,
      enum: ['SHELF_ROOM_DOOR', 'COURT_ROOM_DOOR'],
      required: true,
    },
    direction: { type: String, enum: ['IN', 'OUT'], required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    deviceId: { type: String },
    batchId: { type: String },
    resultingLocation: { type: String }, // File.currentLocation after this movement was applied
  },
  { timestamps: true }
);

movementLogSchema.index({ fileId: 1 });
movementLogSchema.index({ timestamp: -1 });
movementLogSchema.index({ gateId: 1, timestamp: -1 });

export default mongoose.model('MovementLog', movementLogSchema);
