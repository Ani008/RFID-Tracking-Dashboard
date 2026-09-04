import mongoose from 'mongoose';

const { Schema } = mongoose;

const gateSchema = new Schema(
  {
    gateId: {
      type: String,
      unique: true,
      required: true,
      enum: ['SHELF_ROOM_DOOR', 'COURT_ROOM_DOOR'],
    },
    label: { type: String, required: true },
    location: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model('Gate', gateSchema);
