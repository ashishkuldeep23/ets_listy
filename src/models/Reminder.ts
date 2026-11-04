import mongoose, { type Model, type Types } from "mongoose";
import type { ReminderDTO } from "@/types";

// A person's own reminder for a list: at most one per user and list.
// sentAt stays null until the scheduled job (lib/reminders.ts) picks it up.

export interface IReminder {
  user: Types.ObjectId;
  folder: Types.ObjectId;
  remindAt: Date;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const reminderSchema = new mongoose.Schema<IReminder>(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", required: true },
    remindAt: { type: Date, required: true },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reminderSchema.index({ user: 1, folder: 1 }, { unique: true });
// The job runs every minute, looking for unsent reminders that are due.
reminderSchema.index({ sentAt: 1, remindAt: 1 });
reminderSchema.index({ folder: 1 });

export function serializeReminder(reminder: Pick<IReminder, "remindAt" | "sentAt">): ReminderDTO {
  return { remindAt: reminder.remindAt, sent: reminder.sentAt !== null };
}

// Reuse the compiled model across dev hot reloads.
export const Reminder: Model<IReminder> =
  (mongoose.models.Reminder as Model<IReminder> | undefined) ?? mongoose.model<IReminder>("Reminder", reminderSchema);
