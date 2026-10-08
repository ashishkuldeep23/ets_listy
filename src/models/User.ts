import mongoose, { type Model } from "mongoose";
import { LIMITS } from "@/lib/limits";

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: LIMITS.USER_NAME_MAX },
    // `unique` creates the index that also guards against two signups racing.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: LIMITS.EMAIL_MAX },
    // Never returned by queries unless asked for with .select("+passwordHash").
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

// Reuse the compiled model across dev hot reloads.
export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser> | undefined) ?? mongoose.model<IUser>("User", userSchema);
