import mongoose, { type Model, type Types } from "mongoose";
import { LIMITS } from "@/lib/limits";

// One browser or phone that agreed to get my notifications. The endpoint is
// unique: when someone else logs in on that device it moves to them, so
// reminders never reach the person who used it before.

export interface IPushSubscription {
  user: Types.ObjectId;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
  updatedAt: Date;
}

const pushSubscriptionSchema = new mongoose.Schema<IPushSubscription>(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: LIMITS.PUSH_ENDPOINT_MAX },
    p256dh: { type: String, required: true, maxlength: LIMITS.PUSH_KEY_MAX },
    auth: { type: String, required: true, maxlength: LIMITS.PUSH_KEY_MAX },
  },
  { timestamps: true }
);

// Reuse the compiled model across dev hot reloads.
export const PushSubscription: Model<IPushSubscription> =
  (mongoose.models.PushSubscription as Model<IPushSubscription> | undefined) ??
  mongoose.model<IPushSubscription>("PushSubscription", pushSubscriptionSchema);
