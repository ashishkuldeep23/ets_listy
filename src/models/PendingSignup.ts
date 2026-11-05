import mongoose, { type Model } from "mongoose";
import { LIMITS } from "@/lib/limits";

// A signup waiting for its email link to be opened. The real User is made only
// then, so an address nobody proved they own never becomes an account.
// Only the token's hash is stored: a database leak can't activate anything.

export interface IPendingSignup {
  name: string;
  email: string;
  passwordHash: string;
  tokenHash: string;
  /** Where to go after activating (already checked by safeNextPath). */
  nextPath: string;
  lastSentAt: Date;
  expiresAt: Date;
}

const pendingSignupSchema = new mongoose.Schema<IPendingSignup>({
  name: { type: String, required: true, trim: true, maxlength: LIMITS.USER_NAME_MAX },
  // One per address: signing up again replaces it, which kills the older link.
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: LIMITS.EMAIL_MAX },
  passwordHash: { type: String, required: true, select: false },
  tokenHash: { type: String, required: true, unique: true },
  nextPath: { type: String, required: true, default: "/" },
  lastSentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

// MongoDB removes expired rows by itself (within a minute or so; routes also check the date).
pendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingSignup: Model<IPendingSignup> =
  (mongoose.models.PendingSignup as Model<IPendingSignup> | undefined) ??
  mongoose.model<IPendingSignup>("PendingSignup", pendingSignupSchema);
