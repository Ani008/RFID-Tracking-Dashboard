import mongoose from 'mongoose';

const { Schema } = mongoose;

// Same shape as MovementLog but for tags that didn't match any registered File.
const unknownTagSchema = new Schema(
  {
    rfidTag: { type: String, required: true },
    gateId: {
      type: String,
      enum: ['SHELF_ROOM_DOOR', 'COURT_ROOM_DOOR'],
      required: true,
    },
    direction: { type: String, enum: ['IN', 'OUT'], required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    deviceId: { type: String },
    batchId: { type: String },
  },
  { timestamps: true }
);

unknownTagSchema.index({ rfidTag: 1 });
unknownTagSchema.index({ timestamp: -1 });

export default mongoose.model('UnknownTag', unknownTagSchema);
