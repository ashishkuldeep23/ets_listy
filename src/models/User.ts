import mongoose, { type Model } from "mongoose";
import { LIMITS } from "@/lib/limits";

export interface IUser {
  name: string;
  email: string;
  /** Missing for accounts that log in with Google. */
  passwordHash?: string;
  /** Google's id for the account, once it has logged in with Google. */
  googleId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: LIMITS.USER_NAME_MAX },
    // `unique` creates the index that also guards against two signups racing.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: LIMITS.EMAIL_MAX },
    // Never returned by queries unless asked for with .select("+passwordHash").
    passwordHash: { type: String, select: false },
    // Sparse: many accounts have none, and they mustn't clash with each other.
    googleId: { type: String, unique: true, sparse: true, select: false },
  },
  { timestamps: true }
);

// Reuse the compiled model across dev hot reloads.
export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser> | undefined) ?? mongoose.model<IUser>("User", userSchema);
