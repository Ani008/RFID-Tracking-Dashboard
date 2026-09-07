import mongoose from 'mongoose';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Ensures password hashes are never returned by default
    },
    role: {
      type: String,
      enum: ['admin', 'staff'],
      required: true,
      default: 'staff',
    },
    fullName: {
      type: String,
      trim: true,
      default: '',
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });

export default mongoose.model('User', userSchema);
