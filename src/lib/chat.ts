import { createHash } from "node:crypto";
import mongoose, { type Types } from "mongoose";
import { CHAT_MIN_PEOPLE } from "@/lib/constants";
import { EVENTS } from "@/lib/channels";
import { jsonError, readJson, readOptionalJson } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { activePeople, leavePresence, touchPresence } from "@/lib/presence";
import { folderAudience, getPusher, publishFolderEvent, publishUserEvent } from "@/lib/realtime";
import { cleanAfter, validateChatMessage, validatePresence } from "@/lib/validators";
import { AUTHOR_NAME, ChatMessage, serializeChatMessage, type ChatMessageDoc } from "@/models/ChatMessage";
import { Folder } from "@/models/Folder";
import { ShareLink, isShareTokenShape } from "@/models/ShareLink";
import type { ChatListResponse, ChatNoticeEvent, PresenceResponse, SessionUser } from "@/types";

// List chat + "who is here", shared by the member routes
// (/api/folders/:id/…) and the guest routes (/api/share/:token/…). The
// routes decide access and who the caller is; everything after that lives
// here so both kinds of caller follow exactly the same rules.

/** Who is calling: a logged-in member or a guest on the share link. */
export interface Chatter {
  /** "u:<userId>" or "g:<hash of guest id>". Never sent to clients. */
  key: string;
  name: string;
  /** Shown to other members in the viewers list; null for guests. */
  email: string | null;
  userId: string | null;
}

export interface ChatFolder {
  _id: Types.ObjectId;
  name: string;
}

export const userChatter = (user: SessionUser): Chatter => ({
  key: `u:${user.id}`,
  name: user.name,
  email: user.email,
  userId: user.id,
});

const asPerson = (me: Chatter) => ({ name: me.name, email: me.email, guest: me.userId === null });

/**
 * A guest is known only by the random id their browser made. It is hashed
 * before use, so the raw id (which lets someone speak as that guest) is
 * never stored; the label ("Guest 3FA2") tells guests apart.
 */
export function guestChatter(guestId: string): Chatter {
  const hash = createHash("sha256").update(guestId).digest("hex");
  return { key: `g:${hash.slice(0, 32)}`, name: `Guest ${hash.slice(0, 4).toUpperCase()}`, email: null, userId: null };
}

/** The list behind an enabled share link (name included, for notices), or null. */
export async function folderForShareToken(token: string): Promise<ChatFolder | null> {
  if (!isShareTokenShape(token)) return null;
  const link = await ShareLink.findOne({ token, enabled: true }).select("folder").lean();
  if (!link) return null;
  return Folder.findById(link.folder).select("name").lean<ChatFolder>();
}

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/** POST …/presence: heartbeat (or { leave: true }) → who is here + newest message time. */
export async function handlePresence(request: Request, folder: ChatFolder, me: Chatter): Promise<Response> {
  const body = await readOptionalJson(request);
  if (body === undefined) return jsonError("Invalid JSON body", 400);
  const result = validatePresence(body);
  if (!result.ok) return jsonError(result.error, 400);

  const folderId = String(folder._id);
  if (result.value.leave) {
    leavePresence(folderId, me.key);
    return new Response(null, { status: 204 });
  }
  if (!touchPresence(folderId, me.key, asPerson(me))) {
    return jsonError("Too many people on this list right now", 429);
  }

  const last = await ChatMessage.findOne({ folder: folder._id }).sort({ createdAt: -1 }).select("createdAt").lean();
  const data: PresenceResponse = {
    // Emails go only to logged-in members (the list's own people), never to link guests.
    people: activePeople(folderId).map((p) => ({
      name: p.name,
      email: me.userId ? p.email : null,
      guest: p.guest,
      me: p.key === me.key,
    })),
    lastMessageAt: last?.createdAt ?? null,
  };
  return Response.json(data, NO_STORE);
}

/** GET …/chat[?after=ISO]: the last messages, or those since `after` (inclusive; clients drop repeats). */
export async function handleChatList(request: Request, folder: ChatFolder, me: Chatter): Promise<Response> {
  const after = cleanAfter(new URL(request.url).searchParams.get("after"));
  if (after === undefined) return jsonError("after must be a date", 400);

  const docs = after
    ? await ChatMessage.find({ folder: folder._id, createdAt: { $gte: after } })
        .sort({ createdAt: 1 })
        .limit(LIMITS.CHAT_HISTORY * 2)
        .populate(AUTHOR_NAME)
        .lean<ChatMessageDoc[]>()
    : (
        await ChatMessage.find({ folder: folder._id })
          .sort({ createdAt: -1 })
          .limit(LIMITS.CHAT_HISTORY)
          .populate(AUTHOR_NAME)
          .lean<ChatMessageDoc[]>()
      ).reverse();

  const data: ChatListResponse = { messages: docs.map((d) => serializeChatMessage(d, me.key)) };
  return Response.json(data, NO_STORE);
}

/**
 * POST …/chat { text }: only while the sender and at least one other person
 * have the list open. The message goes live to members on the folder
 * channel, and as a toast notice to every member except the author.
 */
export async function handleChatPost(
  request: Request,
  folder: ChatFolder,
  me: Chatter,
  socketId?: string
): Promise<Response> {
  const body = await readJson(request);
  if (body === undefined) return jsonError("Invalid JSON body", 400);
  const result = validateChatMessage(body);
  if (!result.ok) return jsonError(result.error, 400);

  const folderId = String(folder._id);
  // Sending counts as being here (the heartbeat may be a few seconds behind).
  touchPresence(folderId, me.key, asPerson(me));
  if (activePeople(folderId).length < CHAT_MIN_PEOPLE) {
    return jsonError(`Chat works when ${CHAT_MIN_PEOPLE} or more people have this list open`, 409);
  }

  const created = await ChatMessage.create({
    folder: folder._id,
    ...(me.userId ? { author: me.userId } : { guestName: me.name }),
    authorKey: me.key,
    text: result.value.text,
  });
  const author = me.userId ? { _id: new mongoose.Types.ObjectId(me.userId), name: me.name } : null;
  const doc: ChatMessageDoc = { ...created.toObject(), author };

  // Live events are best-effort (never throw); everyone else gets mine = false.
  await publishFolderEvent(folderId, EVENTS.chatMessage, serializeChatMessage(doc, null), socketId);
  const notice: ChatNoticeEvent = {
    id: String(created._id),
    folderId,
    folderName: folder.name,
    authorName: me.name,
    text: noticeText(result.value.text),
    createdAt: created.createdAt,
  };
  if (getPusher()) {
    const audience = (await folderAudience(folder._id)).filter((id) => id !== me.userId);
    await publishUserEvent(audience, EVENTS.chatNotice, notice);
  }

  return Response.json(serializeChatMessage(doc, me.key), { status: 201 });
}

/** The start of a message, for toasts. */
export function noticeText(text: string): string {
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}…` : oneLine;
}
