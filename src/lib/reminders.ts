// Server side of reminders: sends the ones that are due as Web Push
// notifications. Called by the scheduled job (/api/cron/reminders).

import type { Types } from "mongoose";
import webpush from "web-push";
import { getFolderAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { vapidSubject } from "@/lib/pushValidators";
import { PushSubscription, type IPushSubscription } from "@/models/PushSubscription";
import { Reminder } from "@/models/Reminder";

/** Bounds one run; anything left goes out in the next one. */
const MAX_PER_RUN = 200;
/** A phone that is off still gets the notification if it comes back within a day. */
const PUSH_TTL_SECONDS = 24 * 60 * 60;
/** Don't keep retrying a reminder that has already become old news. */
const RETRY_WINDOW_MS = 60 * 60_000;

export const isPushConfigured = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && vapidSubject(process.env.VAPID_SUBJECT));

type SendOutcome = "sent" | "gone" | "failed";

async function sendPush(sub: IPushSubscription, payload: string): Promise<SendOutcome> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
      TTL: PUSH_TTL_SECONDS,
      urgency: "high",
      vapidDetails: {
        subject: vapidSubject(process.env.VAPID_SUBJECT) ?? "",
        publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
        privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
      },
    });
    return "sent";
  } catch (err) {
    const status = typeof err === "object" && err !== null && "statusCode" in err ? err.statusCode : undefined;
    // 404 / 410: the user turned notifications off or the app was removed from that device.
    if (status === 404 || status === 410) return "gone";
    // The status only: the error also holds the endpoint, which works like a password for that device.
    // No status means it never reached the push service (bad settings): the error's name still says so.
    console.error("Push failed", status ?? (err instanceof Error ? err.name : "unknown"));
    return "failed";
  }
}

/**
 * Sends every reminder that is due. Each is claimed first (sentAt), so two
 * overlapping runs can't notify twice. If only temporary failures stopped it
 * from reaching anyone, it is released for the next run while still recent.
 */
export async function sendDueReminders(now = new Date()): Promise<{ sent: number }> {
  await connectDB();
  let sent = 0;
  const retry: Types.ObjectId[] = [];
  for (let i = 0; i < MAX_PER_RUN; i++) {
    const reminder = await Reminder.findOneAndUpdate(
      { sentAt: null, remindAt: { $lte: now } },
      { $set: { sentAt: now } },
      { returnDocument: "after", sort: { remindAt: 1 } }
    ).lean();
    if (!reminder) break;

    // Access is checked now, not when it was set: I may have left the list, or it may be gone.
    const access = await getFolderAccess(String(reminder.user), reminder.folder);
    if (!access) {
      await Reminder.deleteOne({ _id: reminder._id });
      continue;
    }

    const payload = JSON.stringify({
      title: "Listy reminder",
      body: access.folder.name,
      url: `/folders/${String(reminder.folder)}`,
    });
    const subs = await PushSubscription.find({ user: reminder.user }).lean();
    const outcomes = await Promise.all(subs.map((sub) => sendPush(sub, payload)));

    const gone = subs.filter((_, index) => outcomes[index] === "gone").map((sub) => sub._id);
    if (gone.length > 0) await PushSubscription.deleteMany({ _id: { $in: gone } });

    if (outcomes.includes("sent")) sent += 1;
    else if (outcomes.includes("failed") && now.getTime() - reminder.remindAt.getTime() < RETRY_WINDOW_MS) {
      retry.push(reminder._id);
    }
  }
  // Only now: released earlier, this same loop would claim them straight back and hammer a failing service.
  if (retry.length > 0) await Reminder.updateMany({ _id: { $in: retry } }, { $set: { sentAt: null } });
  return { sent };
}
