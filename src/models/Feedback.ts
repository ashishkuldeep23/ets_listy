import mongoose, { type Model, type Types } from "mongoose";
import { LIMITS } from "@/lib/limits";
import type { FeedbackDTO } from "@/types";

// Feedback left on the feedback page. Deleting only sets deletedAt: the row
// stays in the database, so every query must filter with NOT_DELETED.

export interface IFeedback {
  user: Types.ObjectId;
  name: string;
  rating: number;
  message: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const NOT_DELETED = { deletedAt: null };

const feedbackSchema = new mongoose.Schema<IFeedback>(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: LIMITS.FEEDBACK_NAME_MAX },
    rating: { type: Number, required: true, min: LIMITS.FEEDBACK_RATING_MIN, max: LIMITS.FEEDBACK_RATING_MAX },
    message: { type: String, required: true, trim: true, maxlength: LIMITS.FEEDBACK_MESSAGE_MAX },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The page lists the newest entries that aren't deleted.
feedbackSchema.index({ deletedAt: 1, createdAt: -1 });

type Stored = IFeedback & { _id: Types.ObjectId };

/** `userId` is who is asking: the author's id itself is never sent. */
export function serializeFeedback(feedback: Stored, userId: string): FeedbackDTO {
  return {
    id: String(feedback._id),
    name: feedback.name,
    rating: feedback.rating,
    message: feedback.message,
    mine: String(feedback.user) === userId,
    createdAt: feedback.createdAt,
    updatedAt: feedback.updatedAt,
  };
}

// Reuse the compiled model across dev hot reloads.
export const Feedback: Model<IFeedback> =
  (mongoose.models.Feedback as Model<IFeedback> | undefined) ?? mongoose.model<IFeedback>("Feedback", feedbackSchema);
